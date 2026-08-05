/**
 * Desde cuándo se puede reservar por la app.
 *
 * El gimnasio pasó su horario al software a mitad de camino y los cupos de las
 * próximas semanas ya estaban repartidos en papel; reservar encima habría
 * vendido dos veces la misma bici. El servidor manda la fecha en
 * `/configuracion` (`reservasDesde`) y aquí solo se pinta.
 *
 * Cuando el gimnasio se ponga al día, se borra `RESERVAS_DESDE` en Railway,
 * el servidor manda `null` y todo esto desaparece solo de la pantalla.
 */

/** "24 de agosto" a partir de "2026-08-24". */
export function etiquetaApertura(iso) {
  if (!iso) return null;
  const [a, m, d] = iso.split('-').map(Number);
  return new Intl.DateTimeFormat('es-CO', {
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(a, m - 1, d)));
}

/** ¿Esa fecha ("2026-08-20") ya se puede reservar? */
export const abierta = (fechaISO, desde) => !desde || !fechaISO || fechaISO >= desde;
