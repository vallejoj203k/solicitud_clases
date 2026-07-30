import { env } from '../config/env.js';

const pad = (n) => String(n).padStart(2, '0');

/** Formato UTC que exige el RFC 5545: 20260731T233000Z */
function aFormatoIcs(fecha) {
  return (
    `${fecha.getUTCFullYear()}${pad(fecha.getUTCMonth() + 1)}${pad(fecha.getUTCDate())}` +
    `T${pad(fecha.getUTCHours())}${pad(fecha.getUTCMinutes())}${pad(fecha.getUTCSeconds())}Z`
  );
}

/** Escapa los caracteres con significado especial en un campo de texto ICS. */
function escapar(texto) {
  return String(texto ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

/**
 * Genera el contenido .ics de una reserva para el boton "agregar a mi calendario".
 * Se arma a mano (son ~15 lineas) para no sumar una dependencia mas.
 */
export function generarIcs(reserva) {
  const { clase, puestoCodigo, codigo } = reserva;
  const inicio = new Date(clase.inicioEn);
  const fin = new Date(inicio.getTime() + clase.duracionMin * 60 * 1000);
  const titulo = `${clase.tipoClase.nombre} · Puesto ${puestoCodigo}`;
  const descripcion = [
    `Reserva ${codigo}`,
    `Puesto: ${puestoCodigo}`,
    clase.instructor?.nombre ? `Instructor: ${clase.instructor.nombre}` : null,
    `Presenta este código en recepción: ${codigo}`,
    `${env.appUrl}/reserva/${codigo}`,
  ]
    .filter(Boolean)
    .join('\n');

  const lineas = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Solicitud Clases//ES',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:reserva-${codigo}@solicitud-clases`,
    `DTSTAMP:${aFormatoIcs(new Date())}`,
    `DTSTART:${aFormatoIcs(inicio)}`,
    `DTEND:${aFormatoIcs(fin)}`,
    `SUMMARY:${escapar(titulo)}`,
    `DESCRIPTION:${escapar(descripcion)}`,
    'BEGIN:VALARM',
    'TRIGGER:-PT60M',
    'ACTION:DISPLAY',
    `DESCRIPTION:${escapar(`Tu clase de ${clase.tipoClase.nombre} empieza en 1 hora`)}`,
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ];

  // El RFC exige CRLF.
  return `${lineas.join('\r\n')}\r\n`;
}
