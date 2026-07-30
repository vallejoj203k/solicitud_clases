/** Error de negocio: se traduce a una respuesta HTTP controlada. */
export class AppError extends Error {
  constructor(mensaje, status = 400, codigo = 'ERROR', extra = undefined) {
    super(mensaje);
    this.status = status;
    this.codigo = codigo;
    this.extra = extra;
  }
}

export const noEncontrado = (recurso = 'Recurso') =>
  new AppError(`${recurso} no encontrado.`, 404, 'NO_ENCONTRADO');

/** Envuelve handlers async para que los rechazos lleguen al middleware de errores. */
export const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);
