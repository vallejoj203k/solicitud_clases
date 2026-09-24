import { BufferAttribute, type BufferGeometry, type Mesh } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import type { CuerpoBase, MetaCuerpo, MorphCPU, Sexo } from './tipos';

const ARCHIVO: Record<Sexo, string> = { M: 'cuerpo-hombre', F: 'cuerpo-mujer' };
const CARPETA = '/modelo3d';

/** Valores de un atributo como floats reales (des-cuantiza int16 normalizado). */
function comoFloat(attr: BufferAttribute): Float32Array {
  const n = attr.count * attr.itemSize;
  const out = new Float32Array(n);
  for (let i = 0; i < attr.count; i++) {
    out[i * 3] = attr.getX(i);
    out[i * 3 + 1] = attr.getY(i);
    out[i * 3 + 2] = attr.getZ(i);
  }
  return out;
}

/** Deja solo los vértices que el morph mueve: aplicar sale mucho más barato. */
function aDisperso(nombre: string, d: Float32Array): MorphCPU {
  const idx: number[] = [];
  for (let v = 0; v < d.length / 3; v++) {
    if (d[v * 3] !== 0 || d[v * 3 + 1] !== 0 || d[v * 3 + 2] !== 0) idx.push(v);
  }
  const indices = Uint32Array.from(idx);
  const deltas = new Float32Array(idx.length * 3);
  idx.forEach((v, k) => deltas.set(d.subarray(v * 3, v * 3 + 3), k * 3));
  return { nombre, indices, deltas };
}

const cache = new Map<Sexo, Promise<CuerpoBase>>();

/** Descarga y prepara el cuerpo base de un sexo (una sola vez por sesión). */
export function cargarCuerpo(sexo: Sexo): Promise<CuerpoBase> {
  let p = cache.get(sexo);
  if (!p) {
    p = cargar(sexo);
    p.catch(() => cache.delete(sexo));
    cache.set(sexo, p);
  }
  return p;
}

async function cargar(sexo: Sexo): Promise<CuerpoBase> {
  const base = `${CARPETA}/${ARCHIVO[sexo]}`;
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);

  const [gltf, meta] = await Promise.all([
    loader.loadAsync(`${base}.glb`),
    fetch(`${base}.json`).then((r) => {
      if (!r.ok) throw new Error(`No se pudo cargar ${base}.json`);
      return r.json() as Promise<MetaCuerpo>;
    }),
  ]);

  let malla: Mesh | undefined;
  gltf.scene.traverse((o) => {
    if ((o as Mesh).isMesh) malla = o as Mesh;
  });
  if (!malla) throw new Error('El GLB no trae ninguna malla');
  const geo = malla.geometry as BufferGeometry;

  const nombres = Object.keys(malla.morphTargetDictionary ?? {}).sort(
    (a, b) => malla!.morphTargetDictionary![a] - malla!.morphTargetDictionary![b]
  );
  const morphs = (geo.morphAttributes.position ?? []).map((attr, i) =>
    aDisperso(nombres[i], comoFloat(attr as BufferAttribute))
  );

  const seg = geo.getAttribute('_segmento');
  const segmentos = new Uint8Array(seg.count);
  for (let i = 0; i < seg.count; i++) segmentos[i] = seg.getX(i);

  return {
    sexo,
    meta,
    posiciones: comoFloat(geo.getAttribute('position') as BufferAttribute),
    indicesTriangulos: geo.getIndex()!.array as Uint16Array,
    segmentos,
    morphs,
    indiceMorph: new Map(morphs.map((m, i) => [m.nombre, i])),
  };
}
