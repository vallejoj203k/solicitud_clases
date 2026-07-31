/**
 * Estados de una reserva y qué significan para el cupo.
 *
 * La distinción importa desde que existe el pago en línea: una reserva en
 * PENDIENTE_PAGO **aparta el puesto** (nadie más lo puede tomar mientras la
 * persona paga) pero **no es una venta**: no cuenta como ingreso ni aparece en
 * el reporte de pagos hasta que Wompi confirma.
 */

/** Ocupan un puesto en el mapa y consumen cupo. */
export const ESTADOS_OCUPAN_PUESTO = ['PENDIENTE_PAGO', 'CONFIRMADA', 'ASISTIO', 'NO_SHOW'];

/** Reservas ya firmes: son las que cuentan para reportes, ingresos y asistencia. */
export const ESTADOS_CONFIRMADOS = ['CONFIRMADA', 'ASISTIO', 'NO_SHOW'];

/** Terminadas sin efecto: liberan el puesto. */
export const ESTADOS_LIBERAN = ['CANCELADA', 'EXPIRADA'];
