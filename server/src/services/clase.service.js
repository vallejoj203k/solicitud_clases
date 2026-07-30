import { prisma } from '../config/prisma.js';
import { AppError, noEncontrado } from '../utils/errores.js';
import { expandirLayout } from '../utils/layout.js';
import { desdeFechaHoraLocal, sumarDias, fechaISOLocal } from '../utils/fechas.js';

const ESTADOS_ACTIVOS = ['CONFIRMADA', 'ASISTIO', 'NO_SHOW'];
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
    where: { claseId: id, estado: { in: ESTADOS_ACTIVOS } },
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
      where: { claseId: id, estado: { in: ESTADOS_ACTIVOS }, puestoCodigo: { in: nuevosBloqueos } },
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
      where: { claseId: id, estado: { in: ESTADOS_ACTIVOS } },
      data: { estado: 'CANCELADA', canceladoEn: new Date() },
    });
    return clase;
  });
}

/** Borrado definitivo. Solo se permite si la clase no tiene reservas. */
export async function eliminarClase(id) {
  const reservas = await prisma.reserva.count({ where: { claseId: id } });
  if (reservas > 0) {
    throw new AppError(
      'Esta clase tiene reservas. Cancélala en vez de eliminarla para conservar el historial.',
      409,
      'CLASE_CON_RESERVAS'
    );
  }
  await prisma.clase.delete({ where: { id } });
  return { ok: true };
}
