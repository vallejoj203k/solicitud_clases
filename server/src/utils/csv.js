/** Escapa un valor segun RFC 4180 (comillas dobles duplicadas). */
function celda(valor) {
  const texto = valor === null || valor === undefined ? '' : String(valor);
  return /[",\n\r;]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
}

/**
 * Convierte filas a CSV.
 * @param {Array<{clave:string,titulo:string}>} columnas
 * @param {Array<object>} filas
 */
export function aCsv(columnas, filas) {
  const cabecera = columnas.map((c) => celda(c.titulo)).join(',');
  const cuerpo = filas.map((fila) => columnas.map((c) => celda(fila[c.clave])).join(','));
  // El BOM hace que Excel en Windows abra el archivo en UTF-8 y respete las tildes.
  return `﻿${[cabecera, ...cuerpo].join('\r\n')}\r\n`;
}
