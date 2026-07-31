import { prisma } from '../config/prisma.js';
import { AppError, noEncontrado } from '../utils/errores.js';
import { generarCodigoReserva, normalizarTelefono } from '../utils/codigo.js';
import { resolverLayout, puestosEnJuego } from './disponibilidad.service.js';

const ESTADOS_ACTIVOS = ['CONFIRMADA', 'ASISTIO', 'NO_SHOW'];

const incluirCompleto = {
  clase: { include: { tipoClase: true, instructor: true } },
  usuario: { select: { id: true, nombre: true, telefono: true } },
};

/** Crea el cliente si es su primera vez; si ya existe actualiza el nombre. */
export async function upsertCliente(tx, { nombre, telefono }) {
  const tel = normalizarTelefono(telefono);
  if (tel.length < 7) throw new AppError('El teléfono no es válido.', 422, 'TELEFONO_INVALIDO');

  return tx.usuario.upsert({
    where: { telefono: tel },
    // Si vuelve a reservar, respetamos el nombre nuevo que escriba.
    update: { nombre: nombre.trim() },
    create: { nombre: nombre.trim(), telefono: tel, rol: 'CLIENTE' },
  });
}

/**
 * Crea una reserva.
 *
 * MANEJO DE CONCURRENCIA (dos personas tocando el mismo puesto a la vez):
 *
 *  1. Se toma un lock de fila sobre la clase con `SELECT ... FOR UPDATE`. Eso
 *     serializa las reservas *de esa misma clase*, de modo que el conteo de
 *     cupo que hacemos a continuacion no puede quedar obsoleto entre el SELECT
 *     y el INSERT. Reservas de clases distintas no se bloquean entre si.
 *
 *  2. Aun asi, la ultima linea de defensa para el puesto NO es codigo de
 *     aplicacion sino la base de datos: existe un indice unico parcial
 *     `reserva_puesto_activo_unico ON (claseId, puestoCodigo) WHERE estado <> 'CANCELADA'`.
 *     Si dos transacciones lograran llegar al INSERT, Postgres rechaza una con
 *     el error P2002, que el middleware traduce a 409 PUESTO_OCUPADO.
 *
 *  Ese doble candado es intencional: el lock da buenos mensajes de error y
 *  protege el cupo agregado; el indice hace que sea imposible corromper los
 *  datos aunque alguien escriba por fuera de este servicio.
 */
