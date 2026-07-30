import { PrismaClient } from '@prisma/client';
import { env } from './env.js';

// Singleton. Con `node --watch` el modulo se recarga en cada cambio y sin esto
// se abririan conexiones nuevas hasta agotar el pool de Postgres.
const globalRef = globalThis;

export const prisma =
  globalRef.__prisma ??
  new PrismaClient({
    log: env.esProduccion ? ['error'] : ['warn', 'error'],
  });

if (!env.esProduccion) globalRef.__prisma = prisma;
