/**
 * Referencia de la escultura: los controles de MakeHuman (macros y locales) con
 * los que el cuerpo de MakeHuman calza mejor sobre la escultura.
 *
 * El visor muestra la escultura movida con la diferencia entre el cuerpo del
 * cliente y ESTE cuerpo de referencia (no el cuerpo base promedio). Así la
 * escultura queda tal cual cuando el cliente es como ella, y las medidas que se
 * escriben (cm, kg) se ven en el modelo casi 1 a 1: si la referencia fuera el
 * cuerpo promedio, lo que la escultura tiene de más (brazos, muslos, pecho) se
 * quedaba pegado como un extra fijo.
 *
 * Ajuste de superficie: minimiza Σ |cuerpo(controles) − calzado|² sobre los
 * vértices de MakeHuman, donde "calzado" es el cuerpo base deformado sobre la
 * escultura (cuerpo base + calce, de tools/export_escultura.py), con un poco de
 * regularización hacia los valores base. Levenberg-Marquardt con Jacobiano por
 * diferencias finitas y límites de cada control.
 *
 * Uso (desde la raíz, después de export_escultura.py):
 *   npx vite-node tools/referencia_escultura.ts
 *   npm run modelo3d:escultura
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { desdeGltf } from '../client/src/modelo3d/cargar';
import { ajustar, type Objetivo } from '../client/src/modelo3d/ajuste';
import { PARAMETROS_AJUSTE, TOLERANCIAS } from '../client/src/modelo3d/config';
import { controlesLocales, MACRO_INICIAL, pesosLocales, pesosMacro, type ControlesMacro } from '../client/src/modelo3d/controles';
import { aplicarMorphs } from '../client/src/modelo3d/motor';
import { medir, posicionesArticulaciones, prepararMedicion } from '../client/src/modelo3d/medicion';
import type { MetaCuerpo, Sexo } from '../client/src/modelo3d/tipos';

const RAIZ = new URL('..', import.meta.url).pathname;
/** Peso de cada vértice de la cabeza (su forma en la escultura es de maniquí). */
const PESO_CABEZA = 0.2;
/** Regularización hacia los valores base (por control, en unidades del control). */
const LAMBDA = 1e-4;
const ITERACIONES = 25;

async function cargarCuerpo(sexo: Sexo) {
  const etiqueta = sexo === 'M' ? 'hombre' : 'mujer';
  const b = readFileSync(`${RAIZ}client/public/modelo3d/cuerpo-${etiqueta}.glb`);
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const g = await loader.parseAsync(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer, '');
  const meta = JSON.parse(readFileSync(`${RAIZ}client/public/modelo3d/cuerpo-${etiqueta}.json`, 'utf8')) as MetaCuerpo;
  return desdeGltf(sexo, g.scene, meta);
}

