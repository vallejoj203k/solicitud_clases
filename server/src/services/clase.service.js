import { prisma } from '../config/prisma.js';
import { AppError, noEncontrado } from '../utils/errores.js';
import { expandirLayout } from '../utils/layout.js';
import { ESTADOS_OCUPAN_PUESTO, ESTADOS_CONFIRMADOS } from '../config/estados.js';
import {
  desdeFechaHoraLocal,
  sumarDias,
  fechaISOLocal,
  inicioDelDia,
  finDelDia,
} from '../utils/fechas.js';

const incluir = { tipoClase: true, instructor: true };

/** Valida que el cupo pedido quepa en el layout elegido. */
async function validarCupo({ tipoClaseId, layoutOverride, cupoMaximo, puestosBloqueados = [] }) {
  const tipo = await prisma.tipoClase.findUnique({ where: { id: tipoClaseId } });
  if (!tipo) throw noEncontrado('Tipo de clase');

  const layout = expandirLayout(layoutOverride ?? tipo.layoutPuestos);

  const invalidos = puestosBloqueados.filter((c) => !layout.codigos.includes(c));
  if (invalidos.length) {
    throw new AppError(
      `Estos puestos no existen en el layout: ${invalidos.join(', ')}`,
      422,
      'PUESTO_INVALIDO'
    );
  }
  const utilizables = layout.total - puestosBloqueados.length;
  if (cupoMaximo > utilizables) {
    throw new AppError(
      `El cupo (${cupoMaximo}) supera los puestos disponibles del salón (${utilizables}).`,
      422,
      'CUPO_EXCEDE_LAYOUT'
    );
  }
  return { tipo, layout };
}

export async function crearClase(datos) {
  const {
    tipoClaseId,
    instructorId,
    fecha,
    hora,
    duracionMin = 50,
    cupoMaximo,
    precioCop,
    layoutOverride,
    puestosBloqueados = [],
    notas,
  } = datos;

  const { tipo } = await validarCupo({ tipoClaseId, layoutOverride, cupoMaximo, puestosBloqueados });

  return prisma.clase.create({
    data: {
      tipoClaseId,
      instructorId: instructorId || null,
      inicioEn: desdeFechaHoraLocal(fecha, hora),
      duracionMin,
      cupoMaximo,
      precioCop: precioCop ?? tipo.precioCop,
      layoutOverride: layoutOverride ?? undefined,
      puestosBloqueados,
      notas: notas || null,
    },
    include: incluir,
  });
}

/**
 * Crea la misma clase para varios dias de la semana dentro de un rango.
 * Sirve para armar la programacion semanal sin repetir el formulario 20 veces.
 * `diasSemana`: 0=domingo ... 6=sabado.
 */
export async function crearClasesEnLote({ desde, hasta, diasSemana, horas, ...base }) {
  const creadas = [];
  let cursor = new Date(`${desde}T12:00:00Z`);
  const limite = new Date(`${hasta}T12:00:00Z`);

  while (cursor <= limite) {
    const fechaISO = fechaISOLocal(cursor);
    const [a, m, d] = fechaISO.split('-').map(Number);
    const diaSemana = new Date(Date.UTC(a, m - 1, d)).getUTCDay();

    if (diasSemana.includes(diaSemana)) {
      for (const hora of horas) {
        const inicioEn = desdeFechaHoraLocal(fechaISO, hora);
        if (inicioEn.getTime() <= Date.now()) continue; // no programar en el pasado
        const yaExiste = await prisma.clase.findFirst({
          where: { tipoClaseId: base.tipoClaseId, inicioEn },
        });
        if (yaExiste) continue;
        creadas.push(await crearClase({ ...base, fecha: fechaISO, hora }));
      }
    }
    cursor = sumarDias(cursor, 1);
  }
  return creadas;
}

