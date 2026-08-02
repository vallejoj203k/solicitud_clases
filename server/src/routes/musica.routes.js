import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, AppError } from '../utils/errores.js';
import { buscar, catalogo, hayYoutube } from '../services/youtube.service.js';
import {
  buscarCanciones,
  cancionesDeLaCasa,
  estadoReproduccion,
  filaDeClase,
  pedirCancion,
  quitarPedido,
} from '../services/musica.service.js';

/**
 * Musica para el cliente.
 *
 * Lo que solo se mira -que suena ahora, la fila, el catalogo- es publico: la
 * pantalla del gimnasio y cualquier telefono lo cargan sin pedir nada. Buscar y
 * pedir SI exigen el token del cliente:
 *
 *  - buscar, porque cada busqueda gasta 100 unidades de la cuota diaria de
 *    YouTube y son 10.000 al dia para todo el gimnasio;
 *  - pedir, porque solo debe poner musica quien tiene reserva en esa clase.
 */
export const musicaRouter = Router();

const exigirSesion = (req) => {
  if (!req.usuario?.sub) throw new AppError('Sesión no encontrada.', 401, 'NO_AUTENTICADO');
  return req.usuario.sub;
};

/** Buscar en todo YouTube. */
musicaRouter.get(
  '/musica/buscar',
  asyncHandler(async (req, res) => {
    exigirSesion(req);
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
  asyncHandler(async (req, res) => {
    const claseId = typeof req.query.clase === 'string' ? req.query.clase : null;
    res.json(await estadoReproduccion(claseId));
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

musicaRouter.get(
  '/clases/:id/musica',
  asyncHandler(async (req, res) => {
    res.json(await filaDeClase(req.params.id));
  })
);

// Se acepta el video de YouTube o, para lo que quedo del catalogo de texto, el
// id interno de la cancion.
const pedidoSchema = z
  .object({
    videoId: z
      .string()
      .regex(/^[\w-]{11}$/)
      .optional(),
    cancionId: z.string().min(1).optional(),
  })
  .refine((d) => d.videoId || d.cancionId, { message: 'Falta la canción.' });

musicaRouter.post(
  '/clases/:id/musica',
  asyncHandler(async (req, res) => {
    const usuarioId = exigirSesion(req);
    const { videoId, cancionId } = pedidoSchema.parse(req.body);
    const pedido = await pedirCancion({
      claseId: req.params.id,
      videoId,
      cancionId,
      usuarioId,
    });
    res.status(201).json(pedido);
  })
);

musicaRouter.delete(
  '/musica/:pedidoId',
  asyncHandler(async (req, res) => {
    const usuarioId = exigirSesion(req);
    res.json(await quitarPedido({ pedidoId: req.params.pedidoId, usuarioId }));
  })
);
