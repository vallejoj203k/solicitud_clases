/**
 * Comprime los GLB que produce tools/export_bodies.py, SIN reordenar vértices.
 *
 * Por qué no gltfpack: reordena los vértices para optimizar la caché de la GPU y
 * descarta los atributos propios (_SEGMENTO). Los segmentos y los landmarks de
 * medida se refieren a índices de vértice de MakeHuman, así que el orden tiene
 * que llegar intacto al navegador.
 *
 * Qué hace:
 *   - Los morph targets (dispersos o densos) pasan a int16 normalizado
 *     (KHR_mesh_quantization): el valor en metros es entero / 32767, o sea
 *     0,03 mm de precisión. Todos los deltas miden menos de 1 m (se verifica).
 *   - Cada bufferView se codifica con meshopt (EXT_meshopt_compression).
 *     Posición base, normales, _SEGMENTO e índices quedan sin cuantizar.
 *
 * Uso:  node tools/comprimir_glb.mjs entrada.glb salida.glb
 *       node tools/comprimir_glb.mjs tools/build client/public/modelo3d   (carpeta: GLB + JSON)
 */
import fs from 'node:fs';
import { MeshoptEncoder } from 'meshoptimizer';

const FLOAT = 5126;
const SHORT = 5122;
const USHORT = 5123;
const TAMANO = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
const COMPONENTES = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };

