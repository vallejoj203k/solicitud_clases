/**
 * Estados de una reserva y qué significan para el cupo.
 *
 * DECISIÓN CLAVE: una reserva sin pagar **no aparta el puesto**. Mientras el
 * pago no esté verificado, la bicicleta sigue a la venta y se la lleva quien
 * confirme primero. Es lo que pidió el gimnasio: quien empieza a pagar y se
 * arrepiente no deja un cupo muerto.
 *
 * El precio de esa decisión es que dos personas pueden pagar por el mismo
 * puesto. La app no lo puede evitar -nadie avisa mientras alguien transfiere-,
 * así que lo detecta al confirmar: el primero se queda con el puesto y el
 * segundo queda marcado en `notasPago` para que recepción le devuelva o lo
 * reubique. Ver `confirmarOcupacion` en reserva.service.js.
 */

/** Ocupan un puesto en el mapa y consumen cupo. Solo las reservas firmes. */
export const ESTADOS_OCUPAN_PUESTO = ['CONFIRMADA', 'ASISTIO', 'NO_SHOW'];

/** Reservas ya firmes: son las que cuentan para reportes, ingresos y asistencia. */
export const ESTADOS_CONFIRMADOS = ['CONFIRMADA', 'ASISTIO', 'NO_SHOW'];

/** Esperando que alguien verifique el pago. No ocupan nada. */
export const ESTADOS_SIN_PAGAR = ['PENDIENTE_PAGO'];

/** Terminadas sin efecto. */
export const ESTADOS_LIBERAN = ['CANCELADA', 'EXPIRADA'];
