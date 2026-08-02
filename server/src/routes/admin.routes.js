import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../config/prisma.js';
import { asyncHandler, noEncontrado } from '../utils/errores.js';
import { requiereAdmin } from '../middleware/auth.js';
import { layoutSchema, expandirLayout } from '../utils/layout.js';
import { aCsv } from '../utils/csv.js';
import { listarClases } from '../services/disponibilidad.service.js';
import {
  crearClase,
  crearClasesEnLote,
  actualizarClase,
  actualizarPrecioTipo,
  cancelarClase,
  eliminarClase,
  eliminarClasesEnLote,
} from '../services/clase.service.js';
import { actualizarEstadoPago } from '../services/pago.service.js';
import { cancelarReserva, marcarAsistencia } from '../services/reserva.service.js';
import { enviarConfirmacionReserva } from '../services/notificaciones.service.js';
import { generarIcs } from '../utils/ics.js';
import {
  buscarCanciones,
  crearCancion,
  importarDeYoutube,
  guardarDeYoutube,
  actualizarCancion,
  eliminarCancion,
  filaDeClase,
  marcarSono,
  siguienteCancion,
  quitarPedido,
  MOMENTOS,
} from '../services/musica.service.js';
import { buscar as buscarEnYoutube } from '../services/youtube.service.js';
import {
  dashboard,
  buscarReservas,
  agendaRecepcion,
  pagosPorConfirmar,
  mapaConOcupantes,
  reservasDeClase,
  reportePagos,
  listarClientes,
  detalleCliente,
  COLUMNAS_CSV,
} from '../services/reporte.service.js';

export const adminRouter = Router();
adminRouter.use(requiereAdmin);

// --- 1. Dashboard -----------------------------------------------------------
adminRouter.get(
  '/dashboard',
  asyncHandler(async (_req, res) => res.json(await dashboard()))
);

// --- 2. Gestion de horarios -------------------------------------------------
const claseSchema = z.object({
  tipoClaseId: z.string().min(1),
  instructorId: z.string().nullish(),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato YYYY-MM-DD'),
  hora: z.string().regex(/^\d{2}:\d{2}$/, 'Formato HH:mm'),
  duracionMin: z.number().int().min(10).max(240).default(50),
  cupoMaximo: z.number().int().min(1).max(200),
  precioCop: z.number().int().min(0).optional(),
  layoutOverride: layoutSchema.nullish(),
  puestosBloqueados: z.array(z.string()).default([]),
  notas: z.string().max(300).nullish(),
});

adminRouter.get(
  '/clases',
  asyncHandler(async (req, res) => {
    const { desde, hasta, tipo, incluirPasadas } = req.query;
    const clases = await listarClases({
      tipoSlug: tipo || undefined,
      desde: desde || undefined,
      hasta: hasta || undefined,
      incluirPasadas: incluirPasadas === 'true',
      incluirCanceladas: true,
    });
    res.json(clases);
  })
);

adminRouter.post(
  '/clases',
  asyncHandler(async (req, res) => {
    const clase = await crearClase(claseSchema.parse(req.body));
    res.status(201).json(clase);
  })
);

const loteSchema = claseSchema.omit({ fecha: true, hora: true }).extend({
  desde: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  hasta: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  diasSemana: z.array(z.number().int().min(0).max(6)).min(1),
  horas: z.array(z.string().regex(/^\d{2}:\d{2}$/)).min(1),
});

adminRouter.post(
  '/clases/lote',
  asyncHandler(async (req, res) => {
    const creadas = await crearClasesEnLote(loteSchema.parse(req.body));
    res.status(201).json({ creadas: creadas.length, clases: creadas });
  })
);

adminRouter.patch(
  '/clases/:id',
  asyncHandler(async (req, res) => {
    const parcial = claseSchema.partial().extend({ estado: z.enum(['ACTIVA', 'CANCELADA']).optional() });
    res.json(await actualizarClase(req.params.id, parcial.parse(req.body)));
  })
);

/**
 * Borrado por rango. `simular: true` solo cuenta, para que la pantalla enseñe
 * qué va a pasar antes de que el administrador confirme.
 */
const borradoEnLoteSchema = z.object({
  desde: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  hasta: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  tipoSlug: z.string().min(1).optional(),
  cancelarResto: z.boolean().optional(),
  simular: z.boolean().optional(),
});

adminRouter.post(
  '/clases/eliminar-lote',
  asyncHandler(async (req, res) => {
    const datos = borradoEnLoteSchema.parse(req.body);
    if (datos.hasta < datos.desde) {
      throw new AppError('El rango termina antes de empezar.', 422, 'RANGO_INVALIDO');
    }
    res.json(await eliminarClasesEnLote(datos));
  })
);

adminRouter.post(
  '/clases/:id/cancelar',
  asyncHandler(async (req, res) => res.json(await cancelarClase(req.params.id)))
);

adminRouter.delete(
  '/clases/:id',
  asyncHandler(async (req, res) => res.json(await eliminarClase(req.params.id)))
);

