import { CIRCUNFERENCIAS, ENTREPIERNA_TOLERANCIA_X } from './config';
import { contornoCinta, cortePlano, prepararParticion, volumenesSegmento, type Particion, type Vec3 } from './geometria';
import { estatura } from './motor';
import type { CuerpoBase, PesosMorph } from './tipos';

/**
 * Medidas del cuerpo deformado: estatura, volumen total y por segmento,
 * entrepierna y circunferencias de cinta métrica. Todo sale de la malla, no de
 * fórmulas: es lo que el solver (fase 3) compara con los objetivos.
 *
 * Todas las medidas son independientes de la traslación (el solver no apoya el
 * cuerpo en el suelo en cada prueba): la estatura es alto máximo menos mínimo y
 * la entrepierna se mide desde el punto más bajo.
 */
export interface Medidas {
  estaturaCm: number;
  entrepiernaCm: number;
  /** Distancia recta entre las puntas de los hombros (acromion). */
  hombrosCm: number;
  volumenL: number;
  /** Litros por segmento (tronco, cabeza, brazo_izq, brazo_der, pierna_izq, pierna_der). */
  volumenSegmentoL: Record<string, number>;
  /** Circunferencias en cm. */
  circunferenciasCm: Record<string, number>;
}

export interface Anillos {
  /** Puntos 3D de cada contorno (xyz xyz ...), para dibujar los anillos. */
  [nombre: string]: Float32Array;
}

/**
 * Clave de cada medida suelta, para pedir solo las que hacen falta:
 * 'estatura' | 'entrepierna' | 'hombros' (cm), 'volumen' | 'vol:<segmento>' (L),
 * 'circ:<nombre>' (cm).
 */
export type ClaveMedida = string;

/** Distancia máxima (m, medida sobre el eje del plano en la malla base) de un triángulo a la banda para entrar en el corte. */
const FRANJA_CORTE = 0.1;

interface PrepCircunferencia {
  nombre: string;
  banda: Uint32Array;
  bandaAltura?: Uint32Array;
  triangulos: Uint32Array;
  eje?: [number, number];
  holgura: number;
}

/** Lo que se calcula una sola vez por cuerpo (topología, bandas, índices). */
export interface PrepMedicion {
  particion: Particion;
  nombresSegmento: string[];
  circunferencias: PrepCircunferencia[];
  vEntrepierna: number;
  /** Vértices de la punta de cada hombro [izquierdo, derecho]; -1 si el JSON no trae el landmark. */
  vHombros: [number, number];
  articulaciones: { nombres: string[]; base: Float32Array; deltas: Map<string, Float32Array> };
}

