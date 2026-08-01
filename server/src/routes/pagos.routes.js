import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, AppError, noEncontrado } from '../utils/errores.js';
import { env } from '../config/env.js';
import { prisma } from '../config/prisma.js';
import {
  wompiConfigurado,
  construirCheckout,
  verificarFirmaEvento,
  traducirEstado,
  consultarTransaccion,
  metodoDeTransaccion,
} from '../services/wompi.service.js';
import { aplicarResultadoPago, expirarReservasVencidas } from '../services/reserva.service.js';
import { enviarConfirmacionReserva } from '../services/notificaciones.service.js';
import { generarIcs } from '../utils/ics.js';

export const pagosRouter = Router();

/** La referencia que viaja a Wompi es el código de la reserva. */
const urlRetorno = (codigo) => `${env.appUrl}/reserva/${codigo}`;

/**
 * Devuelve la URL de checkout de una reserva que está esperando pago.
 *
 * Se puede pedir varias veces: si la persona cerró la pasarela y vuelve, se le
 * genera de nuevo mientras el puesto siga apartado.
 */
pagosRouter.get(
  '/reservas/:codigo/checkout',
  asyncHandler(async (req, res) => {
    const codigo = String(req.params.codigo).toUpperCase();
    const reserva = await prisma.reserva.findUnique({
      where: { codigo },
      include: { usuario: { select: { email: true } } },
    });
    if (!reserva) throw noEncontrado('Reserva');

    if (reserva.estado !== 'PENDIENTE_PAGO') {
      throw new AppError(
        reserva.estadoPago === 'PAGADO'
          ? 'Esta reserva ya está pagada.'
          : 'Esta reserva ya no está esperando pago.',
        409,
        'NO_ESPERA_PAGO'
      );
    }
    if (reserva.expiraEn && reserva.expiraEn.getTime() < Date.now()) {
      await expirarReservasVencidas();
      throw new AppError('Se venció el tiempo para pagar y el puesto quedó libre.', 409, 'PAGO_EXPIRADO');
    }

    const { url } = construirCheckout({
      referencia: reserva.codigo,
      montoCop: reserva.montoCop,
      correo: reserva.usuario?.email ?? undefined,
      urlRetorno: urlRetorno(reserva.codigo),
    });

    res.json({ url, expiraEn: reserva.expiraEn?.toISOString() ?? null });
  })
);

/**
 * Webhook de Wompi. Es la fuente autoritativa del resultado: el cliente puede
 * cerrar el navegador sin volver, pero este evento llega igual.
 *
 * La firma se valida SIEMPRE. Sin eso, cualquiera podría hacer POST aquí
 * diciendo que pagó y llevarse un cupo gratis.
 */
pagosRouter.post(
  '/pagos/wompi/webhook',
  asyncHandler(async (req, res) => {
    if (!wompiConfigurado()) {
      return res.status(503).json({ error: 'Pagos en línea no configurados.' });
    }
    if (!verificarFirmaEvento(req.body)) {
      console.warn('[wompi] Evento con firma inválida, descartado.');
      return res.status(401).json({ error: 'Firma inválida.' });
    }

    const transaccion = req.body?.data?.transaction;
    if (!transaccion?.reference) {
      return res.status(400).json({ error: 'Evento sin referencia.' });
    }

    const estadoPago = traducirEstado(transaccion.status);
    // PENDING no cambia nada: el puesto sigue apartado hasta que se resuelva.
    if (estadoPago === 'PENDIENTE') return res.json({ recibido: true, aplicado: false });

    const { reserva, cambio } = await aplicarResultadoPago({
      referencia: transaccion.reference,
      estadoPago,
      pagoRef: transaccion.id,
      payload: transaccion,
      metodoPago: metodoDeTransaccion(transaccion),
    });

    if (cambio && estadoPago === 'PAGADO') {
      enviarConfirmacionReserva(reserva, generarIcs(reserva)).catch(() => {});
    }

    // Wompi reintenta mientras no reciba 2xx.
    res.json({ recibido: true, aplicado: cambio });
  })
);

/**
 * Estado del pago de una reserva, para la pantalla de "confirmando pago".
 *
 * Si todavía figura pendiente y el cliente trae el id de transacción del
 * redirect, se le pregunta directamente a Wompi en vez de esperar el webhook:
 * así la confirmación es inmediata aunque el evento se demore.
 */
const consulta = z.object({ id: z.string().min(6).optional() });

pagosRouter.get(
  '/reservas/:codigo/estado-pago',
  asyncHandler(async (req, res) => {
    const { id } = consulta.parse(req.query);
    const codigo = String(req.params.codigo).toUpperCase();

    let reserva = await prisma.reserva.findUnique({ where: { codigo } });
    if (!reserva) throw noEncontrado('Reserva');

    if (reserva.estado === 'PENDIENTE_PAGO' && id && wompiConfigurado()) {
      try {
        const transaccion = await consultarTransaccion(id);
        // La transacción tiene que ser de ESTA reserva: si no, se ignora.
        if (transaccion?.reference === codigo) {
          const estadoPago = traducirEstado(transaccion.status);
          if (estadoPago !== 'PENDIENTE') {
            const resultado = await aplicarResultadoPago({
              referencia: codigo,
              estadoPago,
              pagoRef: transaccion.id,
              payload: transaccion,
            });
            reserva = resultado.reserva;
            if (resultado.cambio && estadoPago === 'PAGADO') {
              enviarConfirmacionReserva(resultado.reserva, generarIcs(resultado.reserva)).catch(() => {});
            }
          }
        }
      } catch (e) {
        // Si Wompi no responde seguimos esperando el webhook; no es un error
        // para el cliente.
        console.warn('[wompi] No se pudo consultar la transacción:', e.message);
      }
    }

    res.json({
      codigo: reserva.codigo,
      estado: reserva.estado,
      estadoPago: reserva.estadoPago,
      expiraEn: reserva.expiraEn?.toISOString() ?? null,
      notasPago: reserva.notasPago,
    });
  })
);
