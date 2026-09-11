import { prisma } from '../config/prisma.js';
import { AppError, noEncontrado } from '../utils/errores.js';

/**
 * Catálogo de la tienda.
 *
 * SOLO INFORMATIVO: no hay carrito, pedido ni inventario. El cliente ve la
 * ficha -foto, descripción, macros y precio- y compra en el mostrador, como
 * siempre. Si algún día el gimnasio quiere vender desde la app, eso es una
 * función nueva -pago, stock, estado del pedido- y no algo que quepa aquí
 * sin repensar el cobro.
 */

const CAMPOS_PUBLICOS = {
  id: true,
  nombre: true,
  descripcion: true,
  foto: true,
  precioCop: true,
  macros: true,
  orden: true,
};

/** Lo que ve el cliente: solo lo activo, en el orden que puso el admin. */
export async function catalogoPublico() {
  return prisma.producto.findMany({
    where: { activo: true },
    orderBy: [{ orden: 'asc' }, { creadoEn: 'asc' }],
    select: CAMPOS_PUBLICOS,
  });
}

/** Lo que ve el admin: todo, activo o no, para poder reactivar sin recrear. */
export async function listarProductos() {
  return prisma.producto.findMany({
    orderBy: [{ orden: 'asc' }, { creadoEn: 'asc' }],
  });
}

async function obtener(id) {
  const producto = await prisma.producto.findUnique({ where: { id } });
  if (!producto) throw noEncontrado('Producto');
  return producto;
}

/** Valida y limpia la lista de macros: renglones "nombre: valor" en orden. */
function limpiarMacros(macros) {
  if (macros === undefined) return undefined;
  if (!Array.isArray(macros)) {
    throw new AppError('Los macros deben ser una lista.', 422, 'MACROS_INVALIDOS');
  }
  return macros
    .map((m) => ({
      nombre: String(m?.nombre ?? '').trim(),
      valor: String(m?.valor ?? '').trim(),
    }))
    .filter((m) => m.nombre && m.valor);
}

export async function crearProducto(datos) {
  const nombre = datos.nombre?.trim();
  const descripcion = datos.descripcion?.trim();
  if (!nombre) throw new AppError('Falta el nombre del producto.', 422, 'FALTA_NOMBRE');
  if (!descripcion) throw new AppError('Falta la descripción.', 422, 'FALTA_DESCRIPCION');

  return prisma.producto.create({
    data: {
      nombre,
      descripcion,
      foto: datos.foto || null,
      precioCop: Math.max(0, Number(datos.precioCop) || 0),
      macros: limpiarMacros(datos.macros) ?? [],
      orden: Number.isFinite(datos.orden) ? datos.orden : 0,
    },
  });
}

export async function actualizarProducto(id, datos) {
  await obtener(id);

  return prisma.producto.update({
    where: { id },
    data: {
      ...(datos.nombre !== undefined ? { nombre: datos.nombre.trim() } : {}),
      ...(datos.descripcion !== undefined ? { descripcion: datos.descripcion.trim() } : {}),
      // Cadena vacía SÍ borra la foto -es como se quita una que ya no sirve-,
      // así que se distingue de "no llegó el campo" con un `in`.
      ...('foto' in datos ? { foto: datos.foto || null } : {}),
      ...(datos.precioCop !== undefined ? { precioCop: Math.max(0, Number(datos.precioCop) || 0) } : {}),
      ...(datos.macros !== undefined ? { macros: limpiarMacros(datos.macros) } : {}),
      ...(datos.orden !== undefined ? { orden: Number(datos.orden) || 0 } : {}),
      ...(datos.activo !== undefined ? { activo: Boolean(datos.activo) } : {}),
    },
  });
}

/** Borrado real: un producto no tiene historial que proteger, a diferencia
 *  de una reserva. Si el admin prefiere ocultarlo sin perderlo, usa `activo`. */
export async function borrarProducto(id) {
  await obtener(id);
  await prisma.producto.delete({ where: { id } });
}
