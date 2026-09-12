import { prisma } from '../config/prisma.js';
import { AppError, noEncontrado } from '../utils/errores.js';

/**
 * Catálogo de la tienda.
 *
 * SOLO INFORMATIVO: no hay carrito, pedido ni inventario. El cliente ve la
 * ficha -foto, descripción, ficha nutricional y precio- y compra en el
 * mostrador, como siempre. Si algún día el gimnasio quiere vender desde la
 * app, eso es una función nueva -pago, stock, estado del pedido- y no algo
 * que quepa aquí sin repensar el cobro.
 */

const CAMPOS_PUBLICOS = {
  id: true,
  nombre: true,
  descripcion: true,
  categoria: true,
  foto: true,
  precioCop: true,
  insignias: true,
  porcion: true,
  caloriasKcal: true,
  proteinaG: true,
  carbohidratosG: true,
  azucaresG: true,
  grasasTotalesG: true,
  sodioMg: true,
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

/** Insignias: lista libre y corta de textos ("Sin lactosa"...), sin vacíos. */
function limpiarInsignias(insignias) {
  if (insignias === undefined) return undefined;
  if (!Array.isArray(insignias)) {
    throw new AppError('Las insignias deben ser una lista.', 422, 'INSIGNIAS_INVALIDAS');
  }
  return insignias
    .map((i) => String(i ?? '').trim())
    .filter(Boolean)
    .slice(0, 12);
}

/** Un número no negativo, o `null` si viene vacío -así se puede borrar un
 *  dato que ya no aplica sin dejar un 0 que se leería como "cero gramos". */
function numeroOpcional(valor) {
  if (valor === undefined) return undefined;
  if (valor === null || valor === '') return null;
  const n = Number(valor);
  if (!Number.isFinite(n) || n < 0) {
    throw new AppError('Ese dato nutricional no es un número válido.', 422, 'DATO_INVALIDO');
  }
  return n;
}

/** Como `numeroOpcional`, pero redondeado -las calorías no se muestran con
 *  decimales-. */
function enteroOpcional(valor) {
  const n = numeroOpcional(valor);
  return n === undefined || n === null ? n : Math.round(n);
}

function datosNutricion(datos) {
  return {
    ...(datos.porcion !== undefined ? { porcion: datos.porcion?.trim() || null } : {}),
    ...(datos.caloriasKcal !== undefined ? { caloriasKcal: enteroOpcional(datos.caloriasKcal) } : {}),
    ...(datos.proteinaG !== undefined ? { proteinaG: numeroOpcional(datos.proteinaG) } : {}),
    ...(datos.carbohidratosG !== undefined ? { carbohidratosG: numeroOpcional(datos.carbohidratosG) } : {}),
    ...(datos.azucaresG !== undefined ? { azucaresG: numeroOpcional(datos.azucaresG) } : {}),
    ...(datos.grasasTotalesG !== undefined ? { grasasTotalesG: numeroOpcional(datos.grasasTotalesG) } : {}),
    ...(datos.sodioMg !== undefined ? { sodioMg: numeroOpcional(datos.sodioMg) } : {}),
  };
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
      categoria: datos.categoria?.trim() || null,
      foto: datos.foto || null,
      precioCop: Math.max(0, Number(datos.precioCop) || 0),
      insignias: limpiarInsignias(datos.insignias) ?? [],
      orden: Number.isFinite(datos.orden) ? datos.orden : 0,
      ...datosNutricion(datos),
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
      ...(datos.categoria !== undefined ? { categoria: datos.categoria?.trim() || null } : {}),
      // Cadena vacía SÍ borra la foto -es como se quita una que ya no sirve-,
      // así que se distingue de "no llegó el campo" con un `in`.
      ...('foto' in datos ? { foto: datos.foto || null } : {}),
      ...(datos.precioCop !== undefined ? { precioCop: Math.max(0, Number(datos.precioCop) || 0) } : {}),
      ...(datos.insignias !== undefined ? { insignias: limpiarInsignias(datos.insignias) } : {}),
      ...(datos.orden !== undefined ? { orden: Number(datos.orden) || 0 } : {}),
      ...(datos.activo !== undefined ? { activo: Boolean(datos.activo) } : {}),
      ...datosNutricion(datos),
    },
  });
}

/** Borrado real: un producto no tiene historial que proteger, a diferencia
 *  de una reserva. Si el admin prefiere ocultarlo sin perderlo, usa `activo`. */
export async function borrarProducto(id) {
  await obtener(id);
  await prisma.producto.delete({ where: { id } });
}
