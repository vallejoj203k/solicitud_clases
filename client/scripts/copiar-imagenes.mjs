/**
 * Copia /images (raíz del repositorio) a client/public/images.
 *
 * Vite solo publica lo que está dentro de `client/public`, pero las fotos del
 * gimnasio se guardan en la raíz para que se puedan reemplazar sin entrar al
 * código del frontend. Este script corre solo, antes de `dev` y de `build`.
 *
 * El destino está en .gitignore: la copia es un artefacto de build, el original
 * es el que se versiona.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const origen = path.resolve(__dirname, '../../images');
const destino = path.resolve(__dirname, '../public/images');

if (!fs.existsSync(origen)) {
  console.log('[imagenes] No hay carpeta /images en la raíz; nada que copiar.');
  process.exit(0);
}

fs.rmSync(destino, { recursive: true, force: true });
fs.mkdirSync(destino, { recursive: true });

const EXTENSIONES = new Set(['.jpg', '.jpeg', '.png', '.webp', '.avif', '.svg']);
let copiadas = 0;

for (const archivo of fs.readdirSync(origen)) {
  if (!EXTENSIONES.has(path.extname(archivo).toLowerCase())) continue;
  fs.copyFileSync(path.join(origen, archivo), path.join(destino, archivo));
  copiadas += 1;
}

console.log(`[imagenes] ${copiadas} imagen(es) copiadas a client/public/images.`);