async function referencia(sexo: Sexo) {
  const cuerpo = await cargarCuerpo(sexo);
  const locales = controlesLocales(cuerpo.meta);
  const cab = JSON.parse(readFileSync(`${RAIZ}tools/build/escultura-${sexo}.json`, 'utf8')) as { calce: number[] };
  const calzado = Float32Array.from(cuerpo.posiciones, (x, i) => x + cab.calce[i] / 10000);
  const n = cuerpo.posiciones.length / 3;
  const cabeza = cuerpo.meta.segmentos.nombres.indexOf('cabeza');
  const pesoV = Float32Array.from({ length: n }, (_, v) => (cuerpo.segmentos[v] === cabeza ? PESO_CABEZA : 1));

  // Parámetros: los del ajuste (sin los de otro sexo) + la copa en la mujer.
  const defs = PARAMETROS_AJUSTE.filter((d) => !d.solo || d.solo === sexo).map((d) => ({ clave: d.clave, min: d.min, max: d.max }));
  if (sexo === 'F') defs.push({ clave: 'macro:copa', min: 0, max: 1 });
  const inicio = defs.map((d) => {
    const [tipo, k] = d.clave.split(':');
    return tipo === 'macro' ? (MACRO_INICIAL as unknown as Record<string, number>)[k] : 0;
  });

  const cuerpoDe = (x: number[]) => {
    const macro: ControlesMacro = { ...MACRO_INICIAL };
    const loc: Record<string, number> = {};
    defs.forEach((d, j) => {
      const [tipo, k] = d.clave.split(':');
      if (tipo === 'macro') (macro as unknown as Record<string, number>)[k] = x[j];
      else loc[k] = x[j];
    });
    return { macro, locales: loc, pos: aplicarMorphs(cuerpo, { ...pesosMacro(macro, sexo), ...pesosLocales(loc, locales) }) };
  };
  // Brazos y piernas: la escultura tiene otra pose (brazos más abiertos) y
  // MakeHuman no cambia de pose con sus controles. Cada extremidad del calzado se
  // alinea (rotación y traslación, sin escala) sobre la del cuerpo antes de
  // comparar: se ajustan forma y tamaño, no la pose.
  const extremidades = ['brazo_izq', 'brazo_der', 'pierna_izq', 'pierna_der'].map((nombre) => {
    const k = cuerpo.meta.segmentos.nombres.indexOf(nombre);
    return Uint32Array.from({ length: n }, (_, v) => v).filter((v) => cuerpo.segmentos[v] === k);
  });
  const objetivoDe = (pos: Float32Array) => {
    const t = Float32Array.from(calzado);
    for (const vs of extremidades) {
      const R = alinear(calzado, pos, vs);
      for (const v of vs) {
        const p = [calzado[v * 3] - R.ca[0], calzado[v * 3 + 1] - R.ca[1], calzado[v * 3 + 2] - R.ca[2]];
        for (let c = 0; c < 3; c++) t[v * 3 + c] = R.cb[c] + R.m[c * 3] * p[0] + R.m[c * 3 + 1] * p[1] + R.m[c * 3 + 2] * p[2];
      }
    }
    return t;
  };
  const residuo = (pos: Float32Array) => {
    const t = objetivoDe(pos);
    const r = new Float64Array(n * 3);
    for (let v = 0; v < n; v++) for (let c = 0; c < 3; c++) r[v * 3 + c] = pesoV[v] * (pos[v * 3 + c] - t[v * 3 + c]);
    return r;
  };
  const costo = (r: Float64Array, x: number[]) => r.reduce((s, e) => s + e * e, 0) + LAMBDA * x.reduce((s, e, j) => s + (e - inicio[j]) ** 2, 0) * n;

  let x = inicio.slice();
  let r = residuo(cuerpoDe(x).pos);
  let c = costo(r, x);
  let mu = 1e-3;
  const P = defs.length;
  for (let it = 0; it < ITERACIONES; it++) {
    // Jacobiano por diferencias centrales (recortadas a los límites).
    const J: Float64Array[] = [];
    for (let j = 0; j < P; j++) {
      const h = 0.02;
      const xa = x.slice();
      const xb = x.slice();
      xa[j] = Math.min(defs[j].max, x[j] + h);
      xb[j] = Math.max(defs[j].min, x[j] - h);
      const ra = residuo(cuerpoDe(xa).pos);
      const rb = residuo(cuerpoDe(xb).pos);
      const d = xa[j] - xb[j] || 1;
      J.push(Float64Array.from(ra, (e, i) => (e - rb[i]) / d));
    }
    const JtJ = Array.from({ length: P }, (_, a) => Array.from({ length: P }, (_, b) => J[a].reduce((s, e, i) => s + e * J[b][i], 0)));
    const Jtr = Array.from({ length: P }, (_, a) => J[a].reduce((s, e, i) => s + e * r[i], 0) + LAMBDA * n * (x[a] - inicio[a]));
    let mejoro = false;
    for (let intento = 0; intento < 8; intento++) {
      const A = JtJ.map((fila, a) => fila.map((e, b) => e + (a === b ? LAMBDA * n + mu * (JtJ[a][a] + 1e-9) : 0)));
      const paso = resolver(A, Jtr.map((e) => -e));
      const xn = x.map((e, j) => Math.min(defs[j].max, Math.max(defs[j].min, e + paso[j])));
      const rn = residuo(cuerpoDe(xn).pos);
      const cn = costo(rn, xn);
      if (cn < c) {
        x = xn;
        r = rn;
        const mejora = (c - cn) / c;
        c = cn;
        mu = Math.max(mu / 3, 1e-7);
        mejoro = mejora > 1e-4;
        break;
      }
      mu *= 4;
    }
    if (!mejoro) break;
  }
  // Segunda etapa, por medidas: se mide la escultura (extremidades en la pose del
  // cuerpo) y el mismo solver que usan los clientes busca el cuerpo con esas
  // medidas. Se repite porque los planos de medida dependen del cuerpo.
  const prep = prepararMedicion(cuerpo);
  let ref = cuerpoDe(x);
  const medirAmbos = () => {
    const pesos = { ...pesosMacro(ref.macro, sexo), ...pesosLocales(ref.locales, locales) };
    const art = posicionesArticulaciones(prep, pesos, 0);
    const t = objetivoDe(ref.pos);
    return { mr: medir(cuerpo, prep, ref.pos, art, false).medidas, me: medir(cuerpo, prep, t, art, false).medidas };
  };
  let mejor = { cumplen: -1, ref };
  for (let vuelta = 0; vuelta < 3; vuelta++) {
    const { me } = medirAmbos();
    const objetivos: Objetivo[] = [
      { clave: 'estatura', etiqueta: 'Estatura', valor: me.estaturaCm, unidad: 'cm', fuente: 'scanner', ...TOLERANCIAS.estatura },
      { clave: 'volumen', etiqueta: 'Volumen', valor: me.volumenL, unidad: 'L', fuente: 'scanner', sigma: TOLERANCIAS.volumen.sigma * me.volumenL, tolerancia: TOLERANCIAS.volumen.tolerancia * me.volumenL },
      { clave: 'hombros', etiqueta: 'Hombros', valor: me.hombrosCm, unidad: 'cm', fuente: 'cinta', ...TOLERANCIAS.cinta },
      { clave: 'entrepierna', etiqueta: 'Entrepierna', valor: me.entrepiernaCm, unidad: 'cm', fuente: 'cinta', ...TOLERANCIAS.cinta },
      ...Object.entries(me.circunferenciasCm).map(([k, v]): Objetivo => ({ clave: `circ:${k}`, etiqueta: k, valor: v, unidad: 'cm', fuente: 'cinta', ...TOLERANCIAS.cinta })),
      ...['brazo_izq', 'brazo_der', 'pierna_izq', 'pierna_der'].map((k): Objetivo => {
        const v = me.volumenSegmentoL[k];
        return { clave: `vol:${k}`, etiqueta: k, valor: v, unidad: 'L', fuente: 'scanner', sigma: TOLERANCIAS.segmento.sigma * v, tolerancia: TOLERANCIAS.segmento.tolerancia * v };
      }),
    ];
    const inicial: Record<string, number> = {};
    for (const [k, v] of Object.entries(ref.macro)) inicial[`macro:${k}`] = v;
    for (const [k, v] of Object.entries(ref.locales)) inicial[`local:${k}`] = v;
    const r = ajustar(cuerpo, prep, { objetivos, fijos: { edad: MACRO_INICIAL.edad, copa: ref.macro.copa }, inicial, maxIteraciones: 60 });
    ref = { macro: r.macro, locales: r.locales, pos: aplicarMorphs(cuerpo, { ...pesosMacro(r.macro, sexo), ...pesosLocales(r.locales, locales) }) };
    const cumplen = r.residuos.filter((q) => q.cumple).length;
    console.log(`  ${sexo}: vuelta ${vuelta + 1}: ${cumplen}/${r.residuos.length} medidas dentro de tolerancia`);
    if (cumplen > mejor.cumplen) mejor = { cumplen, ref };
  }
  ref = mejor.ref;
  const { mr, me } = medirAmbos();
  console.log(`  ${sexo}: medidas referencia / escultura:`, [
    `estatura ${mr.estaturaCm.toFixed(0)}/${me.estaturaCm.toFixed(0)}`,
    `volumen ${mr.volumenL.toFixed(1)}/${me.volumenL.toFixed(1)} L`,
    `hombros ${mr.hombrosCm.toFixed(1)}/${me.hombrosCm.toFixed(1)}`,
    ...Object.keys(mr.circunferenciasCm).map((k) => `${k} ${mr.circunferenciasCm[k].toFixed(1)}/${me.circunferenciasCm[k].toFixed(1)}`),
  ].join(', '));
  const final = ref;
  writeFileSync(`${RAIZ}tools/build/escultura-${sexo}-referencia.json`, JSON.stringify({ macro: final.macro, locales: final.locales }));
}

