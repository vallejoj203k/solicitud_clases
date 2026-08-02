import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, AppError } from '../utils/errores.js';
import {
  buscarCanciones,
  cancionesDeLaCasa,
  filaDeClase,
  pedirCancion,
  quitarPedido,
} from '../services/musica.service.js';

/**
 * Música para el cliente.
 *
 * Buscar en el catálogo es público -no expone nada sensible y así la pantalla
 * carga sin sesión-, pero pedir requiere el token del cliente: solo pide quien
 * tiene reserva en esa clase.
 */
export const musicaRouter = Router();

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

const pedidoSchema = z.object({ cancionId: z.string().min(1) });

musicaRouter.post(
  '/clases/:id/musica',
  asyncHandler(async (req, res) => {
    if (!req.usuario?.sub) throw new AppError('Sesión no encontrada.', 401, 'NO_AUTENTICADO');
    const { cancionId } = pedidoSchema.parse(req.body);
    const pedido = await pedirCancion({
      claseId: req.params.id,
      cancionId,
      usuarioId: req.usuario.sub,
    });
    res.status(201).json(pedido);
  })
);

musicaRouter.delete(
  '/musica/:pedidoId',
  asyncHandler(async (req, res) => {
    if (!req.usuario?.sub) throw new AppError('Sesión no encontrada.', 401, 'NO_AUTENTICADO');
    res.json(await quitarPedido({ pedidoId: req.params.pedidoId, usuarioId: req.usuario.sub }));
  })
);
