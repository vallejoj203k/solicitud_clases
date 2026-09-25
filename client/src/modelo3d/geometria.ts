/**
 * Geometría pura sobre arrays planos (xyz xyz ...). Sin three.js: corre igual en
 * el Worker y en los tests.
 */

export type Indices = Uint16Array | Uint32Array | number[];
export type Vec3 = [number, number, number];

/** Normales suaves por vértice, ponderadas por área (como computeVertexNormals). */
export function normalesVertice(pos: Float32Array, tris: Indices, destino?: Float32Array): Float32Array {
  const n = destino ?? new Float32Array(pos.length);
  n.fill(0);
  for (let t = 0; t < tris.length; t += 3) {
    const a = tris[t] * 3;
    const b = tris[t + 1] * 3;
    const c = tris[t + 2] * 3;
    const e1x = pos[b] - pos[a], e1y = pos[b + 1] - pos[a + 1], e1z = pos[b + 2] - pos[a + 2];
    const e2x = pos[c] - pos[a], e2y = pos[c + 1] - pos[a + 1], e2z = pos[c + 2] - pos[a + 2];
    const cx = e1y * e2z - e1z * e2y;
    const cy = e1z * e2x - e1x * e2z;
    const cz = e1x * e2y - e1y * e2x;
    for (const v of [a, b, c]) {
      n[v] += cx;
      n[v + 1] += cy;
      n[v + 2] += cz;
    }
  }
  for (let v = 0; v < n.length; v += 3) {
    const l = Math.hypot(n[v], n[v + 1], n[v + 2]) || 1;
    n[v] /= l;
    n[v + 1] /= l;
    n[v + 2] /= l;
  }
  return n;
}

/** det(a, b, c) = a · (b × c): seis veces el volumen con signo del tetraedro (0, a, b, c). */
function det(ax: number, ay: number, az: number, bx: number, by: number, bz: number, cx: number, cy: number, cz: number) {
  return ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx);
}

/** Volumen (m³) de una malla cerrada y orientada hacia afuera: suma de tetraedros con signo. */
export function volumenMalla(pos: Float32Array, tris: Indices): number {
  let s = 0;
  for (let t = 0; t < tris.length; t += 3) {
    const a = tris[t] * 3;
    const b = tris[t + 1] * 3;
    const c = tris[t + 2] * 3;
    s += det(pos[a], pos[a + 1], pos[a + 2], pos[b], pos[b + 1], pos[b + 2], pos[c], pos[c + 1], pos[c + 2]);
  }
  return s / 6;
}

/* ------------------------------------------------ Volumen por segmento */

/**
 * Topología para partir el volumen por segmentos (se calcula una vez).
 *
 * Cada triángulo va al segmento de la mayoría de sus vértices. Las aristas
 * donde cambia el segmento forman la "junta" entre dos segmentos; cada junta se
 * tapa con un abanico hacia su centroide. El vecino tapa la misma junta con la
 * orientación contraria, así que las tapas se cancelan y la suma de los
 * segmentos es exactamente el volumen total. Como la junta son siempre los
 * mismos vértices, el corte es consistente con cualquier combinación de morphs.
 */
export interface Particion {
  nSegmentos: number;
  /** Segmento de cada triángulo. */
  triSegmento: Uint8Array;
  /** Aristas de junta: [u, v] orientadas como en el triángulo del segmento `lado`. */
  juntaU: Uint32Array;
  juntaV: Uint32Array;
  juntaSegmento: Uint8Array;
  /** Junta (par de segmentos) de cada arista. */
  juntaId: Uint16Array;
  /** Vértices de cada junta (para su centroide). */
  verticesJunta: Uint32Array[];
}