function leerGlb(ruta) {
  const b = fs.readFileSync(ruta);
  if (b.readUInt32LE(0) !== 0x46546c67) throw new Error(`${ruta} no es un GLB`);
  const largoJson = b.readUInt32LE(12);
  const json = JSON.parse(b.subarray(20, 20 + largoJson).toString('utf8'));
  const inicioBin = 20 + largoJson;
  const bin = b.subarray(inicioBin + 8, inicioBin + 8 + b.readUInt32LE(inicioBin));
  return { json, bin };
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

/** Lee un accessor (denso o disperso) como Float32Array plano. */
function leerAccesor(json, bin, i) {
  const acc = json.accessors[i];
  const n = acc.count * COMPONENTES[acc.type];
  const out = new Float32Array(n);
  const leer = (vistaIdx, tipo, cuantos) => {
    const v = json.bufferViews[vistaIdx];
    const inicio = v.byteOffset ?? 0;
    const buf = bin.buffer.slice(bin.byteOffset + inicio, bin.byteOffset + inicio + cuantos * TAMANO[tipo]);
    if (tipo === FLOAT) return new Float32Array(buf);
    if (tipo === USHORT) return new Uint16Array(buf);
    if (tipo === 5125) return new Uint32Array(buf);
    throw new Error(`tipo ${tipo} no esperado`);
  };
  if (acc.bufferView !== undefined) out.set(leer(acc.bufferView, acc.componentType, n));
  if (acc.sparse) {
    const k = COMPONENTES[acc.type];
    const idx = leer(acc.sparse.indices.bufferView, acc.sparse.indices.componentType, acc.sparse.count);
    const val = leer(acc.sparse.values.bufferView, acc.componentType, acc.sparse.count * k);
    for (let j = 0; j < acc.sparse.count; j++) for (let c = 0; c < k; c++) out[idx[j] * k + c] = val[j * k + c];
  }
  return out;
}

async function comprimir(entrada, salida) {
  await MeshoptEncoder.ready;
  const { json, bin } = leerGlb(entrada);
  const prim = json.meshes[0].primitives[0];
  const nVert = json.accessors[prim.attributes.POSITION].count;

  // Nuevo layout: cada vista cruda se guarda aparte, luego se codifica.
  const vistas = []; // { datos: Uint8Array, stride, modo, count, target }
  const accesores = [];
  const nuevaVista = (datos, stride, modo, count, target) => {
    vistas.push({ datos, stride, modo, count, target });
    return vistas.length - 1;
  };

  const copiarAccesor = (i, modo, target) => {
    const acc = { ...json.accessors[i] };
    const v = json.bufferViews[acc.bufferView];
    const datos = new Uint8Array(bin.buffer, bin.byteOffset + (v.byteOffset ?? 0), v.byteLength);
    const stride = TAMANO[acc.componentType] * COMPONENTES[acc.type];
    acc.bufferView = nuevaVista(new Uint8Array(datos), stride, modo, acc.count, target);
    accesores.push(acc);
    return accesores.length - 1;
  };

  const atributos = {};
  for (const [nombre, i] of Object.entries(prim.attributes)) atributos[nombre] = copiarAccesor(i, 'ATTRIBUTES', 34962);
  const indices = copiarAccesor(prim.indices, 'TRIANGLES', 34963);

  let deltaMax = 0;
  const targets = prim.targets.map((t) => {
    const d = leerAccesor(json, bin, t.POSITION);
    // VEC3 de int16 con relleno a 8 bytes: los atributos de vértice deben ir
    // alineados a 4 bytes, y meshopt pide un stride múltiplo de 4.
    const q = new Int16Array(nVert * 4);
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    for (let v = 0; v < nVert; v++) {
      for (let c = 0; c < 3; c++) {
        const x = d[v * 3 + c];
        deltaMax = Math.max(deltaMax, Math.abs(x));
        const e = Math.round(Math.max(-1, Math.min(1, x)) * 32767);
        q[v * 4 + c] = e;
        min[c] = Math.min(min[c], e);
        max[c] = Math.max(max[c], e);
      }
    }
    accesores.push({ bufferView: nuevaVista(new Uint8Array(q.buffer), 8, 'ATTRIBUTES', nVert, 34962),
      byteOffset: 0, componentType: SHORT, normalized: true, count: nVert, type: 'VEC3', min, max });
    return { POSITION: accesores.length - 1 };
  });
  if (deltaMax >= 1) throw new Error(`Un morph mueve ${deltaMax.toFixed(3)} m: no cabe en int16 normalizado`);

  // Codificación meshopt de cada vista.
  const partes = [];
  let desplazamiento = 0;
  let desplazamientoCrudo = 0;
  const bufferViews = vistas.map((v) => {
    const codificado = MeshoptEncoder.encodeGltfBuffer(v.datos, v.count, v.stride, v.modo);
    const relleno = (4 - (codificado.length % 4)) % 4;
    partes.push(Buffer.from(codificado), Buffer.alloc(relleno));
    const vista = {
      buffer: 1,
      byteOffset: desplazamientoCrudo,
      byteLength: v.datos.length,
      ...(v.modo === 'ATTRIBUTES' ? { byteStride: v.stride } : {}),
      ...(v.target ? { target: v.target } : {}),
      extensions: { EXT_meshopt_compression: {
        buffer: 0, byteOffset: desplazamiento, byteLength: codificado.length,
        byteStride: v.stride, mode: v.modo, count: v.count } },
    };
    desplazamiento += codificado.length + relleno;
    desplazamientoCrudo += v.datos.length + ((4 - (v.datos.length % 4)) % 4);
    return vista;
  });

  const nuevo = {
    ...json,
    extensionsUsed: ['EXT_meshopt_compression', 'KHR_mesh_quantization'],
    extensionsRequired: ['EXT_meshopt_compression', 'KHR_mesh_quantization'],
    buffers: [
      { byteLength: desplazamiento },
      { byteLength: desplazamientoCrudo, extensions: { EXT_meshopt_compression: { fallback: true } } },
    ],
    bufferViews,
    accessors: accesores,
  };
  nuevo.meshes = [{ ...json.meshes[0], primitives: [{ ...prim, attributes: atributos, indices, targets }] }];
  escribirGlb(salida, nuevo, Buffer.concat(partes));

  const antes = fs.statSync(entrada).size / 1e6;
  const despues = fs.statSync(salida).size / 1e6;
  console.log(`${salida}: ${antes.toFixed(2)} MB -> ${despues.toFixed(2)} MB (delta máx ${(deltaMax * 100).toFixed(1)} cm)`);
}

const [, , entrada, salida] = process.argv;
if (!entrada || !salida) {
  console.error('Uso: node tools/comprimir_glb.mjs entrada.glb salida.glb\n     node tools/comprimir_glb.mjs carpeta_entrada carpeta_salida');
  process.exit(1);
}
if (fs.statSync(entrada).isDirectory()) {
  // Carpeta: comprime cada GLB y copia tal cual su JSON de metadatos.
  fs.mkdirSync(salida, { recursive: true });
  for (const archivo of fs.readdirSync(entrada).sort()) {
    if (archivo.endsWith('.glb')) await comprimir(`${entrada}/${archivo}`, `${salida}/${archivo}`);
    if (archivo.endsWith('.json')) fs.copyFileSync(`${entrada}/${archivo}`, `${salida}/${archivo}`);
  }
} else {
  await comprimir(entrada, salida);
}
