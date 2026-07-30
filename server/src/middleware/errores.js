import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';
import { AppError } from '../utils/errores.js';
import { env } from '../config/env.js';

export function notFoundHandler(req, res, next) {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ error: 'Ruta no encontrada.', codigo: 'RUTA_NO_ENCONTRADA' });
  }
  next();
}

// Express identifica el handler de errores por su aridad de 4: `next` debe estar
// declarado aunque no se use.
export function errorHandler(err, req, res, next) {
  if (err instanceof ZodError) {
    return res.status(422).json({
      error: 'Los datos enviados no son válidos.',
      codigo: 'VALIDACION',
      detalles: err.flatten(),
    });
  }

  if (err instanceof AppError) {
    return res.status(err.status).json({ error: err.message, codigo: err.codigo, detalles: err.extra });
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    // P2002 = violacion de restriccion unica. La mas comun aqui es el indice
    // parcial que impide dos reservas activas sobre el mismo puesto.
    if (err.code === 'P2002') {
      const campos = err.meta?.target;
      const esPuesto = String(campos ?? '').includes('puesto');
      return res.status(409).json({
        error: esPuesto
          ? 'Ese puesto acaba de ser tomado por otra persona. Elige otro.'
          : 'Ya existe un registro con esos datos.',
        codigo: esPuesto ? 'PUESTO_OCUPADO' : 'DUPLICADO',
      });
    }
    if (err.code === 'P2025') {
      return res.status(404).json({ error: 'El registro no existe.', codigo: 'NO_ENCONTRADO' });
    }
    if (err.code === 'P2003') {
      return res.status(409).json({
        error: 'No se puede completar: hay registros relacionados.',
        codigo: 'REFERENCIADO',
      });
    }
  }

  console.error('[error]', err);
  res.status(500).json({
    error: 'Ocurrió un error inesperado.',
    codigo: 'ERROR_INTERNO',
    ...(env.esProduccion ? {} : { detalle: err.message }),
  });
}