export function prepararParticion(tris: Indices, segVertice: ArrayLike<number>, nSegmentos: number): Particion {
  const nTris = tris.length / 3;
  const triSegmento = new Uint8Array(nTris);
  for (let t = 0; t < nTris; t++) {
    const a = segVertice[tris[t * 3]];
    const b = segVertice[tris[t * 3 + 1]];
    const c = segVertice[tris[t * 3 + 2]];
    triSegmento[t] = b === c ? b : a;
  }

  // Arista dirigida u->v del triángulo t. Una arista es de junta si el triángulo
  // del otro lado (que la recorre v->u) es de otro segmento.
  const dueno = new Map<number, number>();
  const clave = (u: number, v: number) => u * 1_048_576 + v;
  for (let t = 0; t < nTris; t++) {
    for (let k = 0; k < 3; k++) {
      dueno.set(clave(tris[t * 3 + k], tris[t * 3 + ((k + 1) % 3)]), t);
    }
  }
  const us: number[] = [];
  const vs: number[] = [];
  const lados: number[] = [];
  const ids: number[] = [];
  const pares = new Map<number, number>();
  const vertices: Set<number>[] = [];
  for (let t = 0; t < nTris; t++) {
    for (let k = 0; k < 3; k++) {
      const u = tris[t * 3 + k];
      const v = tris[t * 3 + ((k + 1) % 3)];
      const otro = dueno.get(clave(v, u));
      if (otro === undefined) continue; // borde abierto: no debería haber en el cuerpo
      const sa = triSegmento[t];
      const sb = triSegmento[otro];
      if (sa === sb) continue;
      const par = Math.min(sa, sb) * 256 + Math.max(sa, sb);
      let id = pares.get(par);
      if (id === undefined) {
        id = pares.size;
        pares.set(par, id);
        vertices.push(new Set());
      }
      us.push(u);
      vs.push(v);
      lados.push(sa);
      ids.push(id);
      vertices[id].add(u).add(v);
    }
  }
  return {
    nSegmentos,
    triSegmento,
    juntaU: Uint32Array.from(us),
    juntaV: Uint32Array.from(vs),
    juntaSegmento: Uint8Array.from(lados),
    juntaId: Uint16Array.from(ids),
    verticesJunta: vertices.map((s) => Uint32Array.from(s)),
  };
}

/** Volumen (m³) de cada segmento. Suman exactamente volumenMalla(). */
export function volumenesSegmento(pos: Float32Array, tris: Indices, p: Particion): Float64Array {
  const vol = volumenTriangulosPorSegmento(pos, tris, p);
  const tapas = volumenTapas(pos, p);
  for (let s = 0; s < vol.length; s++) vol[s] += tapas[s];
  return vol;
}

/**
 * Parte de los triángulos del volumen de cada segmento (m³). Con `triangulos`,
 * solo esos (para calcular un cambio de volumen cuando se mueven pocos vértices).
 */
export function volumenTriangulosPorSegmento(pos: Float32Array, tris: Indices, p: Particion, triangulos?: ArrayLike<number>): Float64Array {
  const vol = new Float64Array(p.nSegmentos);
  const n = triangulos ? triangulos.length : p.triSegmento.length;
  for (let i = 0; i < n; i++) {
    const t = triangulos ? triangulos[i] : i;
    const a = tris[t * 3] * 3;
    const b = tris[t * 3 + 1] * 3;
    const c = tris[t * 3 + 2] * 3;
    vol[p.triSegmento[t]] += det(pos[a], pos[a + 1], pos[a + 2], pos[b], pos[b + 1], pos[b + 2], pos[c], pos[c + 1], pos[c + 2]) / 6;
  }
  return vol;
}

/** Parte de las tapas de las juntas del volumen de cada segmento (m³). Se cancelan entre vecinos. */
export function volumenTapas(pos: Float32Array, p: Particion): Float64Array {
  const vol = new Float64Array(p.nSegmentos);
  const centros = p.verticesJunta.map((vs) => {
    let x = 0, y = 0, z = 0;
    for (const v of vs) {
      x += pos[v * 3];
      y += pos[v * 3 + 1];
      z += pos[v * 3 + 2];
    }
    return [x / vs.length, y / vs.length, z / vs.length];
  });
  // Tapa: triángulo (v, u, centro), orientado hacia afuera del segmento.
  for (let e = 0; e < p.juntaU.length; e++) {
    const u = p.juntaU[e] * 3;
    const v = p.juntaV[e] * 3;
    const [cx, cy, cz] = centros[p.juntaId[e]];
    vol[p.juntaSegmento[e]] += det(pos[v], pos[v + 1], pos[v + 2], pos[u], pos[u + 1], pos[u + 2], cx, cy, cz) / 6;
  }
  return vol;
}

/* -------------------------------------------------------- Circunferencias */

/**
 * Puntos donde el plano (punto, normal) corta las aristas de los triángulos
 * dados. `triangulos` son índices de triángulo (no de vértice).
 */
