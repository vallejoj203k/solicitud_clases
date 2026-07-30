import dotenv from 'dotenv';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '../../..');

// El .env vive en la raiz del monorepo para compartirlo entre client y server.
// En Railway las variables llegan por el entorno y no hay archivo: dotenv
// simplemente no encuentra nada y no pisa lo ya definido.
for (const candidato of [path.join(rootDir, '.env'), path.join(rootDir, 'server/.env')]) {
  if (fs.existsSync(candidato)) dotenv.config({ path: candidato });
}

const requeridas = ['DATABASE_URL'];
const faltantes = requeridas.filter((k) => !process.env[k]);
if (faltantes.length) {
  console.error(`[config] Faltan variables de entorno obligatorias: ${faltantes.join(', ')}`);
  console.error('[config] Copia .env.example a .env y completalo.');
  process.exit(1);
}

const esProduccion = process.env.NODE_ENV === 'production';

if (esProduccion && !process.env.JWT_SECRET) {
  console.error('[config] JWT_SECRET es obligatorio en produccion.');
  process.exit(1);
}

export const env = {
  esProduccion,
  puerto: Number(process.env.PORT || 4000),
  databaseUrl: process.env.DATABASE_URL,
  jwtSecret: process.env.JWT_SECRET || 'dev-secret-no-usar-en-produccion',
  jwtExpiraAdmin: process.env.JWT_EXPIRES_ADMIN || '12h',
  jwtExpiraCliente: process.env.JWT_EXPIRES_CLIENTE || '90d',
  corsOrigins: (process.env.CORS_ORIGINS || 'http://localhost:5173')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),
  appUrl: process.env.APP_URL || 'http://localhost:5173',
  tzGimnasio: process.env.TZ_GIMNASIO || 'America/Bogota',
  rootDir,
  clientDist: path.join(rootDir, 'client/dist'),
  admin: {
    telefono: process.env.ADMIN_TELEFONO || '3001234567',
    password: process.env.ADMIN_PASSWORD || 'admin123',
    nombre: process.env.ADMIN_NOMBRE || 'Administrador',
  },
};