export async function actualizarClase(id, datos) {
  const actual = await prisma.clase.findUnique({ where: { id }, include: incluir });
  if (!actual) throw noEncontrado('Clase');

  const cupoMaximo = datos.cupoMaximo ?? actual.cupoMaximo;
  const puestosBloqueados = datos.puestosBloqueados ?? actual.puestosBloqueados;
  const tipoClaseId = datos.tipoClaseId ?? actual.tipoClaseId;
  const layoutOverride =
    datos.layoutOverride === undefined ? actual.layoutOverride : datos.layoutOverride;

  await validarCupo({ tipoClaseId, layoutOverride, cupoMaximo, puestosBloqueados });

  // No se puede reducir el cupo por debajo de lo ya vendido.
  const ocupados = await prisma.reserva.count({
    where: { claseId: id, estado: { in: ESTADOS_OCUPAN_PUESTO } },
  });
  if (cupoMaximo < ocupados) {
    throw new AppError(
      `Ya hay ${ocupados} reservas activas; el cupo no puede quedar por debajo.`,
      409,
      'CUPO_MENOR_QUE_RESERVAS'
    );
  }

  // Bloquear un puesto que alguien ya reservo dejaria la reserva en el limbo.
  const nuevosBloqueos = puestosBloqueados.filter((c) => !actual.puestosBloqueados.includes(c));
  if (nuevosBloqueos.length) {
    const enConflicto = await prisma.reserva.findMany({
      where: { claseId: id, estado: { in: ESTADOS_OCUPAN_PUESTO }, puestoCodigo: { in: nuevosBloqueos } },
      select: { puestoCodigo: true },
    });
    if (enConflicto.length) {
      throw new AppError(
        `No puedes bloquear puestos ya reservados: ${enConflicto.map((r) => r.puestoCodigo).join(', ')}. Cancela esas reservas primero.`,
        409,
        'PUESTO_RESERVADO'
      );
    }
  }

  const data = {
    ...(datos.tipoClaseId ? { tipoClaseId: datos.tipoClaseId } : {}),
    ...(datos.instructorId !== undefined ? { instructorId: datos.instructorId || null } : {}),
    ...(datos.duracionMin !== undefined ? { duracionMin: datos.duracionMin } : {}),
    ...(datos.cupoMaximo !== undefined ? { cupoMaximo: datos.cupoMaximo } : {}),
    ...(datos.precioCop !== undefined ? { precioCop: datos.precioCop } : {}),
    ...(datos.puestosBloqueados !== undefined ? { puestosBloqueados: datos.puestosBloqueados } : {}),
    ...(datos.layoutOverride !== undefined ? { layoutOverride: datos.layoutOverride } : {}),
    ...(datos.notas !== undefined ? { notas: datos.notas || null } : {}),
    ...(datos.estado ? { estado: datos.estado } : {}),
  };
  if (datos.fecha && datos.hora) data.inicioEn = desdeFechaHoraLocal(datos.fecha, datos.hora);

  return prisma.clase.update({ where: { id }, data, include: incluir });
}

/**
 * Cancelar una clase no borra nada: marca la clase como CANCELADA y cancela sus
 * reservas activas, para conservar el historial y los reportes.
 */
export async function cancelarClase(id) {
  return prisma.$transaction(async (tx) => {
    const clase = await tx.clase.update({
      where: { id },
      data: { estado: 'CANCELADA' },
      include: incluir,
    });
    await tx.reserva.updateMany({
      where: { claseId: id, estado: { in: ESTADOS_OCUPAN_PUESTO } },
      data: { estado: 'CANCELADA', canceladoEn: new Date() },
    });
    return clase;
  });
}

/**
 * Cambia el precio de una disciplina.
 *
 * Hay dos precios y se confundían con facilidad: el de la DISCIPLINA es la
 * plantilla con la que nace cada clase nueva; el de la CLASE es el que
 * realmente se cobra y el único que ve el cliente.
 *
 * Con `aplicarAProximas` el precio nuevo baja también a las clases futuras que
 * todavía tenían el precio viejo. Las que tengan un precio propio (una promo,
 * por ejemplo) NO se tocan: se cuentan y se informan, para que el cambio no
 * borre en silencio una decisión deliberada.
 */
export async function actualizarPrecioTipo(id, { precioCop, aplicarAProximas = false }) {
  const tipo = await prisma.tipoClase.findUnique({ where: { id } });
  if (!tipo) throw noEncontrado('Disciplina');

  const precioAnterior = tipo.precioCop;

  return prisma.$transaction(async (tx) => {
    const actualizado = await tx.tipoClase.update({ where: { id }, data: { precioCop } });

    if (!aplicarAProximas) {
      return { tipo: actualizado, clasesActualizadas: 0, clasesConPrecioPropio: 0 };
    }

    // Solo hacia adelante: el precio de una clase que ya pasó es parte del
    // historial de pagos y no se reescribe.
    const proximas = { tipoClaseId: id, estado: 'ACTIVA', inicioEn: { gte: new Date() } };

    const { count } = await tx.clase.updateMany({
      where: { ...proximas, precioCop: precioAnterior },
      data: { precioCop },
    });
    const clasesConPrecioPropio = await tx.clase.count({
      where: { ...proximas, precioCop: { not: precioCop } },
    });

    return { tipo: actualizado, clasesActualizadas: count, clasesConPrecioPropio };
  });
}