export function prepararMedicion(cuerpo: CuerpoBase): PrepMedicion {
  const nombresSegmento = cuerpo.meta.segmentos.nombres;
  const tris = cuerpo.indicesTriangulos;
  const particion = prepararParticion(tris, cuerpo.segmentos, nombresSegmento.length);
  const nombresArt = cuerpo.meta.articulaciones.nombres;

  const circunferencias: PrepCircunferencia[] = [];
  for (const [nombre, def] of Object.entries(CIRCUNFERENCIAS)) {
    const lm = cuerpo.meta.landmarks[def.landmark];
    if (!lm) continue;
    const eje = def.plano === 'eje' && def.eje ? (def.eje.map((n) => nombresArt.indexOf(n)) as [number, number]) : undefined;
    if (eje && (eje[0] < 0 || eje[1] < 0)) throw new Error(`Faltan articulaciones para ${nombre}`);
    const altura = def.alturaDe ? cuerpo.meta.landmarks[def.alturaDe] : undefined;
    if (def.alturaDe && !altura) throw new Error(`El JSON no trae el landmark ${def.alturaDe}; regenera los GLB`);

    // Solo los triángulos de los segmentos permitidos y, en la malla base, a menos
    // de FRANJA_CORTE del plano: el corte recorre unos cientos de triángulos en
    // vez de miles. La franja sigue a la banda porque son los mismos vértices.
    const base = cuerpo.posiciones;
    const banda = Uint32Array.from(lm.vertices);
    const bandaAltura = altura ? Uint32Array.from(altura.vertices) : undefined;
    const c0 = centroide(base, banda);
    if (bandaAltura) c0[1] = centroide(base, bandaAltura)[1];
    const n0 = eje ? ejeArticulaciones(Float32Array.from(cuerpo.meta.articulaciones.base.flat()), eje) : ([0, 1, 0] as Vec3);
    const dist = (v: number) => Math.abs((base[v * 3] - c0[0]) * n0[0] + (base[v * 3 + 1] - c0[1]) * n0[1] + (base[v * 3 + 2] - c0[2]) * n0[2]);
    const permitidos = new Set(def.segmentos.map((s) => nombresSegmento.indexOf(s)));
    const triangulos: number[] = [];
    for (let t = 0; t < particion.triSegmento.length; t++) {
      if (!permitidos.has(particion.triSegmento[t])) continue;
      if (Math.min(dist(tris[t * 3]), dist(tris[t * 3 + 1]), dist(tris[t * 3 + 2])) > FRANJA_CORTE) continue;
      triangulos.push(t);
    }
    circunferencias.push({
      nombre,
      banda,
      bandaAltura,
      triangulos: Uint32Array.from(triangulos),
      eje,
      holgura: def.holgura,
    });
  }

  // Entrepierna: el vértice más bajo de la línea media por encima del 30 % de la
  // estatura (las piernas no tienen vértices en x = 0: el primero es la horcajadura).
  const p = cuerpo.posiciones;
  const alto = estatura(p);
  let vEntrepierna = -1;
  for (let v = 0; v < p.length / 3; v++) {
    if (Math.abs(p[v * 3]) > ENTREPIERNA_TOLERANCIA_X || p[v * 3 + 1] < 0.3 * alto) continue;
    if (vEntrepierna < 0 || p[v * 3 + 1] < p[vEntrepierna * 3 + 1]) vEntrepierna = v;
  }

  // Punta del hombro: de la zona que mueve el target de ancho de hombros, el
  // vértice más alto que queda por fuera de la articulación del hombro.
  const art = cuerpo.meta.articulaciones;
  const vHombros = (['izq', 'der'] as const).map((lado) => {
    const lm = cuerpo.meta.landmarks[`hombro_${lado}`];
    const j = art.nombres.indexOf(lado === 'izq' ? 'joint-l-shoulder' : 'joint-r-shoulder');
    if (!lm || j < 0) return -1;
    const xj = Math.abs(art.base[j][0]);
    let mejor = -1;
    for (const v of lm.vertices) {
      if (Math.abs(p[v * 3]) < xj) continue;
      if (mejor < 0 || p[v * 3 + 1] > p[mejor * 3 + 1]) mejor = v;
    }
    return mejor;
  }) as [number, number];

  const deltas = new Map<string, Float32Array>();
  for (const [morph, lista] of Object.entries(art.deltas)) deltas.set(morph, Float32Array.from(lista.flat()));

  return {
    particion,
    nombresSegmento,
    circunferencias,
    vEntrepierna,
    vHombros,
    articulaciones: { nombres: nombresArt, base: Float32Array.from(art.base.flat()), deltas },
  };
}

/** Articulaciones con los mismos pesos que la malla (y el mismo apoyo en el suelo). */
export function posicionesArticulaciones(prep: PrepMedicion, pesos: PesosMorph, desplazoY: number): Float32Array {
  const out = Float32Array.from(prep.articulaciones.base);
  for (const [nombre, w] of Object.entries(pesos)) {
    if (Math.abs(w) < 1e-4) continue;
    const d = prep.articulaciones.deltas.get(nombre);
    if (!d) continue;
    for (let i = 0; i < out.length; i++) out[i] += w * d[i];
  }
  // La base del JSON ya está apoyada en el suelo; los morphs mueven los pies y
  // aplicarMorphs vuelve a apoyar la malla: se aplica el mismo corrimiento.
  for (let i = 1; i < out.length; i += 3) out[i] += desplazoY;
  return out;
}

function centroide(pos: Float32Array, vs: Uint32Array): Vec3 {
  let x = 0, y = 0, z = 0;
  for (const v of vs) {
    x += pos[v * 3];
    y += pos[v * 3 + 1];
    z += pos[v * 3 + 2];
  }
  return [x / vs.length, y / vs.length, z / vs.length];
}

/** Radio de la banda medido en el plano de corte (distancia máxima al centroide). */
function radioBanda(pos: Float32Array, vs: Uint32Array, c: Vec3, n: Vec3): number {
  let r = 0;
  for (const v of vs) {
    const dx = pos[v * 3] - c[0], dy = pos[v * 3 + 1] - c[1], dz = pos[v * 3 + 2] - c[2];
    const a = dx * n[0] + dy * n[1] + dz * n[2];
    r = Math.max(r, Math.sqrt(Math.max(0, dx * dx + dy * dy + dz * dz - a * a)));
  }
  return r;
}

