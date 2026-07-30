import { z } from 'zod';
import { AppError } from './errores.js';

/**
 * Un layout describe la distribucion fisica del salon. Ejemplo (spinning):
 *
 * {
 *   "titulo": "TARIMA / INSTRUCTOR",
 *   "numeracion": "porFila",          // "porFila" -> A1, A2...  |  "continua" -> 1, 2, 3...
 *   "pasilloDespuesDeCol": 4,         // separa visualmente la columna 4 de la 5
 *   "filas": [
 *     { "label": "A", "puestos": 8 },
 *     { "label": "B", "puestos": 8, "offset": 1 }   // offset = columnas vacias al inicio
 *   ]
 * }
 *
 * El frontend NO conoce estas reglas: el servidor expande el layout y le envia
 * las filas ya resueltas con el codigo y el estado de cada puesto.
 */
export const layoutSchema = z.object({
  titulo: z.string().max(40).optional(),
  numeracion: z.enum(['porFila', 'continua']).default('porFila'),
  pasilloDespuesDeCol: z.number().int().positive().optional(),
  filas: z
    .array(
      z.object({
        label: z.string().min(1).max(3),
        puestos: z.number().int().min(1).max(30),
        offset: z.number().int().min(0).max(20).optional(),
        nota: z.string().max(30).optional(),
      })
    )
    .min(1)
    .max(20),
});

/**
 * Expande el layout a una lista de filas con los codigos de cada puesto.
 * Devuelve tambien `codigos` (todos los codigos validos) y `total`.
 */
export function expandirLayout(layoutRaw) {
  const parsed = layoutSchema.safeParse(layoutRaw);
  if (!parsed.success) {
    throw new AppError('El layout de puestos no es válido.', 400, 'LAYOUT_INVALIDO', parsed.error.flatten());
  }
  const layout = parsed.data;

  let contadorContinuo = 0;
  const codigos = [];
  const filas = layout.filas.map((fila) => {
    const puestos = Array.from({ length: fila.puestos }, (_, i) => {
      contadorContinuo += 1;
      const numero = i + 1;
      const codigo = layout.numeracion === 'continua' ? String(contadorContinuo) : `${fila.label}${numero}`;
      const etiqueta = layout.numeracion === 'continua' ? String(contadorContinuo) : String(numero);
      codigos.push(codigo);
      return { codigo, etiqueta, columna: (fila.offset ?? 0) + numero };
    });
    return { label: fila.label, nota: fila.nota, offset: fila.offset ?? 0, puestos };
  });

  const columnas = Math.max(...filas.map((f) => f.offset + f.puestos.length));

  return {
    titulo: layout.titulo ?? null,
    numeracion: layout.numeracion,
    pasilloDespuesDeCol: layout.pasilloDespuesDeCol ?? null,
    columnas,
    filas,
    codigos,
    total: codigos.length,
  };
}

/** Valida un layout sin expandirlo (para el CRUD de admin). */
export function validarLayout(layoutRaw) {
  expandirLayout(layoutRaw);
  return layoutRaw;
}
