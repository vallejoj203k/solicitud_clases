import { normalesVertice, type Indices } from './geometria';
import type { Malla } from './motor.worker';
import type { CuerpoBase } from './tipos';

/**
 * Cómo se muestra el cuerpo (no cambia nada de lo que se mide):
 *
 * 1. Estatua: la cabeza se suaviza (Taubin, que no encoge), los pezones se
 *    borran y las cuencas de los ojos (la malla no trae globos oculares) se
 *    cierran con un ojo liso, como en una escultura (ver `ojos`).
 * 2. Una subdivisión de Loop: cada triángulo en cuatro y todos los vértices
 *    promediados con sus vecinos. Con 13 000 vértices se veían las facetas en
 *    el contorno y en el pecho; con 53 000 la superficie queda lisa.
 *
 * Los dos pasos son lineales en las posiciones, así que se precalculan como
 * matrices dispersas y cada cuerpo nuevo sale de multiplicar.
 */

export interface Pulido {
  /** Vértices del cuerpo original y de la malla que se muestra. */
  nOriginal: number;
  nTotal: number;
  /** Triángulos de la malla que se muestra. */
  indices: Uint32Array;
  /** Subdivisión: fila v = suma de peso * vértice original (CSR). */
  sub: Dispersa;
  /** Zonas que se alisan, en orden. */
  zonas: Zona[];
}

/**
 * Una zona de alisado: vértices que se mueven (con su peso) y sus vecinos.
 * 'relleno' es Laplaciano puro (rellena huecos como las cuencas de los ojos);
 * 'taubin' alterna λ y μ para quitar detalle sin encoger.
 */
interface Zona {
  vertices: Uint32Array;
  peso: Float32Array;
  vecinos: Dispersa;
  pasadas: number;
  modo: 'relleno' | 'taubin';
}

interface Dispersa {
  inicio: Uint32Array;
  col: Uint32Array;
  peso: Float32Array;
}

const LAMBDA = 0.5;
const MU = -0.53;
/** Toda la cabeza, suave (orejas, labios, párpados). */
const PASADAS_CABEZA = 10;
/** Pezones: radio (m) alrededor del punto más adelantado de cada pecho. */
const PEZON_RADIO = 0.05;
const PASADAS_PEZON = 30;

function vecinosDe(tris: Indices, n: number) {
  const vecinos: number[][] = Array.from({ length: n }, () => []);
  for (let t = 0; t < tris.length; t += 3) {
    for (let k = 0; k < 3; k++) {
      const a = tris[t + k];
      const b = tris[t + ((k + 1) % 3)];
      if (!vecinos[a].includes(b)) vecinos[a].push(b);
      if (!vecinos[b].includes(a)) vecinos[b].push(a);
    }
  }
  return vecinos;
}

function aDispersa(filas: [number, number][][]): Dispersa {
  const inicio = new Uint32Array(filas.length + 1);
  let nnz = 0;
  filas.forEach((f, i) => {
    inicio[i] = nnz;
    nnz += f.length;
  });
  inicio[filas.length] = nnz;
  const col = new Uint32Array(nnz);
  const peso = new Float32Array(nnz);
  let k = 0;
  for (const f of filas) {
    for (const [c, w] of f) {
      col[k] = c;
      peso[k] = w;
      k++;
    }
  }
  return { inicio, col, peso };
}

/**
 * Subdivisión de Loop de una malla de triángulos (con reglas de borde, aunque
 * la del cuerpo es cerrada). Devuelve la matriz y los triángulos nuevos: los
 * vértices originales conservan su índice y los de las aristas van después.
 */
