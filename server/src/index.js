import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import fs from 'node:fs';
import path from 'node:path';

import { env } from './config/env.js';
import { prisma } from './config/prisma.js';
import { auth } from './middleware/auth.js';
import { bootstrap, reportarBootstrap } from './config/bootstrap.js';
import { errorHandler, notFoundHandler } from './middleware/errores.js';
import { publicRouter } from './routes/public.routes.js';
import { authRouter } from './routes/auth.routes.js';
import { adminRouter } from './routes/admin.routes.js';

const app = express();

app.set('trust proxy', 1); // Railway va detras de un proxy
app.use(
  helmet({
    // El frontend es una SPA servida desde este mismo origen; la CSP por defecto
    // de helmet bloquea los assets de Vite con hash.
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  })
);
app.use(compression());
app.use(express.json({ limit: '256kb' }));
app.use(morgan(env.esProduccion ? 'tiny' : 'dev'));

// CORS solo hace falta cuando el frontend vive en otro dominio. Se usa la forma
// delegada para poder comparar contra el propio host: los assets del build
// llevan el atributo `crossorigin`, así que también pasan por aquí aunque sean
// del mismo origen. A un origen no permitido simplemente no se le mandan las
// cabeceras CORS (el navegador bloquea); no se responde con error.
app.use(
  cors((req, cb) => {
    const origen = req.headers.origin;
    const mismoOrigen = origen === `${req.protocol}://${req.headers.host}`;
    const permitido = !origen || mismoOrigen || env.corsOrigins.includes(origen);
    cb(null, { origin: permitido });
  })
);

app.use(auth);

app.get('/api/salud', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ ok: true, db: 'ok', hora: new Date().toISOString() });
  } catch {
    res.status(503).json({ ok: false, db: 'sin conexión' });
  }
});

app.use('/api/auth', authRouter);
app.use('/api/admin', adminRouter);
app.use('/api', publicRouter);

// --- SPA --------------------------------------------------------------------
// En produccion este mismo servicio sirve el build de React. Asi Railway solo
// necesita un servicio, no hay CORS y todo vive bajo el mismo dominio.
if (fs.existsSync(env.clientDist)) {
  app.use(express.static(env.clientDist, { maxAge: '1h', index: false }));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(env.clientDist, 'index.html'));
  });
} else if (env.esProduccion) {
  console.warn(`[server] No se encontró el build del frontend en ${env.clientDist}.`);
}

app.use(notFoundHandler);
app.use(errorHandler);

// Prepara la base si es un despliegue nuevo (disciplinas + administrador). Es
// solo-inserción, así que en arranques posteriores no hace nada.
try {
  reportarBootstrap(await bootstrap());
} catch (e) {
  // Un fallo aquí no debe impedir que la app sirva: puede ser una base que
  // todavía no termina de aceptar conexiones.
  console.error('[inicio] No se pudo preparar la base:', e.message);
}

const servidor = app.listen(env.puerto, () => {
  console.log(`[server] Escuchando en http://localhost:${env.puerto} (${env.esProduccion ? 'producción' : 'desarrollo'})`);
});

for (const senal of ['SIGTERM', 'SIGINT']) {
  process.on(senal, async () => {
    console.log(`[server] ${senal} recibido, cerrando...`);
    servidor.close();
    await prisma.$disconnect();
    process.exit(0);
  });
}
