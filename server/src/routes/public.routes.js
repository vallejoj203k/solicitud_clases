import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../utils/errores.js';
import { prisma } from '../config/prisma.js';
import { firmarToken } from '../middleware/auth.js';
import { generarIcs } from '../utils/ics.js';
import { diasParaCarrusel, formatearLargo } from '../utils/fechas.js';
import { listarClases, obtenerDisponibilidad, resumenHome } from '../services/disponibilidad.service.js';
import {
  crearReserva,
  obtenerPorCodigo,
  listarReservasDeUsuario,
  cancelarReserva,
} from '../services/reserva.service.js';
import { AppError } from '../utils/errores.js';

export const publicRouter = Router();

/** Forma con la que viaja una reserva al frontend. */
function serializarReserva(r) {
  return {
    id: r.id,
    codigo: r.codigo,
    puestoCodigo: r.puestoCodigo,
    estado: r.estado,
    estadoPago: r.estadoPago,
    montoCop: r.montoCop,
    creadoEn: r.creadoEn.toISOString(),
    cliente: r.usuario ? { id: r.usuario.id, nombre: r.usuario.nombre, telefono: r.usuario.telefono } : null,
    clase: {
      id: r.clase.id,
      inicioEn: r.clase.inicioEn.toISOString(),
      duracionMin: r.clase.duracionMin,
      estado: r.clase.estado,
      etiqueta: formatearLargo(r.clase.inicioEn),
      instructor: r.clase.instructor?.nombre ?? null,
      tipoClase: {
        slug: r.clase.tipoClase.slug,
        nombre: r.clase.tipoClase.nombre,
        color: r.clase.tipoClase.color,
        icono: r.clase.tipoClase.icono,
      },
    },
  };
}

// --- Pantalla principal: disciplinas con sus proximos horarios ---------------
publicRouter.get(
  '/inicio',
  asyncHandler(async (_req, res) => {
    const [tipos, dias] = await Promise.all([
      resumenHome({ horariosPorTipo: 3 }),
      Promise.resolve(diasParaCarrusel(7)),
    ]);
    res.json({ tipos, dias });
  })
);

publicRouter.get(
  '/tipos-clase',
  asyncHandler(async (_req, res) => {
    const tipos = await prisma.tipoClase.findMany({
      where: { activo: true },
      orderBy: { orden: 'asc' },
    });
    res.json(
      tipos.map((t) => ({
        id: t.id,
        slug: t.slug,
        nombre: t.nombre,
        descripcion: t.descripcion,
        color: t.color,
        icono: t.icono,
        precioCop: t.precioCop,
      }))
    );
  })
);

const filtroClases = z.object({
  tipo: z.string().optional(),
  desde: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  hasta: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

publicRouter.get(
  '/clases',
  asyncHandler(async (req, res) => {
    const { tipo, desde, hasta } = filtroClases.parse(req.query);
    const clases = await listarClases({ tipoSlug: tipo, desde, hasta });
    res.json({ dias: diasParaCarrusel(7), clases });
  })
);

publicRouter.get(
  '/clases/:id/disponibilidad',
  asyncHandler(async (req, res) => {
    res.json(await obtenerDisponibilidad(req.params.id));
  })
);

// --- Reservar ---------------------------------------------------------------
const nuevaReserva = z.object({
  claseId: z.string().min(1),
  puestoCodigo: z.string().min(1).max(6),
  nombre: z.string().trim().min(2, 'Escribe tu nombre').max(60).optional(),
  telefono: z.string().trim().min(7, 'Teléfono inválido').max(20).optional(),
});

publicRouter.post(
  '/reservas',
  asyncHandler(async (req, res) => {
    const datos = nuevaReserva.parse(req.body);
    // Si el dispositivo ya tiene sesion de cliente reusamos su usuario y no le
    // volvemos a pedir nombre ni telefono.
    const usuarioId = req.usuario?.rol === 'CLIENTE' ? req.usuario.sub : undefined;

    if (!usuarioId && (!datos.nombre || !datos.telefono)) {
      throw new AppError('Necesitamos tu nombre y tu teléfono.', 422, 'DATOS_INCOMPLETOS');
    }

    const reserva = await crearReserva({ ...datos, usuarioId });
    const token = firmarToken({ sub: reserva.usuarioId, rol: 'CLIENTE', nombre: reserva.usuario.nombre }, 'CLIENTE');

    res.status(201).json({
      reserva: serializarReserva(reserva),
      // El token queda en el dispositivo: es lo que le permite ver y cancelar
      // sus reservas sin tener que crear una contrasena.
      token,
      cliente: {
        id: reserva.usuario.id,
        nombre: reserva.usuario.nombre,
        telefono: reserva.usuario.telefono,
      },
    });
  })
);

publicRouter.get(
  '/reservas/:codigo',
  asyncHandler(async (req, res) => {
    const reserva = await obtenerPorCodigo(req.params.codigo);
    res.json(serializarReserva(reserva));
  })
);

publicRouter.get(
  '/reservas/:codigo/calendario.ics',
  asyncHandler(async (req, res) => {
    const reserva = await obtenerPorCodigo(req.params.codigo);
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="clase-${reserva.codigo}.ics"`);
    res.send(generarIcs(reserva));
  })
);

publicRouter.get(
  '/mis-reservas',
  asyncHandler(async (req, res) => {
    if (!req.usuario?.sub) return res.json([]);
    const reservas = await listarReservasDeUsuario(req.usuario.sub);
    res.json(reservas.map(serializarReserva));
  })
);

publicRouter.post(
  '/reservas/:codigo/cancelar',
  asyncHandler(async (req, res) => {
    if (!req.usuario?.sub) throw new AppError('Sesión no encontrada.', 401, 'NO_AUTENTICADO');
    const reserva = await cancelarReserva({ codigo: req.params.codigo, usuarioId: req.usuario.sub });
    res.json(serializarReserva(reserva));
  })
);
