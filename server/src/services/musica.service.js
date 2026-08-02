import { prisma } from '../config/prisma.js';
import { AppError, noEncontrado } from '../utils/errores.js';
import { ESTADOS_CONFIRMADOS } from '../config/estados.js';

/**
 * Música pedida por los clientes.
 *
 * La app NO reproduce nada: es un catálogo de texto del que el cliente elige y
 * una fila que el instructor lee para saber qué poner después de la canción que
 * está sonando. Por eso no hay archivos ni enlaces de audio, solo título y
 * artista.
 */

/** Momentos de la clase a los que se puede etiquetar una canción. */
export const MOMENTOS = ['calentamiento', 'subida', 'pico', 'enfriamiento'];

const limpiar = (texto) => texto?.trim().replace(/\s+/g, ' ') || null;

/**
 * Busca en el catálogo. Devuelve pocas filas a propósito: el cliente busca
 * escribiendo y nunca se descarga la lista completa, así que el catálogo puede
 * crecer sin que la app pese más en el teléfono.
 */
export async function buscarCanciones({ q, incluirInactivas = false, limite = 20 } = {}) {
  const texto = q?.trim();
  return prisma.cancion.findMany({
    where: {
      ...(incluirInactivas ? {} : { activa: true }),
      ...(texto
        ? {
            OR: [
              { titulo: { contains: texto, mode: 'insensitive' } },
              { artista: { contains: texto, mode: 'insensitive' } },
            ],
          }
        : {}),
    },
    orderBy: [{ titulo: 'asc' }],
    take: Math.min(limite, 100),
  });
}

export async function crearCancion({ titulo, artista, momento, deLaCasa = false }) {
  const datos = {
    titulo: limpiar(titulo),
    artista: limpiar(artista),
    momento: momento && MOMENTOS.includes(momento) ? momento : null,
    deLaCasa,
  };
  if (!datos.titulo) throw new AppError('La canción necesita un título.', 422, 'TITULO_REQUERIDO');

  const yaEsta = await prisma.cancion.findFirst({
    where: { titulo: datos.titulo, artista: datos.artista },
  });
  if (yaEsta) return prisma.cancion.update({ where: { id: yaEsta.id }, data: { activa: true } });

  return prisma.cancion.create({ data: datos });
}

/**
 * Carga masiva pegando una lista, una canción por línea:
 *
 *   Blinding Lights - The Weeknd
 *   Titi Me Preguntó — Bad Bunny
 *
 * Acepta guion normal, guion largo y "|" como separador; si no hay separador,
 * la línea entera es el título. Las repetidas no se duplican: el catálogo se
 * puede volver a pegar sin miedo.
 */
