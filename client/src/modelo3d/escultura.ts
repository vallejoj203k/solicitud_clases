import type { BufferGeometry, Mesh } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { normalesVertice, type Indices } from './geometria';
import type { Sexo } from './tipos';

/**
 * Cuerpo esculpido (Muscle_Male / Muscle_Female) atado al cuerpo de MakeHuman.
 *
 * Cada vértice de la escultura guarda un triángulo del cuerpo, un punto en él
 * (baricéntricas), una altura sobre la normal y un residuo tangente en metros
 * (ver tools/export_escultura.py). Rearmado sobre el cuerpo del cliente, la
 * escultura toma su estatura, su volumen y su forma, y conserva el relieve de
 * los músculos. Cabeza, manos y pies se mueven enteros (una semejanza por
 * pieza, estimada con los vértices de su zona), mezclados con el
 * atado según el peso del esqueleto.
 */
export interface Escultura {
  sexo: Sexo;
  nTotal: number;
  indices: Uint32Array;
  /** Posición de cada vértice en la escultura calzada (para las piezas enteras). */
  original: Float32Array;
  /** Pieza (0 ninguna; 1 cabeza, 2-3 manos, 4-5 pies) y su peso en cada vértice. */
  pieza: Uint8Array;
  peso: Float32Array;
  /** Por pieza: vértices del cuerpo que la anclan y su posición calzada. */
  regiones: { vertices: number[]; calzado: number[] }[];
  tri: Uint16Array;
  b1: Float32Array;
  b2: Float32Array;
  h: Float32Array;
  c1: Float32Array;
  c2: Float32Array;
}

const ARCHIVO: Record<Sexo, string> = { M: 'escultura-hombre', F: 'escultura-mujer' };
const cache = new Map<Sexo, Promise<Escultura>>();

/** Descarga la escultura de un sexo (una vez por sesión). */
export function cargarEscultura(sexo: Sexo): Promise<Escultura> {
  let p = cache.get(sexo);
  if (!p) {
    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    const base = `/modelo3d/${ARCHIVO[sexo]}`;
    p = Promise.all([
      loader.loadAsync(`${base}.glb`),
      fetch(`${base}.json`).then((r) => {
        if (!r.ok) throw new Error(`No se pudo cargar ${base}.json`);
        return r.json() as Promise<{ regiones: Escultura['regiones'] }>;
      }),
    ]).then(([gltf, meta]) => {
      let malla: Mesh | undefined;
      gltf.scene.traverse((o) => {
        if ((o as Mesh).isMesh) malla = o as Mesh;
      });
      if (!malla) throw new Error('El GLB de la escultura no trae malla');
      return desdeGeometria(sexo, malla.geometry as BufferGeometry, meta.regiones);
    });
    p.catch(() => cache.delete(sexo));
    cache.set(sexo, p);
  }
  return p;
}

/** Arma la escultura a partir de la geometría del GLB (separado para probarlo en Node). */
export function desdeGeometria(sexo: Sexo, geo: BufferGeometry, regiones: Escultura['regiones']): Escultura {
  const atado = geo.getAttribute('_atado').array as Uint16Array;
  const desp = geo.getAttribute('_desp').array as Float32Array;
  const n = atado.length / 4;
  const e: Escultura = {
    sexo,
    nTotal: n,
    indices: Uint32Array.from(geo.getIndex()!.array as ArrayLike<number>),
    original: Float32Array.from(geo.getAttribute('position').array as ArrayLike<number>),
    pieza: new Uint8Array(n),
    peso: new Float32Array(n),
    regiones,
    tri: new Uint16Array(n),
    b1: new Float32Array(n),
    b2: new Float32Array(n),
    h: new Float32Array(n),
    c1: new Float32Array(n),
    c2: new Float32Array(n),
  };
  for (let v = 0; v < n; v++) {
    e.tri[v] = atado[v * 4];
    e.b1[v] = atado[v * 4 + 1] / 65535;
    e.b2[v] = atado[v * 4 + 2] / 65535;
    e.h[v] = desp[v * 4];
    e.c1[v] = desp[v * 4 + 1];
    e.c2[v] = desp[v * 4 + 2];
    e.pieza[v] = atado[v * 4 + 3];
    e.peso[v] = desp[v * 4 + 3];
  }
  return e;
}

const canonicosCache = new WeakMap<object, Uint32Array>();

/**
 * Cada triángulo empezando por su vértice menor (mismo sentido de giro): la
 * compresión meshopt de los índices puede rotar los vértices de un triángulo, y
 * el atado usa esta forma.
 */