export function subdivisionLoop(tris: Indices, n: number) {
  const vecinos = vecinosDe(tris, n);
  // Aristas: clave -> índice nuevo, y los vértices opuestos de sus triángulos.
  const arista = new Map<number, number>();
  const opuestos: number[][] = [];
  const extremos: [number, number][] = [];
  const clave = (a: number, b: number) => (a < b ? a * n + b : b * n + a);
  const nuevos = new Uint32Array(tris.length * 4);
  for (let t = 0; t < tris.length; t += 3) {
    const v = [tris[t], tris[t + 1], tris[t + 2]];
    const m: number[] = [];
    for (let k = 0; k < 3; k++) {
      const a = v[k];
      const b = v[(k + 1) % 3];
      const c = v[(k + 2) % 3];
      const kk = clave(a, b);
      let e = arista.get(kk);
      if (e === undefined) {
        e = extremos.length;
        arista.set(kk, e);
        extremos.push([a, b]);
        opuestos.push([]);
      }
      opuestos[e].push(c);
      m.push(n + e);
    }
    // m[0] entre v0-v1, m[1] entre v1-v2, m[2] entre v2-v0 (mismo sentido de giro).
    nuevos.set([v[0], m[0], m[2], m[0], v[1], m[1], m[2], m[1], v[2], m[0], m[1], m[2]], (t / 3) * 12);
  }
  const borde = new Set<number>();
  extremos.forEach(([a, b], e) => {
    if (opuestos[e].length !== 2) {
      borde.add(a);
      borde.add(b);
    }
  });
  const filas: [number, number][][] = [];
  for (let v = 0; v < n; v++) {
    const vs = vecinos[v];
    if (borde.has(v)) {
      const enBorde = vs.filter((w) => opuestos[arista.get(clave(v, w))!].length !== 2);
      filas.push([[v, 3 / 4], ...enBorde.map((w): [number, number] => [w, 1 / 8 / Math.max(1, enBorde.length / 2)])]);
    } else {
      const k = vs.length;
      const beta = k > 3 ? 3 / (8 * k) : 3 / 16;
      filas.push([[v, 1 - k * beta], ...vs.map((w): [number, number] => [w, beta])]);
    }
  }
  extremos.forEach(([a, b], e) => {
    const op = opuestos[e];
    filas.push(op.length === 2 ? [[a, 3 / 8], [b, 3 / 8], [op[0], 1 / 8], [op[1], 1 / 8]] : [[a, 1 / 2], [b, 1 / 2]]);
  });
  return { sub: aDispersa(filas), indices: nuevos, nTotal: n + extremos.length, vecinos };
}

const cache = new WeakMap<CuerpoBase, Pulido>();

/** Prepara (una vez por cuerpo base) la subdivisión y el alisado de la cara. */
export function prepararPulido(cuerpo: CuerpoBase): Pulido {
  let p = cache.get(cuerpo);
  if (p) return p;
  const n = cuerpo.posiciones.length / 3;
  const { sub, indices, nTotal, vecinos } = subdivisionLoop(cuerpo.indicesTriangulos, n);

  const pos = cuerpo.posiciones;
  const meta = cuerpo.meta;
  const art = (nombre: string) => meta.articulaciones.base[meta.articulaciones.nombres.indexOf(nombre)];
  const zona = (pesos: Map<number, number>, pasadas: number, modo: Zona['modo']): Zona => {
    const vertices = [...pesos.keys()];
    return {
      vertices: Uint32Array.from(vertices),
      peso: Float32Array.from(vertices.map((v) => pesos.get(v)!)),
      vecinos: aDispersa(vertices.map((v) => vecinos[v].map((w): [number, number] => [w, 1 / vecinos[v].length]))),
      pasadas,
      modo,
    };
  };
  const suave = (t: number) => {
    const x = Math.min(1, Math.max(0, t));
    return x * x * (3 - 2 * x);
  };

  // Cabeza: desde un poco sobre la base del cuello.
  const cabeza = meta.segmentos.nombres.indexOf('cabeza');
  const yCuello = art('joint-neck')[1];
  const pCabeza = new Map<number, number>();
  for (let v = 0; v < n; v++) {
    if (cuerpo.segmentos[v] !== cabeza) continue;
    const w = suave((pos[v * 3 + 1] - (yCuello + 0.03)) / 0.06);
    if (w > 0) pCabeza.set(v, w);
  }

  // Pezones: el punto más adelantado de cada lado del pecho.
  const bajoBusto = meta.landmarks.bajo_busto?.vertices ?? [];
  const pecho = meta.landmarks.pecho?.vertices ?? [];
  const media = (vs: number[]) => vs.reduce((s_, v) => s_ + pos[v * 3 + 1], 0) / Math.max(1, vs.length);
  const [yBajo, yPecho] = [media(bajoBusto), media(pecho)];
  const pPezon = new Map<number, number>();
  for (const lado of [1, -1]) {
    let mejor = -1;
    for (let v = 0; v < n; v++) {
      const y = pos[v * 3 + 1];
      if (cuerpo.segmentos[v] === cabeza || pos[v * 3] * lado < 0.04 || y < yBajo - 0.03 || y > yPecho + 0.06) continue;
      if (mejor < 0 || pos[v * 3 + 2] > pos[mejor * 3 + 2]) mejor = v;
    }
    if (mejor < 0) continue;
    for (let v = 0; v < n; v++) {
      const d = Math.hypot(pos[v * 3] - pos[mejor * 3], pos[v * 3 + 1] - pos[mejor * 3 + 1], pos[v * 3 + 2] - pos[mejor * 3 + 2]);
      if (d < PEZON_RADIO) pPezon.set(v, suave((PEZON_RADIO - d) / (PEZON_RADIO * 0.6)));
    }
  }

  p = {
    nOriginal: n,
    nTotal,
    indices,
    sub,
    zonas: [zona(pCabeza, PASADAS_CABEZA, 'taubin'), zona(pPezon, PASADAS_PEZON, 'relleno')],
  };
  cache.set(cuerpo, p);
  return p;
}

