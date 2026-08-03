import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, AppError } from '../utils/errores.js';
import { buscar, catalogo, hayYoutube } from '../services/youtube.service.js';
import {
  buscarCanciones,
  cancionesDeLaCasa,
  colaActual,
  estadoReproduccion,
  pedirCancion,
  quitarPedido,
} from '../services/musica.service.js';

/**
 * Musica para el cliente.
 *
 * PEDIR NO EXIGE RESERVA NI SESION. El gimnasio lo pidio asi: quien esta en el
 * salon quiere poner musica sin haber reservado por la app. Lo que identifica a
 * quien pide es su sesion de cliente si la tiene y, si no, un identificador que
 * el navegador genera y guarda: sirve para repartir los turnos y para que cada
 * quien pueda quitar lo suyo.
 *
 * Buscar SI pide algo mas: cada busqueda gasta 100 unidades de la cuota diaria
 * de YouTube, y son 10.000 al dia para todo el gimnasio. Basta con mandar el
 * identificador de dispositivo, que cualquier navegador tiene: no cierra la
 * puerta, pero evita que un script anonimo agote la cuota en un minuto.
 */
export const musicaRouter = Router();

/** Identificador del navegador que pide, si lo manda. */
const dispositivoDe = (req) => {
  const cabecera = req.get('X-Dispositivo');
  return typeof cabecera === 'string' && cabecera.length >= 8 && cabecera.length <= 64
    ? cabecera
    : null;
};

/** Buscar en todo YouTube. */
musicaRouter.get(
  '/musica/buscar',
  asyncHandler(async (req, res) => {
    if (!req.usuario?.sub && !dispositivoDe(req)) {
      throw new AppError('Recarga la página e inténtalo de nuevo.', 400, 'SIN_DISPOSITIVO');
    }
    const q = typeof req.query.q === 'string' ? req.query.q : '';
    res.json(await buscar(q));
  })
);

/** Catalogo para ojear sin buscar, y las de la casa como respaldo. */
musicaRouter.get(
  '/musica/catalogo',
  asyncHandler(async (_req, res) => {
    const [grupos, deLaCasa] = await Promise.all([
      // Que el catalogo de YouTube falle no debe dejar la pantalla vacia: las
      // de la casa siguen estando.
      hayYoutube() ? catalogo().catch(() => []) : Promise.resolve([]),
      cancionesDeLaCasa(),
    ]);
    res.json({ hayYoutube: hayYoutube(), grupos, deLaCasa });
  })
);

/** Que suena ahora en el gimnasio y que viene. */
musicaRouter.get(
  '/musica/ahora',
  asyncHandler(async (_req, res) => {
    res.json(await estadoReproduccion());
  })
);

/** La cola completa. */
musicaRouter.get(
  '/musica/cola',
  asyncHandler(async (_req, res) => {
    res.json(await colaActual());
  })
);

/** Lo que ya se ha pedido alguna vez, sin gastar cuota. */
musicaRouter.get(
  '/canciones',
  asyncHandler(async (req, res) => {
    const q = typeof req.query.q === 'string' ? req.query.q : undefined;
    res.json(await buscarCanciones({ q }));
  })
);

musicaRouter.get(
  '/canciones/de-la-casa',
  asyncHandler(async (_req, res) => {
    res.json(await cancionesDeLaCasa());
  })
);

const pedidoSchema = z
  .object({
    videoId: z
      .string()
      .regex(/^[\w-]{11}$/)
      .optional(),
    cancionId: z.string().min(1).optional(),
  })
  .refine((d) => d.videoId || d.cancionId, { message: 'Falta la canción.' });

/** Pedir una cancion para los parlantes. */
musicaRouter.post(
  '/musica/pedir',
  asyncHandler(async (req, res) => {
    const { videoId, cancionId } = pedidoSchema.parse(req.body);
    const pedido = await pedirCancion({
      videoId,
      cancionId,
      usuarioId: req.usuario?.rol === 'CLIENTE' ? req.usuario.sub : null,
      dispositivoId: dispositivoDe(req),
    });
    res.status(201).json(pedido);
  })
);

/** Quitar lo propio mientras no haya sonado ni este sonando. */
musicaRouter.delete(
  '/musica/:pedidoId',
  asyncHandler(async (req, res) => {
    res.json(
      await quitarPedido({
        pedidoId: req.params.pedidoId,
        usuarioId: req.usuario?.rol === 'CLIENTE' ? req.usuario.sub : null,
        dispositivoId: dispositivoDe(req),
      })
    );
  })
);
