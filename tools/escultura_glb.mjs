/**
 * Arma los GLB del cuerpo esculpido (client/public/modelo3d/escultura-*.glb)
 * con lo que deja tools/export_escultura.py en tools/build: simplifica la
 * malla, la compacta y la escribe comprimida con meshopt.
 *
 * Atributos de cada vértice (ver client/src/modelo3d/escultura.ts):
 *   POSITION  float32 x3  posición en la escultura
 *   _ATADO    uint16  x4  triángulo del cuerpo, baricéntricas b1 y b2 (×65535), 0
 *
 * El JSON lleva `calce`: cuánto se movió cada vértice del cuerpo base para
 * calzar sobre la escultura (0,1 mm), para llevar anillos de medida a ella.
 *
 * Uso:  node tools/escultura_glb.mjs tools/build client/public/modelo3d
 */
import fs from 'node:fs';
import { MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';

/** Triángulos que se buscan al simplificar (la escultura trae ~470 000). */
const TRIANGULOS_OBJETIVO = 150_000;
/** Error máximo de la simplificación, relativo al tamaño de la malla (~1,8 m). */
const ERROR_MAXIMO = 0.001;

const TIPOS = { '<f4': Float32Array, '<u4': Uint32Array, '<u2': Uint16Array };

function leerCrudo(carpeta, sexo) {
  const cab = JSON.parse(fs.readFileSync(`${carpeta}/escultura-${sexo}.json`, 'utf8'));
  const bin = fs.readFileSync(`${carpeta}/escultura-${sexo}.bin`);
  const a = {};
  for (const x of cab.arrays) {
    const T = TIPOS[x.dtype];
    const n = x.forma.reduce((p, c) => p * c, 1);
    a[x.nombre] = new T(bin.buffer.slice(bin.byteOffset + x.offset, bin.byteOffset + x.offset + n * T.BYTES_PER_ELEMENT));
  }
  return { cab, a };
}

function escribirGlb(ruta, json, bin) {
  let js = Buffer.from(JSON.stringify(json), 'utf8');
  js = Buffer.concat([js, Buffer.alloc((4 - (js.length % 4)) % 4, 0x20)]);
  const b = Buffer.concat([bin, Buffer.alloc((4 - (bin.length % 4)) % 4)]);
  const cab = Buffer.alloc(12);
  cab.writeUInt32LE(0x46546c67, 0);
  cab.writeUInt32LE(2, 4);
  cab.writeUInt32LE(12 + 8 + js.length + 8 + b.length, 8);
  const c1 = Buffer.alloc(8);
  c1.writeUInt32LE(js.length, 0);
  c1.writeUInt32LE(0x4e4f534a, 4);
  const c2 = Buffer.alloc(8);
  c2.writeUInt32LE(b.length, 0);
  c2.writeUInt32LE(0x004e4942, 4);
  fs.writeFileSync(ruta, Buffer.concat([cab, c1, js, c2, b]));
}

async function armar(entrada, salida, sexo) {
  const { cab, a } = leerCrudo(entrada, sexo);
  const [simpl] = MeshoptSimplifier.simplify(a.indices, a.reposo, 3, TRIANGULOS_OBJETIVO * 3, ERROR_MAXIMO);

  // Compactar: solo los vértices que quedan, en orden de primera aparición.
  const nuevo = new Int32Array(cab.vertices).fill(-1);
  const orden = [];
  const indices = new Uint32Array(simpl.length);
  for (let i = 0; i < simpl.length; i++) {
    const v = simpl[i];
    if (nuevo[v] < 0) {
      nuevo[v] = orden.length;
      orden.push(v);
    }
    indices[i] = nuevo[v];
  }
  const n = orden.length;
  const pos = new Float32Array(n * 3);
  const atado = new Uint16Array(n * 4);
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  orden.forEach((v, i) => {
    for (let c = 0; c < 3; c++) {
      const x = a.reposo[v * 3 + c];
      pos[i * 3 + c] = x;
      min[c] = Math.min(min[c], x);
      max[c] = Math.max(max[c], x);
    }
    if (a.tri[v] > 65535) throw new Error('triángulo del cuerpo fuera de uint16');
    atado.set([a.tri[v], Math.round(a.bary[v * 3 + 1] * 65535), Math.round(a.bary[v * 3 + 2] * 65535), 0], i * 4);
  });

  const vistas = [
    { datos: pos, stride: 12, modo: 'ATTRIBUTES', count: n, target: 34962 },
    { datos: atado, stride: 8, modo: 'ATTRIBUTES', count: n, target: 34962 },
    { datos: indices, stride: 4, modo: 'TRIANGLES', count: indices.length, target: 34963 },
  ];
  const partes = [];
  let off = 0;
  let offCrudo = 0;
  const bufferViews = vistas.map((v) => {
    const bytes = new Uint8Array(v.datos.buffer, v.datos.byteOffset, v.datos.byteLength);
    const cod = MeshoptEncoder.encodeGltfBuffer(bytes, v.count, v.stride, v.modo);
    const relleno = (4 - (cod.length % 4)) % 4;
    partes.push(Buffer.from(cod), Buffer.alloc(relleno));
    const vista = {
      buffer: 1,
      byteOffset: offCrudo,
      byteLength: bytes.length,
      ...(v.modo === 'ATTRIBUTES' ? { byteStride: v.stride } : {}),
      target: v.target,
      extensions: { EXT_meshopt_compression: { buffer: 0, byteOffset: off, byteLength: cod.length, byteStride: v.stride, mode: v.modo, count: v.count } },
    };
    off += cod.length + relleno;
    offCrudo += bytes.length + ((4 - (bytes.length % 4)) % 4);
    return vista;
  });
  const json = {
    asset: { version: '2.0', generator: 'tools/escultura_glb.mjs' },
    extensionsUsed: ['EXT_meshopt_compression'],
    extensionsRequired: ['EXT_meshopt_compression'],
    buffers: [{ byteLength: off }, { byteLength: offCrudo, extensions: { EXT_meshopt_compression: { fallback: true } } }],
    bufferViews,
    accessors: [
      { bufferView: 0, componentType: 5126, count: n, type: 'VEC3', min, max },
      { bufferView: 1, componentType: 5123, count: n, type: 'VEC4' },
      { bufferView: 2, componentType: 5125, count: indices.length, type: 'SCALAR' },
    ],
    meshes: [{ name: 'escultura', primitives: [{ attributes: { POSITION: 0, _ATADO: 1 }, indices: 2 }] }],
    nodes: [{ mesh: 0, name: 'escultura' }],
    scenes: [{ nodes: [0] }],
    scene: 0,
  };
  const etiqueta = sexo === 'M' ? 'hombre' : 'mujer';
  escribirGlb(`${salida}/escultura-${etiqueta}.glb`, json, Buffer.concat(partes));
  fs.writeFileSync(`${salida}/escultura-${etiqueta}.json`, JSON.stringify({ version: 2, calce: cab.calce }));
  const mb = fs.statSync(`${salida}/escultura-${etiqueta}.glb`).size / 1e6;
  console.log(`escultura-${etiqueta}: ${cab.triangulos} -> ${indices.length / 3} triángulos, ${n} vértices, ${mb.toFixed(2)} MB`);
}

const [, , entrada, salida] = process.argv;
if (!entrada || !salida) {
  console.error('Uso: node tools/escultura_glb.mjs tools/build client/public/modelo3d');
  process.exit(1);
}
await MeshoptSimplifier.ready;
await MeshoptEncoder.ready;
for (const sexo of ['M', 'F']) if (fs.existsSync(`${entrada}/escultura-${sexo}.bin`)) await armar(entrada, salida, sexo);
