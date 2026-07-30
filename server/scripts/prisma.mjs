/**
 * Wrapper del CLI de Prisma.
 *
 * El .env vive en la raiz del monorepo (compartido entre client y server), pero
 * el CLI de Prisma solo busca el .env junto al schema o en el cwd. Este script
 * carga la configuracion con las mismas reglas que el servidor y luego delega
 * en `prisma` con los argumentos recibidos.
 *
 *   node scripts/prisma.mjs migrate dev --name algo
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import '../src/config/env.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const prismaBin = path.resolve(__dirname, '../../node_modules/.bin/prisma');

const resultado = spawnSync(prismaBin, process.argv.slice(2), {
  stdio: 'inherit',
  cwd: path.resolve(__dirname, '..'),
  env: process.env,
});

process.exit(resultado.status ?? 1);
