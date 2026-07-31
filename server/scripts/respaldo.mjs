/**
 * Respaldo de la base de datos a un archivo .sql comprimido.
 *
 * Railway hace sus propias copias segun el plan, pero conviene tener una que
 * dependa solo de ti y que puedas guardar donde quieras.
 *
 *   npm run db:backup                    -> ./respaldos/AAAA-MM-DD_HHmm.sql.gz
 *   railway run npm run db:backup        -> respalda la base de produccion
 *
 * Requiere pg_dump instalado (viene con el cliente de PostgreSQL).
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { env } from '../src/config/env.js';

const carpeta = path.resolve(env.rootDir, 'respaldos');
fs.mkdirSync(carpeta, { recursive: true });

const sello = new Date().toISOString().slice(0, 16).replace('T', '_').replace(':', '');
const destino = path.join(carpeta, `${sello}.sql.gz`);

// `?schema=` es un parametro propio de Prisma; pg_dump lo rechaza.
const url = new URL(env.databaseUrl);
url.searchParams.delete('schema');
url.searchParams.delete('connection_limit');
url.searchParams.delete('pool_timeout');

const dump = spawn('pg_dump', ['--no-owner', '--no-privileges', url.toString()]);
const gzip = zlib.createGzip();
const salida = fs.createWriteStream(destino);

let error = '';
dump.stderr.on('data', (d) => { error += d.toString(); });

dump.on('error', () => {
  console.error('\n✖ No se encontró pg_dump. Instala el cliente de PostgreSQL:');
  console.error('    Ubuntu/Debian: sudo apt install postgresql-client');
  console.error('    macOS:         brew install libpq\n');
  process.exit(1);
});

dump.stdout.pipe(gzip).pipe(salida);

dump.on('close', (codigo) => {
  if (codigo !== 0) {
    console.error(`\n✖ pg_dump falló (código ${codigo}):\n${error}\n`);
    fs.rmSync(destino, { force: true });
    process.exit(1);
  }
  salida.on('close', () => {
    const mb = (fs.statSync(destino).size / 1024 / 1024).toFixed(2);
    console.log(`\n✔ Respaldo guardado: ${destino} (${mb} MB)\n`);
    console.log('  Para restaurarlo en una base vacía:');
    console.log(`    gunzip -c "${destino}" | psql "$DATABASE_URL"\n`);
  });
});
