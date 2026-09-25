import { PARAMETROS_AJUSTE, SEMILLAS_AJUSTE, type DefParametro } from './config';
import { MACRO_INICIAL, controlesLocales, pesosLocales, pesosMacro, type ControlLocal, type ControlesMacro } from './controles';
import { medirSeleccion, posicionesArticulaciones, type ClaveMedida, type PrepMedicion } from './medicion';
import { aplicarMorphs } from './motor';
import type { CuerpoBase, PesosMorph } from './tipos';

/**
 * Solver de la fase 3: busca los valores de los controles (macro de MakeHuman y
 * morphs locales, cada uno dentro de su rango) para que las medidas de la malla
 * coincidan con los objetivos (estatura, volumen, circunferencias...).
 *
 * Levenberg-Marquardt con límites (se proyecta cada paso al rango), Jacobiano
 * por diferencias finitas y regularización hacia un cuerpo promedio: cada
 * control que se aleja de su valor inicial paga un costo, así que los que
 * ningún objetivo pide quedan quietos y no aparecen cuerpos deformes.
 *
 * Velocidad: aplicar los morphs es lineal, así que cada columna del Jacobiano
 * parte de las posiciones actuales y suma solo el delta del control que cambia;
 * y solo se vuelve a medir lo que ese control puede mover (un morph del brazo no
 * cambia la cintura).
 */

export type FuenteObjetivo = 'cinta' | 'scanner' | 'estimado';

export interface Objetivo {
  /** Qué medida de la malla se compara (ver ClaveMedida). */
  clave: ClaveMedida;
  etiqueta: string;
  /** Valor buscado, en cm o litros. */
  valor: number;
  /** Desvío que se considera "un error normal": el residuo es (medido − valor) / sigma. */
  sigma: number;
  /** Criterio de aceptación: |medido − valor| ≤ tolerancia. */
  tolerancia: number;
  unidad: 'cm' | 'L';
  fuente: FuenteObjetivo;
}

export interface EntradaAjuste {
  objetivos: Objetivo[];
  /** Macros que no se ajustan (edad y copa vienen de los datos o quedan en su valor). */
  fijos: { edad: number; copa?: number };
  /** Valores iniciales / previos por clave de parámetro ('macro:musculo', 'local:barriga'...). */
  priors?: Record<string, number>;
  /** Cuánto cuesta alejarse del prior, si difiere del de config (p. ej. barriga con dato de grasa visceral). */
  lambdas?: Record<string, number>;
  /** Tope de iteraciones. */
  maxIteraciones?: number;
}

export interface Residuo {
  clave: ClaveMedida;
  etiqueta: string;
  unidad: 'cm' | 'L';
  fuente: FuenteObjetivo;
  objetivo: number;
  medido: number;
  diferencia: number;
  tolerancia: number;
  cumple: boolean;
}

export interface ResultadoAjuste {
  macro: ControlesMacro;
  locales: Record<string, number>;
  residuos: Residuo[];
  cumple: boolean;
  iteraciones: number;
  evaluaciones: number;
  ms: number;
}

/* ------------------------------------------------------------- Parámetros */

interface Parametro extends DefParametro {
  /** Morphs cuyo peso cambia cuando cambia este parámetro. */
  morphs: string[];
}

function parametrosDe(cuerpo: CuerpoBase, controles: ControlLocal[]): Parametro[] {
  const existe = new Set(controles.map((c) => c.clave));
  const out: Parametro[] = [];
  for (const def of PARAMETROS_AJUSTE) {
    if (def.solo && def.solo !== cuerpo.sexo) continue;
    const [tipo, clave] = def.clave.split(':');
    let morphs: string[];
    if (tipo === 'macro') {
      morphs =
        clave === 'altura'
          ? ['macro_altura_min', 'macro_altura_max']
          : clave === 'proporciones'
            ? ['macro_proporciones_ideales']
            : cuerpo.morphs.map((m) => m.nombre).filter((n) => n.startsWith('macro_musculo_'));
    } else {
      if (!existe.has(clave)) continue;
      morphs = [`${clave}_mas`, `${clave}_menos`, clave].filter((n) => cuerpo.indiceMorph.has(n));
    }
    out.push({ ...def, morphs });
  }
  return out;
}