export function triangulosCanonicos(tris: Indices): Uint32Array {
  let out = canonicosCache.get(tris);
  if (!out) {
    out = new Uint32Array(tris.length);
    for (let t = 0; t < tris.length; t += 3) {
      const k = tris[t] <= tris[t + 1] && tris[t] <= tris[t + 2] ? 0 : tris[t + 1] <= tris[t + 2] ? 1 : 2;
      for (let i = 0; i < 3; i++) out[t + i] = tris[t + ((k + i) % 3)];
    }
    canonicosCache.set(tris, out);
  }
  return out;
}

/** Posiciones de la escultura sobre un cuerpo (posiciones por vértice de MakeHuman). */
export function posicionesEscultura(e: Escultura, trisCuerpo: Indices, pos: ArrayLike<number>, destino: Float32Array<ArrayBuffer>) {
  const tris = triangulosCanonicos(trisCuerpo);
  const nor = normalesVertice(Float32Array.from(pos), tris);
  const afines = e.regiones.map((r) => afinDe(r, pos));
  for (let v = 0; v < e.nTotal; v++) {
    const t = e.tri[v] * 3;
    const a = tris[t] * 3;
    const b = tris[t + 1] * 3;
    const c = tris[t + 2] * 3;
    const w1 = e.b1[v];
    const w2 = e.b2[v];
    const w0 = 1 - w1 - w2;
    let nx = w0 * nor[a] + w1 * nor[b] + w2 * nor[c];
    let ny = w0 * nor[a + 1] + w1 * nor[b + 1] + w2 * nor[c + 1];
    let nz = w0 * nor[a + 2] + w1 * nor[b + 2] + w2 * nor[c + 2];
    let l = Math.hypot(nx, ny, nz) || 1;
    nx /= l;
    ny /= l;
    nz /= l;
    // Marco tangente: t1 = arista a->b sin su parte normal; t2 = n × t1.
    let tx = pos[b] - pos[a];
    let ty = pos[b + 1] - pos[a + 1];
    let tz = pos[b + 2] - pos[a + 2];
    const dn = tx * nx + ty * ny + tz * nz;
    tx -= dn * nx;
    ty -= dn * ny;
    tz -= dn * nz;
    l = Math.hypot(tx, ty, tz) || 1;
    tx /= l;
    ty /= l;
    tz /= l;
    const ux = ny * tz - nz * ty;
    const uy = nz * tx - nx * tz;
    const uz = nx * ty - ny * tx;
    const { h, c1, c2 } = { h: e.h[v], c1: e.c1[v], c2: e.c2[v] };
    let px = w0 * pos[a] + w1 * pos[b] + w2 * pos[c] + h * nx + c1 * tx + c2 * ux;
    let py = w0 * pos[a + 1] + w1 * pos[b + 1] + w2 * pos[c + 1] + h * ny + c1 * ty + c2 * uy;
    let pz = w0 * pos[a + 2] + w1 * pos[b + 2] + w2 * pos[c + 2] + h * nz + c1 * tz + c2 * uz;
    const k = e.pieza[v];
    if (k > 0 && afines[k - 1]) {
      const A = afines[k - 1]!;
      const [ox, oy, oz] = [e.original[v * 3], e.original[v * 3 + 1], e.original[v * 3 + 2]];
      const w = e.peso[v];
      px += w * (A[0] * ox + A[1] * oy + A[2] * oz + A[3] - px);
      py += w * (A[4] * ox + A[5] * oy + A[6] * oz + A[7] - py);
      pz += w * (A[8] * ox + A[9] * oy + A[10] * oz + A[11] - pz);
    }
    destino[v * 3] = px;
    destino[v * 3 + 1] = py;
    destino[v * 3 + 2] = pz;
  }
  return destino;
}

/**
 * Transformación de semejanza (rotación, escala uniforme y traslación; 3 × 4
 * por filas) que mejor lleva los puntos calzados de una pieza a los del cuerpo
 * actual. Una afín general aplastaba las manos (la zona de la mano es casi
 * plana); la semejanza no deforma la pieza. Método de Horn (cuaterniones).
 */
