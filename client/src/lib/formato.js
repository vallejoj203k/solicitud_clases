const ZONA = 'America/Bogota';

export const pesos = (valor) =>
  new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(valor ?? 0);

export const numero = (valor) => new Intl.NumberFormat('es-CO').format(valor ?? 0);

/** "6:30 p. m." a partir de "18:30". */
export function hora12(hhmm) {
  const [h, m] = String(hhmm).split(':').map(Number);
  const sufijo = h >= 12 ? 'p.m.' : 'a.m.';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${sufijo}`;
}

/** "jueves, 30 de julio" a partir de "2026-07-30". */
export function fechaLarga(fechaISO) {
  const [a, m, d] = String(fechaISO).split('-').map(Number);
  return new Intl.DateTimeFormat('es-CO', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(a, m - 1, d)));
}

/** Fecha local de hoy en Bogotá como "YYYY-MM-DD". */
export function hoyISO() {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: ZONA,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  return partes; // en-CA ya devuelve YYYY-MM-DD
}

export function sumarDiasISO(fechaISO, dias) {
  const [a, m, d] = String(fechaISO).split('-').map(Number);
  const fecha = new Date(Date.UTC(a, m - 1, d + dias));
  return fecha.toISOString().slice(0, 10);
}

export const ETIQUETA_PAGO = {
  PENDIENTE: 'Pendiente',
  PAGADO: 'Pagado',
  RECHAZADO: 'Rechazado',
};

export const ETIQUETA_RESERVA = {
  CONFIRMADA: 'Confirmada',
  CANCELADA: 'Cancelada',
  ASISTIO: 'Asistió',
  NO_SHOW: 'No asistió',
};

export const ETIQUETA_METODO = {
  efectivo: 'Efectivo',
  transferencia: 'Transferencia',
  datafono: 'Datáfono',
  cortesia: 'Cortesía',
  // Pagos en línea. Se distingue el medio porque cada uno tiene una tarifa
  // distinta: la tarjeta lleva un fijo por transacción y los otros no.
  wompi: 'En línea',
  'wompi-tarjeta': 'Tarjeta',
  'wompi-nequi': 'Nequi',
  'wompi-pse': 'PSE',
  'wompi-bancolombia': 'Botón Bancolombia',
  'wompi-daviplata': 'Daviplata',
};

/** Los que el administrador puede registrar a mano; el resto los pone la pasarela. */
export const METODOS_MANUALES = ['efectivo', 'transferencia', 'datafono', 'cortesia'];