// --- 3. Vista por clase: inscritos ------------------------------------------
adminRouter.get(
  '/clases/:id/reservas',
  asyncHandler(async (req, res) => {
    const datos = await reservasDeClase(req.params.id);
    if (!datos) throw noEncontrado('Clase');
    res.json(datos);
  })
);

const pagoSchema = z.object({
  estadoPago: z.enum(['PENDIENTE', 'PAGADO', 'RECHAZADO']),
  metodoPago: z.enum(['efectivo', 'transferencia', 'datafono', 'cortesia']).nullish(),
  montoCop: z.number().int().min(0).optional(),
});

adminRouter.patch(
  '/reservas/:id/pago',
  asyncHandler(async (req, res) => {
    const datos = pagoSchema.parse(req.body);
    const { reserva, confirmada } = await actualizarEstadoPago(req.params.id, datos);

    // Si el pago convirtio un puesto apartado en reserva confirmada, el cliente
    // merece el mismo correo que recibe quien paga por la pasarela. Un correo
    // que falla nunca tumba la confirmacion.
    if (confirmada) {
      enviarConfirmacionReserva(reserva, generarIcs(reserva)).catch(() => {});
    }

    res.json(reserva);
  })
);

/**
 * Cola del mostrador: quienes dijeron "ya transferi" y esperan que alguien
 * coteje contra la notificacion del banco.
 */
adminRouter.get(
  '/pagos-por-confirmar',
  asyncHandler(async (_req, res) => {
    res.json(await pagosPorConfirmar());
  })
);

adminRouter.post(
  '/reservas/:id/cancelar',
  asyncHandler(async (req, res) => {
    res.json(await cancelarReserva({ reservaId: req.params.id, porAdmin: true }));
  })
);

adminRouter.post(
  '/reservas/:id/asistencia',
  asyncHandler(async (req, res) => {
    const { asistio } = z.object({ asistio: z.boolean() }).parse(req.body);
    res.json(await marcarAsistencia(req.params.id, asistio));
  })
);

// --- 4. Reporte de pagos ----------------------------------------------------
const reporteSchema = z.object({
  desde: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  hasta: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  tipo: z.string().optional(),
  estadoPago: z.enum(['PENDIENTE', 'PAGADO', 'RECHAZADO']).optional(),
});

adminRouter.get(
  '/reportes/pagos',
  asyncHandler(async (req, res) => {
    const { tipo, ...resto } = reporteSchema.parse(req.query);
    res.json(await reportePagos({ ...resto, tipoSlug: tipo }));
  })
);

adminRouter.get(
  '/reportes/pagos.csv',
  asyncHandler(async (req, res) => {
    const { tipo, ...resto } = reporteSchema.parse(req.query);
    const reporte = await reportePagos({ ...resto, tipoSlug: tipo });
    const nombre = `pagos_${resto.desde ?? 'inicio'}_${resto.hasta ?? 'hoy'}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${nombre}"`);
    res.send(aCsv(COLUMNAS_CSV, reporte.filas));
  })
);

// --- Check-in en recepcion --------------------------------------------------
/** Clases ordenadas de la mas cercana a la mas lejana. */
adminRouter.get(
  '/agenda',
  asyncHandler(async (req, res) => {
    const dias = Math.min(Number(req.query.dias ?? 7) || 7, 30);
    res.json(await agendaRecepcion({ dias }));
  })
);

/** Mapa del salon con quien reservo cada puesto. */
adminRouter.get(
  '/clases/:id/mapa',
  asyncHandler(async (req, res) => {
    res.json(await mapaConOcupantes(req.params.id));
  })
);

adminRouter.get(
  '/buscar',
  asyncHandler(async (req, res) => {
    res.json(await buscarReservas(req.query.q));
  })
);

// --- 5. Clientes ------------------------------------------------------------
adminRouter.get(
  '/clientes',
  asyncHandler(async (req, res) => {
    res.json(await listarClientes({ busqueda: req.query.q || undefined }));
  })
);

adminRouter.get(
  '/clientes/:id',
  asyncHandler(async (req, res) => {
    const cliente = await detalleCliente(req.params.id);
    if (!cliente) throw noEncontrado('Cliente');
    res.json(cliente);
  })
);

// --- Catalogos auxiliares ---------------------------------------------------
adminRouter.get(
  '/tipos-clase',
  asyncHandler(async (_req, res) => {
    const tipos = await prisma.tipoClase.findMany({ orderBy: { orden: 'asc' } });
    res.json(
      tipos.map((t) => ({
        ...t,
        // Se envia el layout ya expandido para que el admin lo previsualice sin
        // tener que reimplementar las reglas de numeracion en el frontend.
        layoutExpandido: expandirLayout(t.layoutPuestos),
      }))
    );
  })
);

/**
 * Precio de la disciplina: el que se anuncia en la pantalla principal y el que
 * hereda cada clase nueva.
 */
const precioTipoSchema = z.object({
  precioCop: z.number().int().min(0).max(100_000_000),
  aplicarAProximas: z.boolean().optional(),
});