function afinDe(region: Escultura['regiones'][number], pos: ArrayLike<number>): Float64Array | null {
  const n = region.vertices.length;
  if (n < 3) return null;
  const ca = [0, 0, 0];
  const cb = [0, 0, 0];
  for (let i = 0; i < n; i++) {
    const v = region.vertices[i] * 3;
    for (let c = 0; c < 3; c++) {
      ca[c] += region.calzado[i * 3 + c] / n;
      cb[c] += pos[v + c] / n;
    }
  }
  // Covarianza cruzada S[i][j] = Σ a_i b_j (centrados) y dispersión de a.
  const S = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  let sa = 0;
  let sb = 0;
  for (let i = 0; i < n; i++) {
    const v = region.vertices[i] * 3;
    const a = [region.calzado[i * 3] - ca[0], region.calzado[i * 3 + 1] - ca[1], region.calzado[i * 3 + 2] - ca[2]];
    const b = [pos[v] - cb[0], pos[v + 1] - cb[1], pos[v + 2] - cb[2]];
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) S[r * 3 + c] += a[r] * b[c];
    sa += a[0] * a[0] + a[1] * a[1] + a[2] * a[2];
    sb += b[0] * b[0] + b[1] * b[1] + b[2] * b[2];
  }
  const [xx, xy, xz, yx, yy, yz, zx, zy, zz] = S;
  const N = [
    [xx + yy + zz, yz - zy, zx - xz, xy - yx],
    [yz - zy, xx - yy - zz, xy + yx, zx + xz],
    [zx - xz, xy + yx, -xx + yy - zz, yz + zy],
    [xy - yx, zx + xz, yz + zy, -xx - yy + zz],
  ];
  const q = autovectorMayor(N);
  const [w, x, y, z] = q;
  const R = [
    w * w + x * x - y * y - z * z, 2 * (x * y - w * z), 2 * (x * z + w * y),
    2 * (x * y + w * z), w * w - x * x + y * y - z * z, 2 * (y * z - w * x),
    2 * (x * z - w * y), 2 * (y * z + w * x), w * w - x * x - y * y + z * z,
  ];
  const escala = sa > 0 ? Math.sqrt(sb / sa) : 1;
  const out = new Float64Array(12);
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) out[r * 4 + c] = escala * R[r * 3 + c];
    out[r * 4 + 3] = cb[r] - (out[r * 4] * ca[0] + out[r * 4 + 1] * ca[1] + out[r * 4 + 2] * ca[2]);
  }
  return out;
}

/** Autovector del autovalor mayor de una matriz simétrica 4×4 (Jacobi). */
function autovectorMayor(A: number[][]): number[] {
  const a = A.map((f) => f.slice());
  const V = [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]];
  for (let barrido = 0; barrido < 30; barrido++) {
    let fuera = 0;
    for (let p = 0; p < 4; p++) for (let q = p + 1; q < 4; q++) fuera += a[p][q] * a[p][q];
    if (fuera < 1e-20) break;
    for (let p = 0; p < 4; p++) {
      for (let q = p + 1; q < 4; q++) {
        if (Math.abs(a[p][q]) < 1e-15) continue;
        const theta = (a[q][q] - a[p][p]) / (2 * a[p][q]);
        const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(t * t + 1);
        const s = t * c;
        for (let k = 0; k < 4; k++) {
          const akp = a[k][p];
          const akq = a[k][q];
          a[k][p] = c * akp - s * akq;
          a[k][q] = s * akp + c * akq;
        }
        for (let k = 0; k < 4; k++) {
          const apk = a[p][k];
          const aqk = a[q][k];
          a[p][k] = c * apk - s * aqk;
          a[q][k] = s * apk + c * aqk;
        }
        for (let k = 0; k < 4; k++) {
          const vkp = V[k][p];
          const vkq = V[k][q];
          V[k][p] = c * vkp - s * vkq;
          V[k][q] = s * vkp + c * vkq;
        }
      }
    }
  }
  let mejor = 0;
  for (let i = 1; i < 4; i++) if (a[i][i] > a[mejor][mejor]) mejor = i;
  return [V[0][mejor], V[1][mejor], V[2][mejor], V[3][mejor]];
}

/** Un atributo por vértice del cuerpo (colores, espesor) interpolado en la escultura. */
export function atributoEscultura(e: Escultura, trisCuerpo: Indices, valores: ArrayLike<number>, k: number, destino: Float32Array<ArrayBuffer>) {
  const tris = triangulosCanonicos(trisCuerpo);
  for (let v = 0; v < e.nTotal; v++) {
    const t = e.tri[v] * 3;
    const w1 = e.b1[v];
    const w2 = e.b2[v];
    const w0 = 1 - w1 - w2;
    for (let c = 0; c < k; c++) {
      destino[v * k + c] = w0 * valores[tris[t] * k + c] + w1 * valores[tris[t + 1] * k + c] + w2 * valores[tris[t + 2] * k + c];
    }
  }
  return destino;
}
