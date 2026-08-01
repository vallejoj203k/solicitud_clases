import { prisma } from '../config/prisma.js';
import { AppError, noEncontrado } from '../utils/errores.js';
import { generarCodigoReserva, normalizarTelefono } from '../utils/codigo.js';
import { resolverLayout, puestosEnJuego } from './disponibilidad.service.js';
import { env } from '../config/env.js';
import { ESTADOS_CONFIRMADOS } from '../config/estados.js';
import { ESTADOS_OCUPAN_PUESTO, ESTADOS_SIN_PAGAR } from '../config/estados.js';


const incluirCompleto = {
  clase: { include: { tipoClase: true, instructor: true } },
  // `email` va aqui porque las notificaciones leen el destinatario de esta misma
  // consulta; sin el, el correo de confirmacion se descarta por "sin destinatario".
  usuario: { select: { id: true, nombre: true, telefono: true, email: true } },
};

/**
 * Libera los puestos de quienes no terminaron de pagar a tiempo.
 *
 * Se llama desde un barrido periodico Y dentro de `crearReserva`, antes de mirar
 * la disponibilidad: asi un puesto vencido nunca bloquea a alguien que si quiere
 * pagar, aunque el barrido no haya corrido todavia.
 */
export async function expirarReservasVencidas(tx = prisma, claseId = undefined) {
  const { count } = await tx.reserva.updateMany({
    where: {
      estado: 'PENDIENTE_PAGO',
      expiraEn: { lt: new Date() },
      ...(claseId ? { claseId } : {}),
    },
    data: { estado: 'EXPIRADA' },
  });
  return count;
}