/**
 * Rotación y traslación que mejor llevan los vértices `vs` de `a` sobre los de
 * `b` (Horn, cuaterniones): m (3×3 por filas), centros ca y cb.
 */
function alinear(a: Float32Array, b: Float32Array, vs: Uint32Array) {
  const ca = [0, 0, 0];
  const cb = [0, 0, 0];
  for (const v of vs) for (let c = 0; c < 3; c++) {
    ca[c] += a[v * 3 + c] / vs.length;
    cb[c] += b[v * 3 + c] / vs.length;
  }
  const S = new Array(9).fill(0);
  for (const v of vs) {
    const p = [a[v * 3] - ca[0], a[v * 3 + 1] - ca[1], a[v * 3 + 2] - ca[2]];
    const q = [b[v * 3] - cb[0], b[v * 3 + 1] - cb[1], b[v * 3 + 2] - cb[2]];
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) S[i * 3 + j] += p[i] * q[j];
  }
  const [xx, xy, xz, yx, yy, yz, zx, zy, zz] = S;
  const N = [
    [xx + yy + zz, yz - zy, zx - xz, xy - yx],
    [yz - zy, xx - yy - zz, xy + yx, zx + xz],
    [zx - xz, xy + yx, -xx + yy - zz, yz + zy],
    [xy - yx, zx + xz, yz + zy, -xx - yy + zz],
  ];
  // Autovector del autovalor mayor (iteración de potencia con corrimiento).
  const corr = Math.abs(xx) + Math.abs(yy) + Math.abs(zz) + Math.abs(xy) + Math.abs(xz) + Math.abs(yx) + Math.abs(yz) + Math.abs(zx) + Math.abs(zy);
  let q = [1, 0, 0, 0];
  for (let it = 0; it < 200; it++) {
    const nq = N.map((f, i) => f.reduce((s, e, j) => s + e * q[j], 0) + corr * q[i]);
    const l = Math.hypot(...nq) || 1;
    q = nq.map((e) => e / l);
  }
  const [w, x, y, z] = q;
  const m = [
    w * w + x * x - y * y - z * z, 2 * (x * y - w * z), 2 * (x * z + w * y),
    2 * (x * y + w * z), w * w - x * x + y * y - z * z, 2 * (y * z - w * x),
    2 * (x * z - w * y), 2 * (y * z + w * x), w * w - x * x - y * y + z * z,
  ];
  return { m, ca, cb };
}

/** Gauss con pivoteo parcial. */
function resolver(A: number[][], b: number[]) {
  const n = b.length;
  const M = A.map((f, i) => [...f, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let f = c + 1; f < n; f++) if (Math.abs(M[f][c]) > Math.abs(M[p][c])) p = f;
    [M[c], M[p]] = [M[p], M[c]];
    for (let f = c + 1; f < n; f++) {
      const k = M[f][c] / M[c][c];
      for (let j = c; j <= n; j++) M[f][j] -= k * M[c][j];
    }
  }
  const x = new Array<number>(n).fill(0);
  for (let f = n - 1; f >= 0; f--) {
    let s = M[f][n];
    for (let j = f + 1; j < n; j++) s -= M[f][j] * x[j];
    x[f] = s / M[f][f];
  }
  return x;
}

for (const s of ['M', 'F'] as Sexo[]) await referencia(s);