/**
 * Borrado por rango: limpiar de una vez un lote semanal creado de más.
 *
 * Aplica la misma regla que el borrado de una sola clase -no se toca lo que
 * tenga reservas confirmadas o pagos- pero en vez de fallar por la primera que
 * la incumple, separa el rango en dos grupos y deja decidir:
 *   - las que se pueden borrar se borran;
 *   - las que tienen historial se pueden cancelar (`cancelarResto`), que las
 *     saca de la vista del cliente sin perder el registro.
 *
 * `simular` devuelve solo las cuentas: la pantalla las muestra ANTES de tocar
 * nada, porque borrar treinta clases no es una acción que deba sorprender.
 */
export async function eliminarClasesEnLote({
  desde,
  hasta,
  tipoSlug,
  cancelarResto = false,
  simular = false,
}) {
  const clases = await prisma.clase.findMany({
    where: {
      inicioEn: { gte: inicioDelDia(desde), lt: finDelDia(hasta) },
      ...(tipoSlug ? { tipoClase: { slug: tipoSlug } } : {}),
    },
    select: { id: true },
  });

  const vacio = { total: 0, eliminables: 0, conHistorial: 0, eliminadas: 0, canceladas: 0 };
  if (clases.length === 0) return vacio;

  const ids = clases.map((c) => c.id);
  const conHistorial = await prisma.reserva.findMany({
    where: {
      claseId: { in: ids },
      OR: [{ estado: { in: ESTADOS_CONFIRMADOS } }, { estadoPago: 'PAGADO' }],
    },
    select: { claseId: true },
    distinct: ['claseId'],
  });

  const intocables = new Set(conHistorial.map((r) => r.claseId));
  const borrables = ids.filter((id) => !intocables.has(id));

  const resumen = {
    total: ids.length,
    eliminables: borrables.length,
    conHistorial: intocables.size,
    eliminadas: 0,
    canceladas: 0,
  };
  if (simular) return resumen;

  if (borrables.length) {
    const { count } = await prisma.clase.deleteMany({ where: { id: { in: borrables } } });
    resumen.eliminadas = count;
  }

  if (cancelarResto && intocables.size) {
    const restantes = [...intocables];
    await prisma.$transaction([
      prisma.clase.updateMany({ where: { id: { in: restantes } }, data: { estado: 'CANCELADA' } }),
      prisma.reserva.updateMany({
        where: { claseId: { in: restantes }, estado: { in: ESTADOS_OCUPAN_PUESTO } },
        data: { estado: 'CANCELADA', canceladoEn: new Date() },
      }),
    ]);
    resumen.canceladas = restantes.length;
  }

  return resumen;
}

/** Borrado definitivo. Solo se permite si la clase no tiene reservas. */
export async function eliminarClase(id) {
  // Lo que impide borrar es el HISTORIAL, no la existencia de filas: una
  // reserva confirmada o con plata de por medio no se puede evaporar.
  //
  // Contar todas las reservas dejaba la clase en un callejón sin salida: al
  // cancelarla, las suyas quedan en CANCELADA -siguen siendo filas- y el
  // borrado respondía "cancélala en vez de eliminarla" a alguien que acababa de
  // cancelarla. Las canceladas, expiradas y las que nunca se pagaron no son
  // historial: se van con la clase (la relación es onDelete: Cascade).
  const historial = await prisma.reserva.count({
    where: {
      claseId: id,
      OR: [{ estado: { in: ESTADOS_CONFIRMADOS } }, { estadoPago: 'PAGADO' }],
    },
  });

  if (historial > 0) {
    throw new AppError(
      `Esta clase tiene ${historial} reserva${historial === 1 ? '' : 's'} confirmada${
        historial === 1 ? '' : 's'
      } o con pago registrado, así que no se puede borrar sin perder ese historial. Cancélala: deja de verse para los clientes y las reservas quedan canceladas.`,
      409,
      'CLASE_CON_HISTORIAL',
      { reservas: historial }
    );
  }

  await prisma.clase.delete({ where: { id } });
  return { ok: true };
}