adminRouter.patch(
  '/tipos-clase/:id',
  asyncHandler(async (req, res) => {
    res.json(await actualizarPrecioTipo(req.params.id, precioTipoSchema.parse(req.body)));
  })
);

adminRouter.get(
  '/instructores',
  asyncHandler(async (_req, res) => {
    res.json(await prisma.instructor.findMany({ where: { activo: true }, orderBy: { nombre: 'asc' } }));
  })
);

adminRouter.post(
  '/instructores',
  asyncHandler(async (req, res) => {
    const datos = z.object({ nombre: z.string().trim().min(2).max(60) }).parse(req.body);
    res.status(201).json(await prisma.instructor.create({ data: datos }));
  })
);

/** Previsualiza un layout arbitrario (usado por el editor de salones del admin). */
adminRouter.post(
  '/layouts/preview',
  asyncHandler(async (req, res) => {
    res.json(expandirLayout(req.body));
  })
);

// --- Musica -----------------------------------------------------------------
/**
 * La app no aloja audio: guarda el id del video de YouTube y lo pone con el
 * reproductor incrustado oficial. Lo que administra el gimnasio aqui son las
 * canciones "de la casa" -las que suenan cuando nadie ha pedido nada- y la fila
 * de cada clase.
 */
adminRouter.get(
  '/canciones',
  asyncHandler(async (req, res) => {
    const q = typeof req.query.q === 'string' ? req.query.q : undefined;
    res.json(await buscarCanciones({ q, incluirInactivas: true, limite: 100 }));
  })
);

const cancionSchema = z.object({
  titulo: z.string().trim().min(1).max(120),
  artista: z.string().trim().max(120).nullish(),
  momento: z.enum(MOMENTOS).nullish(),
  deLaCasa: z.boolean().optional(),
});

adminRouter.post(
  '/canciones',
  asyncHandler(async (req, res) => {
    res.status(201).json(await crearCancion(cancionSchema.parse(req.body)));
  })
);

/**
 * Carga masiva pegando enlaces de YouTube o el de una lista completa. Va por
 * enlaces y no por titulos porque buscar cada titulo costaria 100 unidades de
 * cuota por cancion; con los enlaces son 50 canciones por unidad.
 */
adminRouter.post(
  '/canciones/importar',
  asyncHandler(async (req, res) => {
    const { texto, deLaCasa = true } = z
      .object({ texto: z.string().min(1).max(100_000), deLaCasa: z.boolean().optional() })
      .parse(req.body);
    res.json(await importarDeYoutube(texto, { deLaCasa }));
  })
);

/** Buscar en YouTube desde el panel, para armar las de la casa. */
adminRouter.get(
  '/musica/buscar',
  asyncHandler(async (req, res) => {
    const q = typeof req.query.q === 'string' ? req.query.q : '';
    res.json(await buscarEnYoutube(q));
  })
);

/** Agregar una cancion de YouTube al catalogo (normalmente, de la casa). */
adminRouter.post(
  '/musica/agregar',
  asyncHandler(async (req, res) => {
    const { videoId, deLaCasa = true } = z
      .object({
        videoId: z.string().regex(/^[\w-]{11}$/),
        deLaCasa: z.boolean().optional(),
      })
      .parse(req.body);
    const cancion = await guardarDeYoutube(videoId);
    res
      .status(201)
      .json(await actualizarCancion(cancion.id, { deLaCasa, activa: true }));
  })
);

adminRouter.patch(
  '/canciones/:id',
  asyncHandler(async (req, res) => {
    const datos = cancionSchema.partial().extend({ activa: z.boolean().optional() }).parse(req.body);
    res.json(await actualizarCancion(req.params.id, datos));
  })
);

adminRouter.delete(
  '/canciones/:id',
  asyncHandler(async (req, res) => {
    res.json(await eliminarCancion(req.params.id));
  })
);

/** La fila de una clase, para que el instructor sepa que sigue. */
adminRouter.get(
  '/clases/:id/musica',
  asyncHandler(async (req, res) => {
    res.json(await filaDeClase(req.params.id));
  })
);

/**
 * El reproductor del gimnasio pide la siguiente cancion.
 *
 * Se llama al terminar la que estaba puesta y tambien al saltarla a mano.
 * Devuelve `sonando: null` con motivo FILA_VACIA cuando nadie ha pedido nada:
 * ahi la pantalla sigue sola con lo que YouTube encadene.
 */
adminRouter.post(
  '/musica/siguiente',
  asyncHandler(async (req, res) => {
    const { clase } = z.object({ clase: z.string().nullish() }).parse(req.body ?? {});
    res.json(await siguienteCancion(clase ?? null));
  })
);

adminRouter.post(
  '/musica/:pedidoId/sono',
  asyncHandler(async (req, res) => {
    const { sono = true } = z.object({ sono: z.boolean().optional() }).parse(req.body ?? {});
    res.json(await marcarSono(req.params.pedidoId, sono));
  })
);

adminRouter.delete(
  '/musica/:pedidoId',
  asyncHandler(async (req, res) => {
    res.json(await quitarPedido({ pedidoId: req.params.pedidoId, porAdmin: true }));
  })
);