/** Vector de parámetros -> controles del visor. */
function aControles(params: Parametro[], x: Float64Array, fijos: EntradaAjuste['fijos']) {
  const macro: ControlesMacro = { ...MACRO_INICIAL, edad: fijos.edad, copa: fijos.copa ?? MACRO_INICIAL.copa };
  const locales: Record<string, number> = {};
  params.forEach((p, i) => {
    const [tipo, clave] = p.clave.split(':');
    if (tipo === 'macro') (macro as unknown as Record<string, number>)[clave] = x[i];
    else locales[clave] = x[i];
  });
  return { macro, locales };
}

/* ---------------------------------------------------- Álgebra (n ≤ ~30) */

/** Resuelve A·x = b (A simétrica definida positiva) por eliminación con pivoteo parcial. */
function resolver(A: Float64Array[], b: Float64Array): Float64Array | null {
  const n = b.length;
  const M = A.map((f, i) => {
    const r = new Float64Array(n + 1);
    r.set(f);
    r[n] = b[i];
    return r;
  });
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
    if (Math.abs(M[piv][c]) < 1e-14) return null;
    [M[c], M[piv]] = [M[piv], M[c]];
    for (let r = c + 1; r < n; r++) {
      const f = M[r][c] / M[c][c];
      if (f === 0) continue;
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  const x = new Float64Array(n);
  for (let r = n - 1; r >= 0; r--) {
    let s = M[r][n];
    for (let k = r + 1; k < n; k++) s -= M[r][k] * x[k];
    x[r] = s / M[r][r];
  }
  return x;
}

/* ------------------------------------------------------------------ Solver */

/** Qué vértices mira cada medida (para saber qué columnas del Jacobiano la mueven). */
function verticesDeMedida(cuerpo: CuerpoBase, prep: PrepMedicion, clave: ClaveMedida): Set<number> | 'todos' {
  if (clave.startsWith('circ:')) {
    const c = prep.circunferencias.find((x) => x.nombre === clave.slice(5));
    if (!c) return new Set();
    const s = new Set<number>(c.banda);
    c.bandaAltura?.forEach((v) => s.add(v));
    const tris = cuerpo.indicesTriangulos;
    for (const t of c.triangulos) s.add(tris[t * 3]).add(tris[t * 3 + 1]).add(tris[t * 3 + 2]);
    return s;
  }
  if (clave === 'hombros') return new Set(prep.vHombros);
  return 'todos'; // estatura, entrepierna y volúmenes: baratos, se miden siempre
}

export function ajustar(cuerpo: CuerpoBase, prep: PrepMedicion, entrada: EntradaAjuste): ResultadoAjuste {
  const t0 = performance.now();
  const controles = controlesLocales(cuerpo.meta);
  const params = parametrosDe(cuerpo, controles);
  const objetivos = entrada.objetivos.filter((o) => Number.isFinite(o.valor));
  const n = params.length;
  const claves = objetivos.map((o) => o.clave);

  // Dependencias parámetro -> medidas (por los vértices que mueven sus morphs,
  // y por las articulaciones que definen el eje de brazos y piernas).
  const depende: ClaveMedida[][] = params.map(() => []);
  const soporte = objetivos.map((o) => verticesDeMedida(cuerpo, prep, o.clave));
  const ejeDe = (clave: ClaveMedida) => prep.circunferencias.find((c) => `circ:${c.nombre}` === clave)?.eje;
  const mueveArticulacion = (morph: string, a: number) => {
    const d = prep.articulaciones.deltas.get(morph);
    return !!d && Math.hypot(d[a * 3], d[a * 3 + 1], d[a * 3 + 2]) > 1e-6;
  };
  params.forEach((p, j) => {
    const mueve = new Set<number>();
    for (const nombre of p.morphs) {
      const i = cuerpo.indiceMorph.get(nombre);
      if (i !== undefined) cuerpo.morphs[i].indices.forEach((v) => mueve.add(v));
    }
    objetivos.forEach((o, k) => {
      const s = soporte[k];
      const mueveEje = ejeDe(o.clave)?.some((a) => p.morphs.some((m) => mueveArticulacion(m, a))) ?? false;
      if (s === 'todos' || mueveEje || [...s].some((v) => mueve.has(v))) depende[j].push(o.clave);
    });
  });

  // Triángulos que toca cada parámetro local: su cambio de volumen se calcula
  // sumando solo esos (los macro mueven todo: volumen completo).
  const tris = cuerpo.indicesTriangulos;
  const nV = cuerpo.posiciones.length / 3;
  const triangulosDe: (Uint32Array | null)[] = params.map((p) => {
    const mueve = new Uint8Array(nV);
    let n = 0;
    for (const nombre of p.morphs) {
      const i = cuerpo.indiceMorph.get(nombre);
      if (i === undefined) continue;
      for (const v of cuerpo.morphs[i].indices) if (!mueve[v]) (mueve[v] = 1), n++;
    }
    if (n > nV * 0.4) return null;
    const ts: number[] = [];
    for (let t = 0; t < tris.length / 3; t++) if (mueve[tris[t * 3]] || mueve[tris[t * 3 + 1]] || mueve[tris[t * 3 + 2]]) ts.push(t);
    return Uint32Array.from(ts);
  });
  const volumenTriangulos = (p: Float32Array, ts: Uint32Array) => {
    let s6 = 0;
    for (const t of ts) {
      const a = tris[t * 3] * 3, b = tris[t * 3 + 1] * 3, c = tris[t * 3 + 2] * 3;
      s6 +=
        p[a] * (p[b + 1] * p[c + 2] - p[b + 2] * p[c + 1]) -
        p[a + 1] * (p[b] * p[c + 2] - p[b + 2] * p[c]) +
        p[a + 2] * (p[b] * p[c + 1] - p[b + 1] * p[c]);
    }
    return (s6 / 6) * 1000;
  };

  const prior = (p: Parametro) => entrada.priors?.[p.clave] ?? p.prior;
  const lambda = (p: Parametro) => entrada.lambdas?.[p.clave] ?? p.lambda;
  const pesosDe = (x: Float64Array): PesosMorph => {
    const c = aControles(params, x, entrada.fijos);
    return { ...pesosMacro(c.macro, cuerpo.sexo), ...pesosLocales(c.locales, controles) };
  };

  let evaluaciones = 0;
  const pos = new Float32Array(cuerpo.posiciones.length);
  const posJ = new Float32Array(cuerpo.posiciones.length);

  /** Residuos: primero los objetivos, después la regularización. */
  const residuos = (x: Float64Array, medidas: Record<string, number>) => {
    const r = new Float64Array(objetivos.length + n);
    objetivos.forEach((o, k) => (r[k] = (medidas[o.clave] - o.valor) / o.sigma));
    params.forEach((p, j) => (r[objetivos.length + j] = (lambda(p) * (x[j] - prior(p))) / p.escala));
    return r;
  };
  const costo = (r: Float64Array) => r.reduce((a, b) => a + b * b, 0);

  const evaluar = (x: Float64Array, destino = pos) => {
    evaluaciones++;
    const pesos = pesosDe(x);
    aplicarMorphs(cuerpo, pesos, destino);
    const art = posicionesArticulaciones(prep, pesos, 0);
    const medidas = medirSeleccion(cuerpo, prep, destino, art, claves);
    return { pesos, medidas, r: residuos(x, medidas) };
  };

  // Punto de partida: el mejor de unas pocas semillas de músculo x peso (el
  // paisaje de MakeHuman tiene varios valles en esos dos macros).
  const inicial = new Float64Array(params.map((p) => prior(p)));
  let x = inicial;
  let actual = evaluar(x);
  for (const [m, w] of SEMILLAS_AJUSTE) {
    const s = Float64Array.from(inicial);
    params.forEach((p, j) => {
      if (p.clave === 'macro:musculo') s[j] = m;
      if (p.clave === 'macro:peso') s[j] = w;
    });
    const e = evaluar(s);
    // Sin la regularización de la semilla: se compara solo cuánto se acerca.
    const c = costo(e.r.subarray(0, objetivos.length));
    if (c < costo(actual.r.subarray(0, objetivos.length))) {
      x = s;
      actual = e;
    }
  }

  const H = 0.01;
  const jacobiano = (xa: Float64Array, ev: ReturnType<typeof evaluar>) => {
    aplicarMorphs(cuerpo, ev.pesos, pos);
    const J = objetivos.map(() => new Float64Array(n));
    params.forEach((p, j) => {
      const paso = xa[j] + H <= p.max ? H : -H;
      const xs = Float64Array.from(xa);
      xs[j] += paso;
      const pesos = pesosDe(xs);
      // Posiciones = actuales + Σ (peso nuevo − peso actual)·Δ, solo de los morphs de este parámetro.
      posJ.set(pos);
      for (const nombre of p.morphs) {
        const dw = (pesos[nombre] ?? 0) - (ev.pesos[nombre] ?? 0);
        if (dw === 0) continue;
        const m = cuerpo.morphs[cuerpo.indiceMorph.get(nombre)!];
        for (let k = 0; k < m.indices.length; k++) {
          const v = m.indices[k] * 3;
          posJ[v] += dw * m.deltas[k * 3];
          posJ[v + 1] += dw * m.deltas[k * 3 + 1];
          posJ[v + 2] += dw * m.deltas[k * 3 + 2];
        }
      }
      if (!depende[j].length) return;
      evaluaciones++;
      const ts = triangulosDe[j];
      const pedir = ts ? depende[j].filter((k) => k !== 'volumen') : depende[j];
      const med = medirSeleccion(cuerpo, prep, posJ, posicionesArticulaciones(prep, pesos, 0), pedir);
      if (ts && depende[j].includes('volumen')) med.volumen = ev.medidas.volumen + volumenTriangulos(posJ, ts) - volumenTriangulos(pos, ts);
      objetivos.forEach((o, k) => {
        if (o.clave in med) J[k][j] = (med[o.clave] - ev.medidas[o.clave]) / o.sigma / paso;
      });
    });
    // Filas de la regularización: diagonal constante.
    return J;
  };

  let mu = 1e-2;
  let iteraciones = 0;
  let convergio = false;
  let seguidasEnObjetivo = 0;
  let J = jacobiano(x, actual);
  const maxIt = entrada.maxIteraciones ?? 30;
  while (iteraciones < maxIt) {
    iteraciones++;
    const r = actual.r;
    // Ecuaciones normales con la regularización (Jr = diag(λ/escala)).
    const A = Array.from({ length: n }, () => new Float64Array(n));
    const g = new Float64Array(n);
    for (let k = 0; k < objetivos.length; k++) {
      const f = J[k];
      for (let i = 0; i < n; i++) {
        if (f[i] === 0) continue;
        g[i] += f[i] * r[k];
        for (let j2 = 0; j2 < n; j2++) A[i][j2] += f[i] * f[j2];
      }
    }
    params.forEach((p, i) => {
      const d = lambda(p) / p.escala;
      A[i][i] += d * d;
      g[i] += d * r[objetivos.length + i];
    });

    let aceptado = false;
    while (mu < 1e8) {
      const Am = A.map((f, i) => {
        const c = Float64Array.from(f);
        c[i] += mu * (A[i][i] + 1e-6);
        return c;
      });
      const delta = resolver(Am, g.map((v) => -v));
      if (!delta) {
        mu *= 10;
        continue;
      }
      const xn = Float64Array.from(x, (v, i) => Math.min(params[i].max, Math.max(params[i].min, v + delta[i])));
      const nuevo = evaluar(xn);
      if (costo(nuevo.r) < costo(r)) {
        const mejora = costo(r) - costo(nuevo.r);
        const dx = Math.max(...xn.map((v, i) => Math.abs(v - x[i])));
        x = xn;
        actual = nuevo;
        mu = Math.max(1e-7, mu / 3);
        aceptado = true;
        // Se corta cuando ya no mejora, o cuando todos los objetivos están a
        // menos de medio sigma (muy dentro de la tolerancia) y lo que queda es
        // pulir la regularización, que no se ve.
        const rel = mejora / (costo(r) + 1e-12);
        let enObjetivo = true;
        for (let k = 0; k < objetivos.length; k++) if (Math.abs(nuevo.r[k]) > 0.5) enObjetivo = false;
        seguidasEnObjetivo = enObjetivo ? seguidasEnObjetivo + 1 : 0;
        let cumpleTodo = true;
        for (let k = 0; k < objetivos.length; k++) {
          if (Math.abs(nuevo.r[k] * objetivos[k].sigma) > objetivos[k].tolerancia * 0.8) cumpleTodo = false;
        }
        convergio = rel < 1e-4 || dx < 1e-4 || (enObjetivo && rel < 0.02) || seguidasEnObjetivo >= 3 || (cumpleTodo && rel < 0.005);
        break;
      }
      mu *= 4;
    }
    if (!aceptado || convergio) break;
    J = jacobiano(x, actual);
  }

  const { macro, locales } = aControles(params, x, entrada.fijos);
  const lista: Residuo[] = objetivos.map((o) => {
    const medido = actual.medidas[o.clave];
    const diferencia = medido - o.valor;
    return {
      clave: o.clave,
      etiqueta: o.etiqueta,
      unidad: o.unidad,
      fuente: o.fuente,
      objetivo: o.valor,
      medido,
      diferencia,
      tolerancia: o.tolerancia,
      cumple: Math.abs(diferencia) <= o.tolerancia,
    };
  });
  return {
    macro,
    locales,
    residuos: lista,
    cumple: lista.every((r) => r.cumple),
    iteraciones,
    evaluaciones,
    ms: performance.now() - t0,
  };
}

/* ------------------------------------------------- Cuerpo sin grasa (vista) */

/** Densidades de Siri (kg/L): grasa y masa libre de grasa. */
export const DENSIDAD_GRASA = 0.9007;
export const DENSIDAD_MAGRA = 1.1;

/** Fracción del VOLUMEN del cuerpo que es grasa, dado el % de grasa en peso. */
export function fraccionVolumenGrasa(pctGrasa: number): number {
  const g = pctGrasa / DENSIDAD_GRASA;
  const m = (100 - pctGrasa) / DENSIDAD_MAGRA;
  return g / (g + m);
}

/**
 * Controles del cuerpo sin grasa: los mismos del cuerpo completo (músculo,
 * altura, hombros...), sin los morphs de grasa que suman volumen y con el peso
 * de MakeHuman bajado hasta que el volumen sea el de la masa libre de grasa.
 * La fase 4 lo reemplaza por un ajuste a la masa magra de cada segmento.
 */
export function controlesSinGrasa(
  cuerpo: CuerpoBase,
  macro: ControlesMacro,
  locales: Record<string, number>,
  volumenMagroL: number,
  destino?: Float32Array,
): { macro: ControlesMacro; locales: Record<string, number>; pos: Float32Array } {
  const controles = controlesLocales(cuerpo.meta);
  const loc: Record<string, number> = {};
  for (const c of controles) {
    const v = locales[c.clave] ?? 0;
    const esGrasa = c.grupo === 'grasa' || c.clave.endsWith('_grasa') || ['cintura', 'cadera', 'pecho', 'cuello', 'barriga'].includes(c.clave);
    loc[c.clave] = esGrasa ? Math.min(v, 0) : v;
  }
  const pos = destino ?? new Float32Array(cuerpo.posiciones.length);
  const vol = (peso: number) => {
    const m = { ...macro, peso };
    aplicarMorphs(cuerpo, { ...pesosMacro(m, cuerpo.sexo), ...pesosLocales(loc, controles) }, pos);
    return volumenL(cuerpo, pos);
  };
  // Bisección sobre el peso de MakeHuman entre 0 y el del cuerpo completo.
  let lo = 0;
  let hi = macro.peso;
  if (vol(lo) >= volumenMagroL) hi = lo;
  else if (vol(hi) > volumenMagroL) {
    for (let i = 0; i < 14; i++) {
      const mid = (lo + hi) / 2;
      if (vol(mid) > volumenMagroL) hi = mid;
      else lo = mid;
    }
  }
  const final = { ...macro, peso: hi };
  aplicarMorphs(cuerpo, { ...pesosMacro(final, cuerpo.sexo), ...pesosLocales(loc, controles) }, pos);
  return { macro: final, locales: loc, pos };
}

function volumenL(cuerpo: CuerpoBase, pos: Float32Array): number {
  const t = cuerpo.indicesTriangulos;
  let s = 0;
  for (let i = 0; i < t.length; i += 3) {
    const a = t[i] * 3, b = t[i + 1] * 3, c = t[i + 2] * 3;
    s +=
      pos[a] * (pos[b + 1] * pos[c + 2] - pos[b + 2] * pos[c + 1]) -
      pos[a + 1] * (pos[b] * pos[c + 2] - pos[b + 2] * pos[c]) +
      pos[a + 2] * (pos[b] * pos[c + 1] - pos[b + 1] * pos[c]);
  }
  return (s / 6) * 1000;
}
