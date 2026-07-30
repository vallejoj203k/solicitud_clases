import { prisma } from '../config/prisma.js';
import { AppError } from '../utils/errores.js';

/**
 * Capa de pagos.
 *
 * Hoy el unico "proveedor" es MANUAL: el cliente paga en efectivo o por
 * transferencia en recepcion y el administrador lo marca desde el panel.
 *
 * Para enchufar Wompi o Stripe mas adelante NO hace falta tocar el modelo de
 * datos: la reserva ya guarda `estadoPago`, `metodoPago`, `pagoRef` (id de la
 * transaccion externa) y `pagoPayload` (respuesta cruda del proveedor).
 * El camino seria:
 *   1. Implementar `iniciarPagoOnline()` creando la transaccion en el proveedor
 *      y devolviendo la URL de checkout.
 *   2. Exponer POST /api/pagos/webhook que valide la firma del proveedor y
 *      llame a `registrarResultadoExterno()`.
 * El resto de la app (panel, reportes, CSV) ya lee de esos mismos campos.
 */

const METODOS_MANUALES = ['efectivo', 'transferencia', 'datafono', 'cortesia'];

export async function actualizarEstadoPago(reservaId, { estadoPago, metodoPago, pagoRef, montoCop }) {
  if (metodoPago && !METODOS_MANUALES.includes(metodoPago)) {
    throw new AppError(`Método de pago no reconocido: ${metodoPago}`, 422, 'METODO_INVALIDO');
  }

  return prisma.reserva.update({
    where: { id: reservaId },
    data: {
      estadoPago,
      ...(metodoPago ? { metodoPago } : {}),
      ...(pagoRef !== undefined ? { pagoRef } : {}),
      ...(montoCop !== undefined ? { montoCop } : {}),
      pagoActualizadoEn: new Date(),
    },
    include: {
      clase: { include: { tipoClase: true, instructor: true } },
      usuario: { select: { id: true, nombre: true, telefono: true } },
    },
  });
}

/** Punto de extension para una pasarela (Wompi / Stripe). Aun no implementado. */
export async function iniciarPagoOnline() {
  throw new AppError(
    'Los pagos en línea todavía no están habilitados. El pago se registra en recepción.',
    501,
    'PAGO_ONLINE_NO_DISPONIBLE'
  );
}

/** Punto de entrada para el webhook de la pasarela. Aun no implementado. */
export async function registrarResultadoExterno({ pagoRef, estadoPago, payload, proveedor }) {
  const reserva = await prisma.reserva.findFirst({ where: { pagoRef } });
  if (!reserva) throw new AppError('No hay una reserva con esa referencia de pago.', 404, 'NO_ENCONTRADO');

  return prisma.reserva.update({
    where: { id: reserva.id },
    data: { estadoPago, metodoPago: proveedor, pagoPayload: payload, pagoActualizadoEn: new Date() },
  });
}
