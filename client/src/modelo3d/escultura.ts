import { Color, SRGBColorSpace, type BufferGeometry, type Mesh } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import type { Indices } from './geometria';
import type { Sexo } from './tipos';

/**
 * El cuerpo que se ve: las esculturas "Muscle Male" / "Muscle Female"
 * (images/2284-legroscollardfloriane-*, ver tools/export_escultura.py).
 *
 * Las medidas y el ajuste se calculan con el cuerpo de MakeHuman, que no se
 * muestra. Cada vértice de la escultura está asociado a un punto de ese cuerpo
 * (triángulo y baricéntricas) y se mueve lo mismo que ese punto entre el cuerpo
 * base y el del cliente: con el cuerpo base la escultura queda tal cual es, y
 * cambia con la estatura, el peso, el músculo y la grasa del cliente.
 */
export interface Escultura {
  sexo: Sexo;
  nTotal: number;
  indices: Uint32Array;
  /** Posición de cada vértice en la escultura. */
  original: Float32Array;
  /** Color pintado en la escultura (rgb lineal, tal cual viene en el modelo). */
  color: Float32Array;
  tri: Uint16Array;
  b1: Float32Array;
  b2: Float32Array;
  /** Cuánto se movió cada vértice del cuerpo base para calzar sobre la escultura (m). */
  calce: Float32Array;
}

const ARCHIVO: Record<Sexo, string> = { M: 'escultura-hombre', F: 'escultura-mujer' };
const cache = new Map<Sexo, Promise<Escultura>>();
const listas = new Map<Sexo, Escultura>();

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
        return r.json() as Promise<{ calce: number[] }>;
      }),
    ]).then(([gltf, meta]) => {
      let malla: Mesh | undefined;
      gltf.scene.traverse((o) => {
        if ((o as Mesh).isMesh) malla = o as Mesh;
      });
      if (!malla) throw new Error('El GLB de la escultura no trae malla');
      const e = desdeGeometria(sexo, malla.geometry as BufferGeometry, meta.calce);
      listas.set(sexo, e);
      return e;
    });
    p.catch(() => cache.delete(sexo));
    cache.set(sexo, p);
  }
  return p;
}

/** La escultura ya descargada (la página no muestra el visor hasta tenerla). */
export function esculturaDe(sexo: Sexo): Escultura {
  const e = listas.get(sexo);
  if (!e) throw new Error('La escultura todavía no se cargó');
  return e;
}

/** Arma la escultura a partir de la geometría del GLB (separado para probarlo en Node). */
export function desdeGeometria(sexo: Sexo, geo: BufferGeometry, calce: number[]): Escultura {
  const atado = geo.getAttribute('_atado').array as Uint16Array;
  const n = atado.length / 4;
  const e: Escultura = {
    sexo,
    nTotal: n,
    indices: Uint32Array.from(geo.getIndex()!.array as ArrayLike<number>),
    original: Float32Array.from(geo.getAttribute('position').array as ArrayLike<number>),
    tri: new Uint16Array(n),
    b1: new Float32Array(n),
    b2: new Float32Array(n),
    calce: Float32Array.from(calce, (x) => x / 10000),
    color: new Float32Array(n * 3),
  };
  // Los colores vienen en sRGB (bytes); three.js trabaja en lineal.
  const crudo = geo.getAttribute('_color').array as Uint8Array;
  const c = new Color();
  for (let v = 0; v < n; v++) {
    c.setRGB(crudo[v * 4] / 255, crudo[v * 4 + 1] / 255, crudo[v * 4 + 2] / 255, SRGBColorSpace);
    e.color.set([c.r, c.g, c.b], v * 3);
  }
  for (let v = 0; v < n; v++) {
    e.tri[v] = atado[v * 4];
    e.b1[v] = atado[v * 4 + 1] / 65535;
    e.b2[v] = atado[v * 4 + 2] / 65535;
  }
  return e;
}

const canonicosCache = new WeakMap<object, Uint32Array>();

/**
 * Cada triángulo empezando por su vértice menor (mismo sentido de giro): la
 * compresión meshopt de los índices puede rotar los vértices de un triángulo, y
 * la asociación usa esta forma.
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

/**
 * Posiciones de la escultura para un cuerpo: cada vértice se mueve lo mismo que
 * su punto del cuerpo entre `base` (cuerpo base) y `pos` (cuerpo del cliente).
 */
export function posicionesEscultura(
  e: Escultura,
  trisCuerpo: Indices,
  base: ArrayLike<number>,
  pos: ArrayLike<number>,
  destino: Float32Array<ArrayBuffer>,
) {
  const tris = triangulosCanonicos(trisCuerpo);
  for (let v = 0; v < e.nTotal; v++) {
    const t = e.tri[v] * 3;
    const a = tris[t] * 3;
    const b = tris[t + 1] * 3;
    const c = tris[t + 2] * 3;
    const w1 = e.b1[v];
    const w2 = e.b2[v];
    const w0 = 1 - w1 - w2;
    for (let k = 0; k < 3; k++) {
      destino[v * 3 + k] =
        e.original[v * 3 + k] + w0 * (pos[a + k] - base[a + k]) + w1 * (pos[b + k] - base[b + k]) + w2 * (pos[c + k] - base[c + k]);
    }
  }
  return destino;
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

/**
 * Lleva puntos medidos sobre el cuerpo del cliente (los anillos de medida) a la
 * escultura: les suma el calce del vértice del cuerpo más cercano.
 */
export function llevarAEscultura(e: Escultura, pos: ArrayLike<number>, puntos: Float32Array) {
  const out = new Float32Array(puntos.length);
  const n = pos.length / 3;
  for (let i = 0; i < puntos.length; i += 3) {
    let mejor = 0;
    let d = Infinity;
    for (let v = 0; v < n; v++) {
      const dx = pos[v * 3] - puntos[i];
      const dy = pos[v * 3 + 1] - puntos[i + 1];
      const dz = pos[v * 3 + 2] - puntos[i + 2];
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 < d) {
        d = d2;
        mejor = v;
      }
    }
    for (let c = 0; c < 3; c++) out[i + c] = puntos[i + c] + e.calce[mejor * 3 + c];
  }
  return out;
}
