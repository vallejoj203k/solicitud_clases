import { prisma } from '../config/prisma.js';
import { expandirLayout } from '../utils/layout.js';
import { noEncontrado } from '../utils/errores.js';
import { ESTADOS_OCUPAN_PUESTO } from '../config/estados.js';
import { inicioDelDia, finDelDia, fechaISOLocal, horaLocal } from '../utils/fechas.js';


/** El layout de la clase: el propio si tiene override, si no el de su tipo. */
export function resolverLayout(clase) {
  return expandirLayout(clase.layoutOverride ?? clase.tipoClase.layoutPuestos);
}

/**
 * Calcula cuantos puestos quedan libres.
 *
 * Ojo: `cupoMaximo` puede ser menor que el numero de puestos del layout (ej.
 * salon de 20 bicis del que solo se abren 16). Por eso la disponibilidad es el
 * MINIMO entre los puestos fisicos utilizables y el cupo comercial.
 */
export function calcularCupos({ totalPuestos, bloqueados, ocupados, cupoMaximo }) {
  const utilizables = Math.max(0, totalPuestos - bloqueados);
  const capacidad = Math.min(utilizables, cupoMaximo);
  const disponibles = Math.max(0, capacidad - ocupados);
  return {
    capacidad,
    ocupados,
    disponibles,
    porcentajeOcupacion: capacidad === 0 ? 0 : Math.round((ocupados / capacidad) * 100),
    // Se marca "casi llena" a partir del 80% para el indicador visual y las alertas del admin.
    casiLlena: capacidad > 0 && ocupados / capacidad >= 0.8 && disponibles > 0,
    agotada: disponibles === 0,
  };
}

/** Forma serializable de una clase para el frontend, sin el detalle de puestos. */
export function serializarClase(clase, ocupados) {
  const layout = resolverLayout(clase);
  const bloqueados = (clase.puestosBloqueados || []).filter((c) => layout.codigos.includes(c));
  const cupos = calcularCupos({
    totalPuestos: layout.total,
    bloqueados: bloqueados.length,
    ocupados,
    cupoMaximo: clase.cupoMaximo,
  });

  return {
    id: clase.id,
    inicioEn: clase.inicioEn.toISOString(),
    fecha: fechaISOLocal(clase.inicioEn),
    hora: horaLocal(clase.inicioEn),
    duracionMin: clase.duracionMin,
    estado: clase.estado,
    notas: clase.notas,
    precioCop: clase.precioCop,
    instructor: clase.instructor ? { id: clase.instructor.id, nombre: clase.instructor.nombre } : null,
    tipoClase: {
      id: clase.tipoClase.id,
      slug: clase.tipoClase.slug,
      nombre: clase.tipoClase.nombre,
      color: clase.tipoClase.color,
      icono: clase.tipoClase.icono,
    },
    cupoMaximo: clase.cupoMaximo,
    // Va aqui para que el formulario de edicion pueda precargarlo: sin esto el
    // campo salia vacio y guardar una clase le borraba los puestos fuera de
    // servicio. No revela nada: el mapa ya los muestra como bloqueados.
    puestosBloqueados: bloqueados,
    ...cupos,
  };
}

const incluirRelaciones = { tipoClase: true, instructor: true };

/** Cuenta reservas activas por clase en una sola consulta agrupada. */
async function contarOcupacion(claseIds) {
  if (claseIds.length === 0) return new Map();
  const filas = await prisma.reserva.groupBy({
    by: ['claseId'],
    where: { claseId: { in: claseIds }, estado: { in: ESTADOS_OCUPAN_PUESTO } },
    _count: { _all: true },
  });
  return new Map(filas.map((f) => [f.claseId, f._count._all]));
}

/**
 * Lista clases activas en un rango. `desde`/`hasta` son fechas locales "YYYY-MM-DD".
 * Si no se pasa `desde`, arranca en "ahora" para no mostrar clases ya empezadas.
 */
export async function listarClases({ tipoSlug, desde, hasta, incluirPasadas = false, limite } = {}) {
  const where = { estado: 'ACTIVA' };
  if (tipoSlug) where.tipoClase = { slug: tipoSlug };

  const filtroFecha = {};
  if (desde) filtroFecha.gte = inicioDelDia(desde);
  if (hasta) filtroFecha.lt = finDelDia(hasta);
  if (!incluirPasadas) {
    const ahora = new Date();
    filtroFecha.gte = filtroFecha.gte && filtroFecha.gte > ahora ? filtroFecha.gte : ahora;
  }
  if (Object.keys(filtroFecha).length) where.inicioEn = filtroFecha;

  const clases = await prisma.clase.findMany({
    where,
    include: incluirRelaciones,
    orderBy: { inicioEn: 'asc' },
    ...(limite ? { take: limite } : {}),
  });

  const ocupacion = await contarOcupacion(clases.map((c) => c.id));
  return clases.map((c) => serializarClase(c, ocupacion.get(c.id) ?? 0));
}

