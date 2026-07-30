import { env } from '../config/env.js';

const TZ = env.tzGimnasio;

const DIAS_CORTOS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** Descompone un instante UTC en sus partes de calendario segun la zona del gimnasio. */
export function partesLocales(fecha, tz = TZ) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    weekday: 'short',
  });
  const p = {};
  for (const parte of fmt.formatToParts(fecha)) {
    if (parte.type !== 'literal') p[parte.type] = parte.value;
  }
  return {
    anio: Number(p.year),
    mes: Number(p.month),
    dia: Number(p.day),
    // Intl puede devolver "24" para medianoche en el ciclo h23/h24.
    hora: Number(p.hour) % 24,
    minuto: Number(p.minute),
    segundo: Number(p.second),
  };
}

/**
 * Diferencia en milisegundos entre la hora local del gimnasio y UTC para ese
 * instante. Se calcula en vez de hardcodear -05:00 para que el codigo siga
 * siendo correcto si el gimnasio opera en una zona con horario de verano.
 */
function offsetMs(fecha, tz = TZ) {
  const p = partesLocales(fecha, tz);
  const comoSiFueraUtc = Date.UTC(p.anio, p.mes - 1, p.dia, p.hora, p.minuto, p.segundo);
  return comoSiFueraUtc - fecha.getTime();
}

/** Construye el instante UTC que corresponde a una fecha/hora local del gimnasio. */
export function desdeLocal({ anio, mes, dia, hora = 0, minuto = 0 }, tz = TZ) {
  const tentativo = Date.UTC(anio, mes - 1, dia, hora, minuto, 0);
  // Dos pasadas: la primera usa el offset del instante equivocado; la segunda lo
  // corrige si el offset cambio (frontera de horario de verano).
  let ts = tentativo - offsetMs(new Date(tentativo), tz);
  ts = tentativo - offsetMs(new Date(ts), tz);
  return new Date(ts);
}

/** "2026-08-03" + "18:30" -> Date en UTC */
export function desdeFechaHoraLocal(fechaISO, horaHHmm, tz = TZ) {
  const [anio, mes, dia] = String(fechaISO).split('-').map(Number);
  const [hora, minuto] = String(horaHHmm).split(':').map(Number);
  return desdeLocal({ anio, mes, dia, hora, minuto }, tz);
}

/** Fecha local en formato "YYYY-MM-DD". */
export function fechaISOLocal(fecha = new Date(), tz = TZ) {
  const p = partesLocales(fecha, tz);
  return `${p.anio}-${String(p.mes).padStart(2, '0')}-${String(p.dia).padStart(2, '0')}`;
}

/** Hora local en formato "HH:mm". */
export function horaLocal(fecha, tz = TZ) {
  const p = partesLocales(fecha, tz);
  return `${String(p.hora).padStart(2, '0')}:${String(p.minuto).padStart(2, '0')}`;
}

/** Instante UTC correspondiente a las 00:00 locales de una fecha "YYYY-MM-DD". */
export function inicioDelDia(fechaISO, tz = TZ) {
  const [anio, mes, dia] = String(fechaISO).split('-').map(Number);
  return desdeLocal({ anio, mes, dia, hora: 0, minuto: 0 }, tz);
}

/** Instante UTC correspondiente a las 00:00 locales del dia siguiente (limite exclusivo). */
export function finDelDia(fechaISO, tz = TZ) {
  const inicio = inicioDelDia(fechaISO, tz);
  return sumarDias(inicio, 1, tz);
}

/** Suma dias respetando el calendario local (no 24h exactas). */
export function sumarDias(fecha, dias, tz = TZ) {
  const p = partesLocales(fecha, tz);
  return desdeLocal({ anio: p.anio, mes: p.mes, dia: p.dia + dias, hora: p.hora, minuto: p.minuto }, tz);
}

/** Devuelve las N fechas ISO locales a partir de hoy: ["2026-07-30", ...] */
export function proximosDias(cantidad = 7, desde = new Date(), tz = TZ) {
  const base = partesLocales(desde, tz);
  return Array.from({ length: cantidad }, (_, i) => {
    const d = desdeLocal({ anio: base.anio, mes: base.mes, dia: base.dia + i, hora: 12 }, tz);
    return fechaISOLocal(d, tz);
  });
}

/** Etiquetas cortas para el carrusel de dias: { fecha, diaSemana, diaNumero, mes }. */
export function etiquetaDia(fechaISO, tz = TZ) {
  const d = inicioDelDia(fechaISO, tz);
  // Se usa mediodia para evitar que el desplazamiento de zona cambie el dia.
  const medioDia = new Date(d.getTime() + 12 * 3600 * 1000);
  const p = partesLocales(medioDia, tz);
  const diaSemana = new Date(Date.UTC(p.anio, p.mes - 1, p.dia)).getUTCDay();
  return {
    fecha: fechaISO,
    diaSemana: DIAS_CORTOS[diaSemana],
    diaNumero: p.dia,
    mes: MESES_CORTOS[p.mes - 1],
  };
}

/** Formato "vie 31 jul · 6:30 p. m." para resúmenes y correos. */
export function formatearLargo(fecha, tz = TZ) {
  const p = partesLocales(fecha, tz);
  const diaSemana = DIAS_CORTOS[new Date(Date.UTC(p.anio, p.mes - 1, p.dia)).getUTCDay()];
  const h24 = p.hora;
  const sufijo = h24 >= 12 ? 'p.m.' : 'a.m.';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${diaSemana} ${p.dia} ${MESES_CORTOS[p.mes - 1]} · ${h12}:${String(p.minuto).padStart(2, '0')} ${sufijo}`;
}

/** Los N proximos dias ya etiquetados, listos para el carrusel de fechas. */
export function diasParaCarrusel(cantidad = 7, tz = TZ) {
  return proximosDias(cantidad, new Date(), tz).map((fecha) => etiquetaDia(fecha, tz));
}

export const zonaGimnasio = TZ;
