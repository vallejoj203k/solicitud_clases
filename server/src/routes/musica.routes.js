import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, AppError } from '../utils/errores.js';
import { catalogo, hayYoutube, populares } from '../services/youtube.service.js';
import {
  buscarCanciones,
  cancionesDeLaCasa,
  colaActual,
  estadoReproduccion,
  pedirCancion,
  quitarPedido,
  buscarParaPedir,
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

/**
 * Buscar una canción.
 *
 * MIRA PRIMERO LO QUE YA HAY. El catálogo -todo lo que el gimnasio importó o
 * alguien pidió alguna vez- está en la base y no cuesta cuota; YouTube cobra 100
 * unidades por búsqueda, de las 10.000 que da el día. Poner delante lo local
 * hace que las canciones que se piden a menudo salgan gratis.
 *
 * Y CUANDO SE ACABA LA CUOTA, LA PANTALLA SIGUE SIRVIENDO: se devuelve lo local
 * con un aviso, en vez de un error. El gimnasio se quedó una tarde sin poder
 * pedir nada por esto.
 */
musicaRouter.get(
  '/musica/buscar',
  asyncHandler(async (req, res) => {
    if (!req.usuario?.sub && !dispositivoDe(req)) {
      throw new AppError('Recarga la página e inténtalo de nuevo.', 400, 'SIN_DISPOSITIVO');
    }
    res.json(await buscarParaPedir(typeof req.query.q === 'string' ? req.query.q : ''));
  })
);

/**
 * Lo mas escuchado ahora mismo, que es con lo que abre la pantalla del cliente.
 *
 * Sale del ranking de musica de YouTube para el pais: se actualiza cuando ellos
 * lo actualizan, y cuesta 1 unidad de cuota, no 100 como una busqueda.
 */
musicaRouter.get(
  '/musica/populares',
  asyncHandler(async (_req, res) => {
    if (!hayYoutube()) return res.json([]);
    res.json(await populares(40).catch(() => []));
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