export async function importarCanciones(texto) {
  const lineas = String(texto || '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  let creadas = 0;
  let repetidas = 0;

  for (const linea of lineas) {
    const partes = linea.split(/\s+[-–—|]\s+/);
    const titulo = limpiar(partes[0]);
    const artista = partes.length > 1 ? limpiar(partes.slice(1).join(' - ')) : null;
    if (!titulo) continue;

    const yaEsta = await prisma.cancion.findFirst({ where: { titulo, artista } });
    if (yaEsta) {
      repetidas += 1;
      continue;
    }
    await prisma.cancion.create({ data: { titulo, artista } });
    creadas += 1;
  }

  return { leidas: lineas.length, creadas, repetidas };
}

export async function actualizarCancion(id, datos) {
  const cancion = await prisma.cancion.findUnique({ where: { id } });
  if (!cancion) throw noEncontrado('Canción');

  return prisma.cancion.update({
    where: { id },
    data: {
      ...(datos.titulo !== undefined ? { titulo: limpiar(datos.titulo) } : {}),
      ...(datos.artista !== undefined ? { artista: limpiar(datos.artista) } : {}),
      ...(datos.momento !== undefined
        ? { momento: MOMENTOS.includes(datos.momento) ? datos.momento : null }
        : {}),
      ...(datos.deLaCasa !== undefined ? { deLaCasa: datos.deLaCasa } : {}),
      ...(datos.activa !== undefined ? { activa: datos.activa } : {}),
    },
  });
}

export async function eliminarCancion(id) {
  const pedidos = await prisma.pedidoMusica.count({ where: { cancionId: id } });
  // Si ya sonó en alguna clase se desactiva en vez de borrarse: borrarla se
  // llevaría por delante el registro de quién la pidió.
  if (pedidos > 0) {
    await prisma.cancion.update({ where: { id }, data: { activa: false } });
    return { ok: true, desactivada: true };
  }
  await prisma.cancion.delete({ where: { id } });
  return { ok: true, desactivada: false };
}

/**
 * La fila de una clase, en el orden en que debería sonar.
 *
 * POR RONDAS: primero la primera canción de cada quien, después la segunda de
 * cada quien, y así. Cada persona puede pedir las que quiera sin dejar a los
 * demás sin sonar, que es lo que pasaría con un orden de llegada estricto.
 */
export async function filaDeClase(claseId, { incluirSonadas = true } = {}) {
  const clase = await prisma.clase.findUnique({
    where: { id: claseId },
    include: { tipoClase: true },
  });
  if (!clase) throw noEncontrado('Clase');

  const pedidos = await prisma.pedidoMusica.findMany({
    where: {
      claseId,
      estado: incluirSonadas ? { in: ['EN_FILA', 'SONO'] } : 'EN_FILA',
    },
    include: {
      cancion: true,
      usuario: { select: { id: true, nombre: true } },
    },
    orderBy: [{ turno: 'asc' }, { creadoEn: 'asc' }],
  });

  return {
    clase: {
      id: clase.id,
      tipoClase: clase.tipoClase.nombre,
      color: clase.tipoClase.color,
      inicioEn: clase.inicioEn.toISOString(),
    },
    pedidos: pedidos.map((p) => ({
      id: p.id,
      estado: p.estado,
      turno: p.turno,
      creadoEn: p.creadoEn.toISOString(),
      cancion: {
        id: p.cancion.id,
        titulo: p.cancion.titulo,
        artista: p.cancion.artista,
        momento: p.cancion.momento,
      },
      pidio: p.usuario,
    })),
  };
}

/** Canciones de la casa, para cuando nadie pidió nada. */
export async function cancionesDeLaCasa(limite = 30) {
  return prisma.cancion.findMany({
    where: { activa: true, deLaCasa: true },
    orderBy: { titulo: 'asc' },
    take: limite,
  });
}

/**
 * Pedir una canción para una clase.
 *
 * Solo puede pedir quien tenga una reserva firme en esa clase: es el filtro que
 * evita que un desconocido llene la fila de una clase a la que no va.
 */
export async function pedirCancion({ claseId, cancionId, usuarioId }) {
  const clase = await prisma.clase.findUnique({ where: { id: claseId } });
  if (!clase) throw noEncontrado('Clase');
  if (clase.estado !== 'ACTIVA') {
    throw new AppError('Esta clase fue cancelada.', 409, 'CLASE_CANCELADA');
  }
  const fin = clase.inicioEn.getTime() + clase.duracionMin * 60_000;
  if (fin < Date.now()) {
    throw new AppError('Esta clase ya terminó.', 409, 'CLASE_TERMINADA');
  }

  const reserva = await prisma.reserva.findFirst({
    where: { claseId, usuarioId, estado: { in: ESTADOS_CONFIRMADOS } },
  });
  if (!reserva) {
    throw new AppError(
      'Solo puedes pedir música en las clases que ya tienes reservadas.',
      403,
      'SIN_RESERVA'
    );
  }

  const cancion = await prisma.cancion.findUnique({ where: { id: cancionId } });
  if (!cancion || !cancion.activa) throw noEncontrado('Canción');

  const yaLaPidio = await prisma.pedidoMusica.findFirst({
    where: { claseId, cancionId, usuarioId },
  });
  if (yaLaPidio) {
    throw new AppError('Ya pediste esa canción para esta clase.', 409, 'CANCION_REPETIDA');
  }

  // El turno es cuántas lleva pedidas esta persona en esta clase: define en qué
  // ronda suena.
  const suyas = await prisma.pedidoMusica.count({
    where: { claseId, usuarioId, estado: { in: ['EN_FILA', 'SONO'] } },
  });

  return prisma.pedidoMusica.create({
    data: { claseId, cancionId, usuarioId, turno: suyas + 1 },
    include: { cancion: true },
  });
}

/** Quitar un pedido propio mientras no haya sonado. */
export async function quitarPedido({ pedidoId, usuarioId, porAdmin = false }) {
  const pedido = await prisma.pedidoMusica.findUnique({ where: { id: pedidoId } });
  if (!pedido) throw noEncontrado('Pedido');
  if (!porAdmin && pedido.usuarioId !== usuarioId) {
    throw new AppError('Ese pedido no es tuyo.', 403, 'SIN_PERMISO');
  }
  if (pedido.estado === 'SONO') {
    throw new AppError('Esa canción ya sonó.', 409, 'YA_SONO');
  }
  await prisma.pedidoMusica.delete({ where: { id: pedidoId } });
  return { ok: true };
}

/** El instructor marca que una canción ya sonó y la fila avanza. */
export async function marcarSono(pedidoId, sono = true) {
  const pedido = await prisma.pedidoMusica.findUnique({ where: { id: pedidoId } });
  if (!pedido) throw noEncontrado('Pedido');

  return prisma.pedidoMusica.update({
    where: { id: pedidoId },
    data: sono
      ? { estado: 'SONO', sonoEn: new Date() }
      : { estado: 'EN_FILA', sonoEn: null },
    include: { cancion: true, usuario: { select: { id: true, nombre: true } } },
  });
}