/** Crea el cliente si es su primera vez; si ya existe actualiza el nombre. */
export async function upsertCliente(tx, { nombre, telefono, email, aceptaDatos }) {
  const tel = normalizarTelefono(telefono);
  if (tel.length < 7) throw new AppError('El teléfono no es válido.', 422, 'TELEFONO_INVALIDO');

  const correo = email?.trim().toLowerCase() || undefined;
  // La autorizacion de tratamiento de datos (Ley 1581) se sella con la fecha en
  // que la persona marco la casilla; queda como constancia.
  const consentimiento = aceptaDatos ? { aceptoDatosEn: new Date() } : {};

  return tx.usuario.upsert({
    where: { telefono: tel },
    // Si vuelve a reservar, respetamos el nombre nuevo que escriba.
    update: { nombre: nombre.trim(), ...(correo ? { email: correo } : {}), ...consentimiento },
    create: { nombre: nombre.trim(), telefono: tel, email: correo, rol: 'CLIENTE', ...consentimiento },
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
export async function crearReserva({
  claseId,
  puestoCodigo,
  nombre,
  telefono,
  email,
  aceptaDatos,
  usuarioId,
  pagoEnLinea = false,
  nombreInvitado,
}) {
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

    // Dentro del lock: los puestos apartados por alguien que nunca pago vuelven
    // a estar libres antes de calcular la disponibilidad.
    await expirarReservasVencidas(tx, claseId);

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
    const usuario = cliente ?? (await upsertCliente(tx, { nombre, telefono, email, aceptaDatos }));

    // Una persona puede llevar acompañantes -una pareja va junta y paga uno
    // solo-, pero no acaparar el salón: el tope es `MAX_PUESTOS_POR_PERSONA`.
    // Las que están sin pagar cuentan aunque no ocupen puesto: si no, alguien
    // podría llenar la clase de reservas sin pagar una sola.
    const suyos = await tx.reserva.findMany({
      where: {
        claseId,
        usuarioId: usuario.id,
        estado: { in: [...ESTADOS_OCUPAN_PUESTO, ...ESTADOS_SIN_PAGAR] },
      },
      select: { codigo: true, puestoCodigo: true, estado: true },
    });

    // Doble toque sobre el mismo puesto: se devuelve la reserva que ya existe en
    // vez de crear otra. Antes lo frenaba el índice único, que ya no mira las
    // reservas sin pagar.
    const mismoPuesto = suyos.find(
      (r) => r.puestoCodigo === puestoCodigo && r.estado === 'PENDIENTE_PAGO'
    );
    if (mismoPuesto) {
      return tx.reserva.findUnique({ where: { codigo: mismoPuesto.codigo }, include: incluirCompleto });
    }

    if (suyos.length >= env.maxPuestosPorPersona) {
      throw new AppError(
        `Ya tienes ${suyos.length} puestos en esta clase (${suyos
          .map((r) => r.puestoCodigo)
          .join(', ')}), que es el máximo por persona. Si necesitas más, habla con recepción.`,
        409,
        'TOPE_POR_PERSONA',
        { puestos: suyos.map((r) => r.puestoCodigo), maximo: env.maxPuestosPorPersona }
      );
    }

    const reservasActivas = await tx.reserva.findMany({
      where: { claseId, estado: { in: ESTADOS_OCUPAN_PUESTO } },
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

    const montoCop = clase.precioCop || clase.tipoClase.precioCop || 0;

    // Con pago en linea el puesto queda APARTADO, no confirmado: se le guarda a
    // esta persona mientras paga y se libera solo si no lo hace a tiempo. Sin
    // pasarela (o con clases gratis) la reserva nace confirmada, como antes.
    const conPasarela = pagoEnLinea && montoCop > 0;

    // (2) El INSERT. Si el puesto se colo por otra via, el indice unico parcial
    // lanza P2002 -> 409 PUESTO_OCUPADO.
    const reserva = await tx.reserva.create({
      data: {
        codigo: generarCodigoReserva(),
        claseId,
        usuarioId: usuario.id,
        puestoCodigo,
        montoCop,
        estado: conPasarela ? 'PENDIENTE_PAGO' : 'CONFIRMADA',
        estadoPago: 'PENDIENTE',
        expiraEn: conPasarela
          ? new Date(Date.now() + env.pagos.minutosParaPagar * 60_000)
          : null,
        nombreInvitado: nombreInvitado?.trim() || null,
      },
      include: incluirCompleto,
    });

    return reserva;
  });
}

/**
 * ¿Alguien ya tiene confirmado este puesto?
 *
 * Es la comprobación que sustituye al apartado: como una reserva sin pagar no
 * bloquea nada, el puesto se decide en el momento de confirmar y lo gana el
 * primero. Quien confirme después se entera aquí.
 */
export async function quienTieneElPuesto({ claseId, puestoCodigo, exceptoReservaId }) {
  return prisma.reserva.findFirst({
    where: {
      claseId,
      puestoCodigo,
      estado: { in: ESTADOS_OCUPAN_PUESTO },
      ...(exceptoReservaId ? { id: { not: exceptoReservaId } } : {}),
    },
    include: { usuario: { select: { nombre: true, telefono: true } } },
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
    // El cliente cancela solo hasta N horas antes; despues el puesto ya no se
    // alcanza a revender y la cancelacion pasa por recepcion. El admin no tiene
    // este limite.
    //
    // Un puesto APARTADO y sin pagar se suelta siempre, sin importar el plazo:
    // no hay nada que devolver y retenerlo solo le quita el cupo a alguien que
    // si va a pagar. Es lo que pasa cuando alguien empieza el pago y se
    // arrepiente.
    const soloApartado = reserva.estado === 'PENDIENTE_PAGO' && reserva.estadoPago !== 'PAGADO';
    const limite = reserva.clase.inicioEn.getTime() - env.horasLimiteCancelacion * 3600_000;
    if (!soloApartado && Date.now() > limite) {
      const h = env.horasLimiteCancelacion;
      throw new AppError(
        reserva.clase.inicioEn.getTime() <= Date.now()
          ? 'Esta clase ya empezó.'
          : `Solo puedes cancelar hasta ${h} hora${h === 1 ? '' : 's'} antes de la clase. Escríbenos y lo vemos.`,
        409,
        'FUERA_DE_PLAZO'
      );
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

/**
 * Recupera la sesion de un cliente que perdio el acceso (cambio de celular,
 * borro los datos del navegador, entra desde otro equipo).
 *
 * Se exigen las DOS cosas -codigo de reserva y telefono- a proposito: con el
 * telefono solo, cualquiera podria enumerar numeros y ver quien va a que clase;
 * con el codigo solo, bastaria con ver el QR de otra persona. Juntos, quien los
 * tiene es el dueno de la reserva.
 */
export async function recuperarAcceso({ codigo, telefono }) {
  const tel = normalizarTelefono(telefono);
  const reserva = await prisma.reserva.findUnique({
    where: { codigo: String(codigo).trim().toUpperCase() },
    include: incluirCompleto,
  });

  // Mismo error para codigo inexistente y telefono que no coincide: no revelamos
  // si ese codigo existe.
  if (!reserva || normalizarTelefono(reserva.usuario.telefono) !== tel) {
    throw new AppError(
      'No encontramos una reserva con ese código y ese teléfono.',
      404,
      'RECUPERACION_FALLIDA'
    );
  }

  return reserva;
}

/**
 * Aplica el resultado de un pago a la reserva.
 *
 * Es idempotente a proposito: Wompi puede reintentar el mismo evento y el
 * cliente puede volver del checkout mientras el webhook llega. Confirmar dos
 * veces no debe cambiar nada ni "resucitar" una reserva ya expirada.
 */
export async function aplicarResultadoPago({
  referencia,
  estadoPago,
  pagoRef,
  payload,
  // Con qué medio pagó. Lo resuelve quien habla con la pasarela; aquí no se
  // conoce el vocabulario del proveedor.
  metodoPago = 'wompi',
}) {
  const reserva = await prisma.reserva.findUnique({
    where: { codigo: String(referencia).toUpperCase() },
    include: incluirCompleto,
  });
  if (!reserva) throw noEncontrado('Reserva');

  // Ya estaba resuelta: no se toca.
  if (ESTADOS_CONFIRMADOS.includes(reserva.estado) && reserva.estadoPago === 'PAGADO') {
    return { reserva, cambio: false };
  }

  const datos = {
    estadoPago,
    metodoPago,
    pagoRef: pagoRef ?? reserva.pagoRef,
    pagoPayload: payload ?? reserva.pagoPayload,
    pagoActualizadoEn: new Date(),
  };

  if (estadoPago === 'PAGADO') {
    // Como una reserva sin pagar NO aparta el puesto, entre que esta persona
    // empezo a pagar y ahora otra pudo haberlo confirmado. Se comprueba siempre,
    // no solo cuando el plazo vencio.
    const ocupadoPorOtro = await quienTieneElPuesto({
      claseId: reserva.claseId,
      puestoCodigo: reserva.puestoCodigo,
      exceptoReservaId: reserva.id,
    });
    if (ocupadoPorOtro) {
      // Caso incomodo pero real: el pago entro y el puesto ya no esta. Se deja
      // constancia -y se le quita el vencimiento- para que la reserva siga a la
      // vista de recepcion hasta que devuelvan la plata o la reubiquen.
      const actualizada = await prisma.reserva.update({
        where: { id: reserva.id },
        data: {
          ...datos,
          expiraEn: null,
          notasPago: `Pago recibido, pero el puesto ${reserva.puestoCodigo} ya lo tenía ${ocupadoPorOtro.usuario.nombre}. Reubicar o devolver.`,
        },
        include: incluirCompleto,
      });
      return { reserva: actualizada, cambio: true, requiereReembolso: true };
    }
    datos.estado = 'CONFIRMADA';
    datos.expiraEn = null;
  } else if (estadoPago === 'RECHAZADO' && reserva.estado === 'PENDIENTE_PAGO') {
    // Pago rechazado: se libera el puesto de inmediato en vez de esperar el plazo.
    datos.estado = 'EXPIRADA';
  }

  const actualizada = await prisma.reserva.update({
    where: { id: reserva.id },
    data: datos,
    include: incluirCompleto,
  });
  return { reserva: actualizada, cambio: true };
}

/** Marca asistencia desde el check-in de recepcion (escaneando el codigo). */
export async function marcarAsistencia(reservaId, asistio) {
  return prisma.reserva.update({
    where: { id: reservaId },
    data: { estado: asistio ? 'ASISTIO' : 'NO_SHOW' },
    include: incluirCompleto,
  });
}