export async function crearReserva({ claseId, puestoCodigo, nombre, telefono, usuarioId }) {
  return prisma.$transaction(async (tx) => {
    const clase = await tx.clase.findUnique({
      where: { id: claseId },
      include: { tipoClase: true, instructor: true },
    });
    if (!clase) throw noEncontrado('Clase');
    if (clase.estado !== 'ACTIVA') throw new AppError('Esta clase fue cancelada.', 409, 'CLASE_CANCELADA');
    if (clase.inicioEn.getTime() <= Date.now()) {
      throw new AppError('Esta clase ya comenzó.', 409, 'CLASE_INICIADA');
    }

    // (1) Lock de la fila de la clase. Cualquier otra reserva para esta misma
    // clase espera aqui hasta que la transaccion actual termine.
    await tx.$queryRaw`SELECT id FROM "Clase" WHERE id = ${claseId} FOR UPDATE`;

    const layout = resolverLayout(clase);
    if (!layout.codigos.includes(puestoCodigo)) {
      throw new AppError('Ese puesto no existe en esta clase.', 422, 'PUESTO_INVALIDO');
    }
    if ((clase.puestosBloqueados || []).includes(puestoCodigo)) {
      throw new AppError('Ese puesto está fuera de servicio.', 409, 'PUESTO_BLOQUEADO');
    }

    const cliente = usuarioId
      ? await tx.usuario.findUnique({ where: { id: usuarioId } })
      : null;
    const usuario = cliente ?? (await upsertCliente(tx, { nombre, telefono }));

    // Una persona no puede tener dos puestos activos en la misma clase: evita
    // tanto reservas duplicadas por doble toque como el acaparamiento de bicis.
    const yaTiene = await tx.reserva.findFirst({
      where: { claseId, usuarioId: usuario.id, estado: { in: ESTADOS_ACTIVOS } },
    });
    if (yaTiene) {
      throw new AppError(
        `Ya tienes el puesto ${yaTiene.puestoCodigo} reservado en esta clase.`,
        409,
        'YA_RESERVADO',
        { codigo: yaTiene.codigo, puestoCodigo: yaTiene.puestoCodigo }
      );
    }

    const reservasActivas = await tx.reserva.findMany({
      where: { claseId, estado: { in: ESTADOS_ACTIVOS } },
      select: { puestoCodigo: true },
    });
    const ocupados = new Set(reservasActivas.map((r) => r.puestoCodigo));
    const bloqueadosSet = new Set(clase.puestosBloqueados || []);

    const capacidad = Math.min(layout.total - bloqueadosSet.size, clase.cupoMaximo);
    if (ocupados.size >= capacidad) throw new AppError('Esta clase ya está llena.', 409, 'CLASE_LLENA');

    // El puesto tiene que estar entre los que esta clase pone a la venta. El
    // layout puede tener 12 trotadoras y la clase abrir solo 6: las otras 6 no
    // se ofrecen en el mapa y tampoco se aceptan por la API.
    const enJuego = puestosEnJuego({
      layout,
      ocupados,
      bloqueados: bloqueadosSet,
      cupoMaximo: clase.cupoMaximo,
    });
    if (!enJuego.has(puestoCodigo)) {
      throw new AppError('Ese puesto no está disponible en esta clase.', 409, 'PUESTO_FUERA_DE_CUPO');
    }

    // (2) El INSERT. Si el puesto se colo por otra via, el indice unico parcial
    // lanza P2002 -> 409 PUESTO_OCUPADO.
    const reserva = await tx.reserva.create({
      data: {
        codigo: generarCodigoReserva(),
        claseId,
        usuarioId: usuario.id,
        puestoCodigo,
        montoCop: clase.precioCop || clase.tipoClase.precioCop || 0,
        estadoPago: 'PENDIENTE',
      },
      include: incluirCompleto,
    });

    return reserva;
  });
}

export async function obtenerPorCodigo(codigo) {
  const reserva = await prisma.reserva.findUnique({
    where: { codigo: String(codigo).toUpperCase() },
    include: incluirCompleto,
  });
  if (!reserva) throw noEncontrado('Reserva');
  return reserva;
}

export async function listarReservasDeUsuario(usuarioId) {
  return prisma.reserva.findMany({
    where: { usuarioId },
    include: incluirCompleto,
    orderBy: { clase: { inicioEn: 'desc' } },
  });
}

/** Cancela una reserva. Los clientes solo pueden cancelar las suyas y antes de la clase. */
export async function cancelarReserva({ reservaId, codigo, usuarioId, porAdmin = false }) {
  const where = reservaId ? { id: reservaId } : { codigo: String(codigo).toUpperCase() };
  const reserva = await prisma.reserva.findUnique({ where, include: incluirCompleto });
  if (!reserva) throw noEncontrado('Reserva');

  if (!porAdmin) {
    if (reserva.usuarioId !== usuarioId) {
      throw new AppError('Esta reserva no es tuya.', 403, 'SIN_PERMISO');
    }
    if (reserva.clase.inicioEn.getTime() <= Date.now()) {
      throw new AppError('No puedes cancelar una clase que ya empezó.', 409, 'CLASE_INICIADA');
    }
  }

  if (reserva.estado === 'CANCELADA') return reserva;

  // Al pasar a CANCELADA la fila sale del indice unico parcial y el puesto
  // vuelve a quedar disponible automaticamente.
  return prisma.reserva.update({
    where: { id: reserva.id },
    data: { estado: 'CANCELADA', canceladoEn: new Date() },
    include: incluirCompleto,
  });
}

/** Marca asistencia desde el check-in de recepcion (escaneando el codigo). */
export async function marcarAsistencia(reservaId, asistio) {
  return prisma.reserva.update({
    where: { id: reservaId },
    data: { estado: asistio ? 'ASISTIO' : 'NO_SHOW' },
    include: incluirCompleto,
  });
}
