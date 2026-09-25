/**
 * Reduce un HDRI (.hdr, Radiance RGBE) a la mitad de resolución, promediando
 * cada bloque de 2x2 píxeles. Para la luz ambiente del visor no hace falta más:
 * three.js lo filtra igual (PMREM) y el archivo pesa ~4 veces menos.
 *
 * Uso: node tools/reducir_hdr.mjs entrada.hdr salida.hdr [veces]
 *   veces: cuántas veces se divide por 2 (por defecto 1).
 */
import fs from 'node:fs';
import { FloatType } from 'three';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';

const [entrada, salida, vecesTxt = '1'] = process.argv.slice(2);
if (!entrada || !salida) {
  console.error('Uso: node tools/reducir_hdr.mjs entrada.hdr salida.hdr [veces]');
  process.exit(1);
}

const bytes = fs.readFileSync(entrada);
const cargador = new RGBELoader().setDataType(FloatType);
let { data, width, height } = cargador.parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));

for (let v = 0; v < Number(vecesTxt); v++) {
  const w = width >> 1;
  const h = height >> 1;
  const out = new Float32Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      for (let c = 0; c < 3; c++) {
        let s = 0;
        for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) s += data[((y * 2 + dy) * width + (x * 2 + dx)) * 4 + c];
        out[(y * w + x) * 4 + c] = s / 4;
      }
      out[(y * w + x) * 4 + 3] = 1;
    }
  }
  data = out;
  width = w;
  height = h;
}

/** Un píxel float -> RGBE (mantisa compartida con exponente). */
function rgbe(r, g, b) {
  const m = Math.max(r, g, b);
  if (m < 1e-32) return [0, 0, 0, 0];
  const e = Math.ceil(Math.log2(m) + 1e-9);
  const f = 256 / 2 ** e;
  return [Math.min(255, Math.floor(r * f)), Math.min(255, Math.floor(g * f)), Math.min(255, Math.floor(b * f)), e + 128];
}

// Escritura con el formato "RLE nuevo" de Radiance: cada canal de la línea en
// tramos literales de hasta 128 bytes (sin corridas: más simple y válido).
const partes = [Buffer.from(`#?RADIANCE\n# Reducido con tools/reducir_hdr.mjs\nFORMAT=32-bit_rle_rgbe\n\n-Y ${height} +X ${width}\n`, 'ascii')];
for (let y = 0; y < height; y++) {
  const linea = Array.from({ length: 4 }, () => new Uint8Array(width));
  for (let x = 0; x < width; x++) {
    const i = (y * width + x) * 4;
    rgbe(data[i], data[i + 1], data[i + 2]).forEach((b, c) => (linea[c][x] = b));
  }
  const buf = [2, 2, width >> 8, width & 255];
  for (const canal of linea) {
    for (let x = 0; x < width; x += 128) {
      const n = Math.min(128, width - x);
      buf.push(n, ...canal.subarray(x, x + n));
    }
  }
  partes.push(Buffer.from(buf));
}
fs.writeFileSync(salida, Buffer.concat(partes));
console.log(`${entrada} (${(bytes.length / 1e6).toFixed(2)} MB) -> ${salida}: ${width}x${height}, ${(fs.statSync(salida).size / 1e6).toFixed(2)} MB`);
