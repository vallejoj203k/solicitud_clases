import { BufferAttribute, Color, type BufferGeometry, type Mesh } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { normalesVertice, type Indices } from './geometria';
import type { Sexo } from './tipos';

/**
 * Músculos anatómicos de Z-Anatomy (CC BY-SA 4.0, derivados de BodyParts3D)
 * atados al cuerpo sin grasa del cliente.
 *
 * Cada vértice del músculo está atado a un triángulo del cuerpo de MakeHuman
 * (ver tools/export_musculos.py): un punto del triángulo (baricéntricas), una
 * altura sobre la normal y un residuo tangente en metros (marco ortonormal de
 * la primera arista y la normal). Con el cuerpo
 * deformado se rearma igual, así los músculos siguen la estatura, el tamaño y
 * la forma del cliente; la capa exterior queda justo bajo la piel del cuerpo
 * sin grasa.
 */

export interface PiezaMusculo {
  /** Nombre en español (Z-Anatomy). */
  es: string;
  en: string;
  lado: 'izquierdo' | 'derecho' | null;
}

export interface MusculosAnatomicos {
  sexo: Sexo;
  piezas: PiezaMusculo[];
  indices: Uint32Array;
  /** Por vértice: triángulo del cuerpo, baricéntricas b1 y b2, altura, residuos. */
  tri: Uint16Array;
  b1: Float32Array;
  b2: Float32Array;
  h: Float32Array;
  c1: Float32Array;
  c2: Float32Array;
  pieza: Uint16Array;
  /** Color lineal por vértice (músculo rojo, tendón marfil). */
  color: Float32Array;
  /** Dirección perpendicular a las fibras por vértice (0 en tendones), para las estrías. */
  fibra: Float32Array;
}

const ARCHIVO: Record<Sexo, string> = { M: 'musculos-hombre', F: 'musculos-mujer' };
const CARPETA = '/modelo3d';

/** Atribución que pide la licencia CC BY-SA de los modelos (en la página y en la imagen PNG). */
export const CREDITO_MUSCULOS = 'Músculos: Z-Anatomy / BodyParts3D · CC BY-SA 4.0';

/** Colores (sRGB): rojo del músculo y marfil del tendón. */
export const COLOR_MUSCULO = '#A8382C';
export const COLOR_TENDON = '#E6DCCB';

const cache = new Map<Sexo, Promise<MusculosAnatomicos>>();

/** Descarga los músculos de un sexo (una vez por sesión). */
export function cargarMusculos(sexo: Sexo): Promise<MusculosAnatomicos> {
  let p = cache.get(sexo);
  if (!p) {
    p = cargar(sexo);
    p.catch(() => cache.delete(sexo));
    cache.set(sexo, p);
  }
  return p;
}

async function cargar(sexo: Sexo): Promise<MusculosAnatomicos> {
  const base = `${CARPETA}/${ARCHIVO[sexo]}`;
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const [gltf, meta] = await Promise.all([
    loader.loadAsync(`${base}.glb`),
    fetch(`${base}.json`).then((r) => {
      if (!r.ok) throw new Error(`No se pudo cargar ${base}.json`);
      return r.json() as Promise<{ piezas: PiezaMusculo[] }>;
    }),
  ]);
  let malla: Mesh | undefined;
  gltf.scene.traverse((o) => {
    if ((o as Mesh).isMesh) malla = o as Mesh;
  });
  if (!malla) throw new Error('El GLB de músculos no trae malla');
  return desdeGeometria(sexo, malla.geometry as BufferGeometry, meta.piezas);
}

/** Arma los músculos a partir de la geometría del GLB (separado para probarlo en Node). */
export function desdeGeometria(sexo: Sexo, geo: BufferGeometry, piezas: PiezaMusculo[]): MusculosAnatomicos {
  const reposo = geo.getAttribute('position').array as Float32Array;
  const atado = geo.getAttribute('_atado').array as Uint16Array;
  const desp = geo.getAttribute('_desp').array as Float32Array;
  const indices = Uint32Array.from(geo.getIndex()!.array as ArrayLike<number>);
  const n = reposo.length / 3;
  const m: MusculosAnatomicos = {
    sexo,
    piezas,
    indices,
    tri: new Uint16Array(n),
    b1: new Float32Array(n),
    b2: new Float32Array(n),
    h: new Float32Array(n),
    c1: new Float32Array(n),
    c2: new Float32Array(n),
    pieza: new Uint16Array(n),
    color: new Float32Array(n * 3),
    fibra: new Float32Array(n * 3),
  };
  const tendon = new Float32Array(n);
  for (let v = 0; v < n; v++) {
    m.tri[v] = atado[v * 4];
    m.b1[v] = atado[v * 4 + 1] / 65535;
    m.b2[v] = atado[v * 4 + 2] / 65535;
    m.pieza[v] = atado[v * 4 + 3];
    m.h[v] = desp[v * 4];
    m.c1[v] = desp[v * 4 + 1];
    m.c2[v] = desp[v * 4 + 2];
    tendon[v] = desp[v * 4 + 3];
  }
  colorear(m, tendon);
  fibras(m, reposo, tendon);
  return m;
}