function ejeArticulaciones(art: Float32Array, [a, b]: [number, number]): Vec3 {
  const d: Vec3 = [art[b * 3] - art[a * 3], art[b * 3 + 1] - art[a * 3 + 1], art[b * 3 + 2] - art[a * 3 + 2]];
  const l = Math.hypot(...d);
  return [d[0] / l, d[1] / l, d[2] / l];
}

function extremosY(pos: Float32Array): [number, number] {
  let min = Infinity, max = -Infinity;
  for (let v = 1; v < pos.length; v += 3) {
    const y = pos[v];
    if (y < min) min = y;
    if (y > max) max = y;
  }
  return [min, max];
}

function circunferencia(tris: ArrayLike<number>, c: PrepCircunferencia, pos: Float32Array, art: Float32Array) {
  const punto = centroide(pos, c.banda);
  if (c.bandaAltura) punto[1] = centroide(pos, c.bandaAltura)[1];
  const normal = c.eje ? ejeArticulaciones(art, c.eje) : ([0, 1, 0] as Vec3);
  const radio = radioBanda(pos, c.banda, punto, normal) * c.holgura + 0.01;
  return contornoCinta(cortePlano(pos, tris as Uint32Array, c.triangulos, punto, normal), punto, normal, radio);
}

/**
 * Mide solo lo pedido (para el solver: cada columna del Jacobiano pide lo que
 * ese parámetro puede cambiar). Devuelve cm y litros, por clave.
 */
export function medirSeleccion(
  cuerpo: CuerpoBase,
  prep: PrepMedicion,
  pos: Float32Array,
  art: Float32Array,
  claves: Iterable<ClaveMedida>,
): Record<ClaveMedida, number> {
  const out: Record<ClaveMedida, number> = {};
  const tris = cuerpo.indicesTriangulos;
  let y: [number, number] | null = null;
  let vol: Float64Array | null = null;
  for (const k of claves) {
    if (k === 'estatura' || k === 'entrepierna') {
      y ??= extremosY(pos);
      out[k] = k === 'estatura' ? (y[1] - y[0]) * 100 : prep.vEntrepierna >= 0 ? (pos[prep.vEntrepierna * 3 + 1] - y[0]) * 100 : NaN;
    } else if (k === 'volumen' || k.startsWith('vol:')) {
      vol ??= volumenesSegmento(pos, tris, prep.particion);
      if (k === 'volumen') out[k] = vol.reduce((a, b) => a + b, 0) * 1000;
      else out[k] = vol[prep.nombresSegmento.indexOf(k.slice(4))] * 1000;
    } else if (k === 'hombros') {
      const [a, b] = prep.vHombros;
      out[k] = a < 0 || b < 0 ? NaN : Math.hypot(pos[a * 3] - pos[b * 3], pos[a * 3 + 1] - pos[b * 3 + 1], pos[a * 3 + 2] - pos[b * 3 + 2]) * 100;
    } else if (k.startsWith('circ:')) {
      const c = prep.circunferencias.find((x) => x.nombre === k.slice(5));
      out[k] = c ? circunferencia(tris, c, pos, art).perimetro * 100 : NaN;
    }
  }
  return out;
}

/**
 * Mide la malla ya deformada. `pos` son las posiciones del cuerpo apoyado en el
 * suelo; `articulaciones` las de posicionesArticulaciones() con los mismos pesos.
 */
export function medir(
  cuerpo: CuerpoBase,
  prep: PrepMedicion,
  pos: Float32Array,
  articulaciones: Float32Array,
  conAnillos = false,
): { medidas: Medidas; anillos: Anillos } {
  const tris = cuerpo.indicesTriangulos;
  const claves = ['estatura', 'entrepierna', 'hombros', 'volumen', ...prep.nombresSegmento.map((n) => `vol:${n}`)];
  const m = medirSeleccion(cuerpo, prep, pos, articulaciones, claves);
  const volumenSegmentoL: Record<string, number> = {};
  for (const n of prep.nombresSegmento) volumenSegmentoL[n] = m[`vol:${n}`];

  const circunferenciasCm: Record<string, number> = {};
  const anillos: Anillos = {};
  for (const c of prep.circunferencias) {
    const contorno = circunferencia(tris, c, pos, articulaciones);
    circunferenciasCm[c.nombre] = contorno.perimetro * 100;
    if (conAnillos) anillos[c.nombre] = contorno.anillo;
  }

  return {
    medidas: {
      estaturaCm: m.estatura,
      entrepiernaCm: m.entrepierna,
      hombrosCm: m.hombros,
      volumenL: m.volumen,
      volumenSegmentoL,
      circunferenciasCm,
    },
    anillos,
  };
}