/** Datos de la pantalla principal: cada disciplina con sus proximos horarios. */
export async function resumenHome({ horariosPorTipo = 3 } = {}) {
  const tipos = await prisma.tipoClase.findMany({ where: { activo: true }, orderBy: { orden: 'asc' } });
  const proximas = await listarClases({ limite: 60 });

  return tipos.map((tipo) => {
    const clases = proximas.filter((c) => c.tipoClase.slug === tipo.slug);
    return {
      id: tipo.id,
      slug: tipo.slug,
      nombre: tipo.nombre,
      descripcion: tipo.descripcion,
      color: tipo.color,
      icono: tipo.icono,
      precioCop: tipo.precioCop,
      proximas: clases.slice(0, horariosPorTipo),
      totalProximas: clases.length,
    };
  });
}

/**
 * Decide qué puestos del salón se ponen a la venta en una clase concreta.
 *
 * El layout describe el salón completo (por ejemplo 12 trotadoras), pero el
 * `cupoMaximo` puede ser menor. Antes se dibujaba el salón entero y los puestos
 * sobrantes se apagaban a medida que se llenaba, lo que hacía imposible entender
 * de un vistazo cuántos cupos había: se veían 12 cuadros para un cupo de 6.
 * Ahora se ofrecen exactamente `cupoMaximo` puestos.
 *
 * Reglas, en este orden:
 *   1. Los puestos ya reservados siempre se muestran (si no, la reserva de
 *      alguien desaparecería del mapa al bajar el cupo).
 *   2. Los bloqueados se muestran marcados como fuera de servicio, pero no
 *      consumen cupo: son parte del salón, no de la venta.
 *   3. Se completa con los primeros puestos libres hasta llegar al cupo.
 *
 * El conjunto resultante es estable mientras las reservas salgan del propio
 * mapa: reservar uno de los puestos ofrecidos no cambia cuáles se ofrecen.
 */
export function puestosEnJuego({ layout, ocupados, bloqueados, cupoMaximo }) {
  const enJuego = new Set();
  let libresPorAsignar = Math.max(0, cupoMaximo - ocupados.size);

  for (const codigo of layout.codigos) {
    if (ocupados.has(codigo)) {
      enJuego.add(codigo);
    } else if (bloqueados.has(codigo)) {
      enJuego.add(codigo);
    } else if (libresPorAsignar > 0) {
      enJuego.add(codigo);
      libresPorAsignar -= 1;
    }
  }
  return enJuego;
}

/**
 * Estado completo de una clase, incluyendo el mapa de puestos con el estado de
 * cada uno. Es lo que consume el componente SeatMap del frontend: el cliente no
 * interpreta el JSON del layout, solo dibuja las filas que le llegan.
 */
export async function obtenerDisponibilidad(claseId) {
  const clase = await prisma.clase.findUnique({ where: { id: claseId }, include: incluirRelaciones });
  if (!clase) throw noEncontrado('Clase');

  const reservas = await prisma.reserva.findMany({
    where: { claseId, estado: { in: ESTADOS_OCUPAN_PUESTO } },
    select: { puestoCodigo: true },
  });

  const ocupados = new Set(reservas.map((r) => r.puestoCodigo));
  const bloqueados = new Set(clase.puestosBloqueados || []);
  const layout = resolverLayout(clase);

  // Solo se dibujan los puestos que esta clase pone a la venta, de modo que la
  // cantidad de cuadros del mapa coincida con el cupo configurado.
  const enJuego = puestosEnJuego({
    layout,
    ocupados,
    bloqueados,
    cupoMaximo: clase.cupoMaximo,
  });

  const filas = layout.filas
    .map((fila) => ({
      ...fila,
      puestos: fila.puestos
        .filter((p) => enJuego.has(p.codigo))
        .map((p) => ({
          ...p,
          estado: ocupados.has(p.codigo)
            ? 'ocupado'
            : bloqueados.has(p.codigo)
              ? 'bloqueado'
              : 'libre',
        })),
    }))
    // Una fila del salón que quedó completamente fuera del cupo no se dibuja.
    .filter((fila) => fila.puestos.length > 0);

  return {
    clase: serializarClase(clase, ocupados.size),
    mapa: {
      titulo: layout.titulo,
      columnas: layout.columnas,
      pasilloDespuesDeCol: layout.pasilloDespuesDeCol,
      filas,
    },
  };
}