/** Músculo rojo con un tono algo distinto por pieza (para distinguir vecinos); tendón marfil. */
function colorear(m: MusculosAnatomicos, tendon: Float32Array) {
  const musc = new Color(COLOR_MUSCULO);
  const ten = new Color(COLOR_TENDON);
  const c = new Color();
  const tonos = m.piezas.map((_, i) => {
    // Variación estable por pieza: ±8 % de luz y un poco de matiz.
    const r = Math.sin(i * 12.9898) * 43758.5453;
    const f = r - Math.floor(r);
    return musc.clone().offsetHSL((f - 0.5) * 0.02, 0, (f - 0.5) * 0.06);
  });
  for (let v = 0; v < m.pieza.length; v++) {
    const t = Math.min(1, Math.max(0, (tendon[v] - 0.25) / 0.5));
    c.copy(tonos[m.pieza[v]]).lerp(ten, t);
    m.color[v * 3] = c.r;
    m.color[v * 3 + 1] = c.g;
    m.color[v * 3 + 2] = c.b;
  }
}

/**
 * Estrías: por pieza, el eje largo (componente principal de sus vértices) es la
 * dirección de las fibras; las líneas se dibujan paralelas a él, así que el
 * shader necesita la perpendicular (sobre la superficie media de la pieza).
 */
function fibras(m: MusculosAnatomicos, reposo: Float32Array, tendon: Float32Array) {
  const np_ = m.piezas.length;
  const nor = normalesVertice(reposo, m.indices);
  const media = new Float64Array(np_ * 3);
  const cuenta = new Float64Array(np_);
  const normal = new Float64Array(np_ * 3);
  for (let v = 0; v < m.pieza.length; v++) {
    const p = m.pieza[v];
    cuenta[p]++;
    for (let c = 0; c < 3; c++) {
      media[p * 3 + c] += reposo[v * 3 + c];
      normal[p * 3 + c] += nor[v * 3 + c];
    }
  }
  for (let p = 0; p < np_; p++) for (let c = 0; c < 3; c++) media[p * 3 + c] /= Math.max(1, cuenta[p]);
  const cov = new Float64Array(np_ * 9);
  for (let v = 0; v < m.pieza.length; v++) {
    const p = m.pieza[v];
    const d = [0, 1, 2].map((c) => reposo[v * 3 + c] - media[p * 3 + c]);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) cov[p * 9 + i * 3 + j] += d[i] * d[j];
  }
  const perp = new Float32Array(np_ * 3);
  for (let p = 0; p < np_; p++) {
    // Iteración de potencia: eje principal.
    let a = [1, 1, 1];
    for (let it = 0; it < 30; it++) {
      const b = [0, 1, 2].map((i) => cov[p * 9 + i * 3] * a[0] + cov[p * 9 + i * 3 + 1] * a[1] + cov[p * 9 + i * 3 + 2] * a[2]);
      const l = Math.hypot(b[0], b[1], b[2]) || 1;
      a = b.map((x) => x / l);
    }
    const n = [normal[p * 3], normal[p * 3 + 1], normal[p * 3 + 2]];
    const q = [a[1] * n[2] - a[2] * n[1], a[2] * n[0] - a[0] * n[2], a[0] * n[1] - a[1] * n[0]];
    const l = Math.hypot(q[0], q[1], q[2]);
    if (l > 1e-6) perp.set([q[0] / l, q[1] / l, q[2] / l], p * 3);
  }
  for (let v = 0; v < m.pieza.length; v++) {
    if (tendon[v] > 0.5) continue;
    m.fibra.set(perp.subarray(m.pieza[v] * 3, m.pieza[v] * 3 + 3), v * 3);
  }
}

const canonicosCache = new WeakMap<object, Uint32Array>();

/**
 * Cada triángulo empezando por su vértice menor (mismo sentido de giro): la
 * compresión meshopt de los índices puede rotar los vértices de un triángulo, y
 * el atado (tools/export_musculos.py) usa esta forma.
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
 * Posiciones de los músculos sobre un cuerpo (posiciones y normales por vértice
 * de MakeHuman, y sus triángulos).
 */
export function deformarMusculos(m: MusculosAnatomicos, trisCuerpo: Indices, pos: ArrayLike<number>, nor: ArrayLike<number>, destino: Float32Array) {
  const tris = triangulosCanonicos(trisCuerpo);
  for (let v = 0; v < m.tri.length; v++) {
    const t = m.tri[v] * 3;
    const a = tris[t] * 3;
    const b = tris[t + 1] * 3;
    const c = tris[t + 2] * 3;
    const w1 = m.b1[v];
    const w2 = m.b2[v];
    const w0 = 1 - w1 - w2;
    const h = m.h[v];
    const c1 = m.c1[v];
    const c2 = m.c2[v];
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
    destino[v * 3] = w0 * pos[a] + w1 * pos[b] + w2 * pos[c] + h * nx + c1 * tx + c2 * ux;
    destino[v * 3 + 1] = w0 * pos[a + 1] + w1 * pos[b + 1] + w2 * pos[c + 1] + h * ny + c1 * ty + c2 * uy;
    destino[v * 3 + 2] = w0 * pos[a + 2] + w1 * pos[b + 2] + w2 * pos[c + 2] + h * nz + c1 * tz + c2 * uz;
  }
  return destino;
}

/** Nombre para mostrar de la pieza de un vértice. */
export function nombrePieza(m: MusculosAnatomicos, vertice: number) {
  const p = m.piezas[m.pieza[vertice]];
  return p.lado ? `${p.es} · ${p.lado}` : p.es;
}

/** Geometría con los atributos fijos (color, fibra); la posición se llena con deformarMusculos. */
export function atributosFijos(m: MusculosAnatomicos, g: BufferGeometry) {
  g.setAttribute('color', new BufferAttribute(m.color, 3));
  g.setAttribute('fibra', new BufferAttribute(m.fibra, 3));
}