export function cortePlano(pos: Float32Array, tris: Indices, triangulos: ArrayLike<number>, punto: Vec3, normal: Vec3): number[] {
  const [px, py, pz] = punto;
  const [nx, ny, nz] = normal;
  const out: number[] = [];
  const d = (v: number) => (pos[v] - px) * nx + (pos[v + 1] - py) * ny + (pos[v + 2] - pz) * nz;
  for (let i = 0; i < triangulos.length; i++) {
    const t = triangulos[i] * 3;
    const vs = [tris[t] * 3, tris[t + 1] * 3, tris[t + 2] * 3];
    const ds = [d(vs[0]), d(vs[1]), d(vs[2])];
    for (let k = 0; k < 3; k++) {
      const a = vs[k], b = vs[(k + 1) % 3];
      const da = ds[k], db = ds[(k + 1) % 3];
      // Semiabierto para no contar dos veces un vértice justo sobre el plano.
      if ((da < 0) === (db < 0)) continue;
      const f = da / (da - db);
      out.push(pos[a] + f * (pos[b] - pos[a]), pos[a + 1] + f * (pos[b + 1] - pos[a + 1]), pos[a + 2] + f * (pos[b + 2] - pos[a + 2]));
    }
  }
  return out;
}

/** Dos vectores unitarios perpendiculares a la normal (y entre sí). */
export function basePlano(normal: Vec3): [Vec3, Vec3] {
  const [nx, ny, nz] = normal;
  const ref: Vec3 = Math.abs(ny) < 0.9 ? [0, 1, 0] : [0, 0, 1];
  let u: Vec3 = [ny * ref[2] - nz * ref[1], nz * ref[0] - nx * ref[2], nx * ref[1] - ny * ref[0]];
  const lu = Math.hypot(...u);
  u = [u[0] / lu, u[1] / lu, u[2] / lu];
  const v: Vec3 = [ny * u[2] - nz * u[1], nz * u[0] - nx * u[2], nx * u[1] - ny * u[0]];
  return [u, v];
}

/** Envolvente convexa 2D (cadena monótona). Devuelve índices en orden antihorario. */
export function envolvente2D(xs: ArrayLike<number>, ys: ArrayLike<number>): number[] {
  const idx = Array.from({ length: xs.length }, (_, i) => i).sort((a, b) => xs[a] - xs[b] || ys[a] - ys[b]);
  if (idx.length < 3) return idx;
  const cruz = (o: number, a: number, b: number) => (xs[a] - xs[o]) * (ys[b] - ys[o]) - (ys[a] - ys[o]) * (xs[b] - xs[o]);
  const inferior: number[] = [];
  for (const i of idx) {
    while (inferior.length >= 2 && cruz(inferior[inferior.length - 2], inferior[inferior.length - 1], i) <= 0) inferior.pop();
    inferior.push(i);
  }
  const superior: number[] = [];
  for (let k = idx.length - 1; k >= 0; k--) {
    const i = idx[k];
    while (superior.length >= 2 && cruz(superior[superior.length - 2], superior[superior.length - 1], i) <= 0) superior.pop();
    superior.push(i);
  }
  return inferior.slice(0, -1).concat(superior.slice(0, -1));
}

export interface Contorno {
  /** Perímetro de la envolvente convexa (m): lo que mide una cinta métrica. */
  perimetro: number;
  /** Puntos 3D de la envolvente, en orden (xyz xyz ...). */
  anillo: Float32Array;
}

/**
 * Perímetro de "cinta métrica" de un corte: envolvente convexa de los puntos de
 * corte, proyectados al plano. Si se da `radioMax`, se descartan los puntos más
 * lejos que eso del punto del plano (otras partes del cuerpo cortadas por el
 * mismo plano infinito).
 */
export function contornoCinta(puntos: number[], punto: Vec3, normal: Vec3, radioMax = Infinity): Contorno {
  const [u, v] = basePlano(normal);
  const xs: number[] = [];
  const ys: number[] = [];
  const cerca: number[] = [];
  for (let i = 0; i < puntos.length; i += 3) {
    const dx = puntos[i] - punto[0], dy = puntos[i + 1] - punto[1], dz = puntos[i + 2] - punto[2];
    const x = dx * u[0] + dy * u[1] + dz * u[2];
    const y = dx * v[0] + dy * v[1] + dz * v[2];
    if (Math.hypot(x, y) > radioMax) continue;
    xs.push(x);
    ys.push(y);
    cerca.push(i);
  }
  const h = envolvente2D(xs, ys);
  let perimetro = 0;
  for (let k = 0; k < h.length && h.length > 1; k++) {
    const a = h[k], b = h[(k + 1) % h.length];
    perimetro += Math.hypot(xs[b] - xs[a], ys[b] - ys[a]);
  }
  const anillo = new Float32Array(h.length * 3);
  h.forEach((k, j) => anillo.set(puntos.slice(cerca[k], cerca[k] + 3), j * 3));
  return { perimetro, anillo };
}