function multiplicar(m: Dispersa, src: ArrayLike<number>, k: number, dst: Float32Array<ArrayBuffer>) {
  const filas = m.inicio.length - 1;
  for (let f = 0; f < filas; f++) {
    for (let c = 0; c < k; c++) dst[f * k + c] = 0;
    for (let j = m.inicio[f]; j < m.inicio[f + 1]; j++) {
      const w = m.peso[j];
      const o = m.col[j] * k;
      for (let c = 0; c < k; c++) dst[f * k + c] += w * src[o + c];
    }
  }
  return dst;
}

/** Posiciones que se muestran: cara alisada y subdivididas. */
export function pulirPosiciones(p: Pulido, pos: ArrayLike<number>, dst: Float32Array<ArrayBuffer> = new Float32Array(p.nTotal * 3)) {
  const q = Float32Array.from(pos);
  for (const z of p.zonas) alisar(z, q);
  return multiplicar(p.sub, q, 3, dst);
}

function alisar({ vertices, peso, vecinos, pasadas, modo }: Zona, q: Float32Array) {
  const d = new Float32Array(vertices.length * 3);
  const vueltas = modo === 'taubin' ? pasadas * 2 : pasadas;
  for (let it = 0; it < vueltas; it++) {
    const f = modo === 'taubin' && it % 2 === 1 ? MU : LAMBDA;
    for (let i = 0; i < vertices.length; i++) {
      const v = vertices[i];
      let x = 0;
      let y = 0;
      let z = 0;
      for (let j = vecinos.inicio[i]; j < vecinos.inicio[i + 1]; j++) {
        const o = vecinos.col[j] * 3;
        x += vecinos.peso[j] * q[o];
        y += vecinos.peso[j] * q[o + 1];
        z += vecinos.peso[j] * q[o + 2];
      }
      d[i * 3] = x - q[v * 3];
      d[i * 3 + 1] = y - q[v * 3 + 1];
      d[i * 3 + 2] = z - q[v * 3 + 2];
    }
    for (let i = 0; i < vertices.length; i++) {
      const v = vertices[i];
      const w = f * peso[i];
      q[v * 3] += w * d[i * 3];
      q[v * 3 + 1] += w * d[i * 3 + 1];
      q[v * 3 + 2] += w * d[i * 3 + 2];
    }
  }
}

/**
 * Vértices de la cuenca de cada ojo en la malla hm08 de MakeHuman (iguales en
 * hombre y mujer): los que rodean al globo ocular, a ~1,2 cm de su centro.
 */
const CUENCAS = [
  Array.from({ length: 21 }, (_, i) => 7773 + i), // izquierdo (+X)
  Array.from({ length: 21 }, (_, i) => 1081 + i), // derecho
];

/** Centro y radio de cada ojo: la esfera que mejor ajusta los vértices de su cuenca. */
export function ojos(pos: ArrayLike<number>): { centro: [number, number, number]; radio: number }[] {
  return CUENCAS.map((vs) => {
    // Ajuste algebraico: |p|² = 2 c·p + k, resuelto por mínimos cuadrados (4×4).
    const A = Array.from({ length: 4 }, () => new Float64Array(4));
    const b = new Float64Array(4);
    for (const v of vs) {
      const fila = [2 * pos[v * 3], 2 * pos[v * 3 + 1], 2 * pos[v * 3 + 2], 1];
      const f = pos[v * 3] ** 2 + pos[v * 3 + 1] ** 2 + pos[v * 3 + 2] ** 2;
      for (let i = 0; i < 4; i++) {
        b[i] += fila[i] * f;
        for (let j = 0; j < 4; j++) A[i][j] += fila[i] * fila[j];
      }
    }
    const x = resolver(A, b);
    const c: [number, number, number] = [x[0], x[1], x[2]];
    const r = Math.sqrt(Math.max(0, x[3] + c[0] ** 2 + c[1] ** 2 + c[2] ** 2));
    return { centro: c, radio: Math.min(0.0135, Math.max(0.009, r)) };
  });
}

/** Gauss con pivoteo parcial (sistemas chicos). */
function resolver(A: Float64Array[], b: Float64Array) {
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

/** Un atributo por vértice (espesor de grasa, colores) llevado a la malla que se muestra. */
export function pulirAtributo(p: Pulido, valores: ArrayLike<number>, k: number, dst: Float32Array<ArrayBuffer> = new Float32Array(p.nTotal * k)) {
  return multiplicar(p.sub, valores, k, dst);
}

/** Malla que se muestra: posiciones pulidas y sus normales. */
export function pulirMalla(p: Pulido, malla: Malla): Malla {
  const pos = pulirPosiciones(p, malla.pos);
  return { pos, normales: normalesVertice(pos, p.indices) };
}
