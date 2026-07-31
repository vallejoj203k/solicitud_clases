import { prisma } from '../config/prisma.js';
import { inicioDelDia, finDelDia, fechaISOLocal, horaLocal, sumarDias } from '../utils/fechas.js';
import { serializarClase, calcularCupos, resolverLayout } from './disponibilidad.service.js';

const ESTADOS_ACTIVOS = ['CONFIRMADA', 'ASISTIO', 'NO_SHOW'];

/** Metricas de la pantalla principal del panel de administracion. */
export async function dashboard() {
  const ahora = new Date();
  const hoy = fechaISOLocal(ahora);
  const inicioHoy = inicioDelDia(hoy);
  const finHoy = finDelDia(hoy);

  const [clasesHoy, reservasHoy, pendientesPago, proximasRaw] = await Promise.all([
    prisma.clase.findMany({
      where: { inicioEn: { gte: inicioHoy, lt: finHoy }, estado: 'ACTIVA' },
      include: { tipoClase: true, instructor: true },
      orderBy: { inicioEn: 'asc' },
    }),
    prisma.reserva.count({
      where: { estado: { in: ESTADOS_ACTIVOS }, clase: { inicioEn: { gte: inicioHoy, lt: finHoy } } },
    }),
    prisma.reserva.aggregate({
      where: {
        estado: { in: ESTADOS_ACTIVOS },
        estadoPago: 'PENDIENTE',
        clase: { inicioEn: { gte: inicioHoy } },
      },
      _count: { _all: true },
      _sum: { montoCop: true },
    }),
    prisma.clase.findMany({
      where: { inicioEn: { gte: ahora }, estado: 'ACTIVA' },
      include: { tipoClase: true, instructor: true },
      orderBy: { inicioEn: 'asc' },
      take: 12,
    }),
  ]);

  const idsProximas = proximasRaw.map((c) => c.id);
  const conteos = idsProximas.length
    ? await prisma.reserva.groupBy({
        by: ['claseId'],
        where: { claseId: { in: idsProximas }, estado: { in: ESTADOS_ACTIVOS } },
        _count: { _all: true },
      })
    : [];
  const mapaConteo = new Map(conteos.map((c) => [c.claseId, c._count._all]));
  const proximas = proximasRaw.map((c) => serializarClase(c, mapaConteo.get(c.id) ?? 0));

  const ingresosHoy = await prisma.reserva.aggregate({
    where: {
      estadoPago: 'PAGADO',
      estado: { in: ESTADOS_ACTIVOS },
      clase: { inicioEn: { gte: inicioHoy, lt: finHoy } },
    },
    _sum: { montoCop: true },
    _count: { _all: true },
  });

  // Alerta: clases dentro de las proximas 72 horas con menos del 40% vendido.
  const limiteAlerta = sumarDias(ahora, 3);
  const alertas = proximas
    .filter((c) => new Date(c.inicioEn) <= limiteAlerta && c.porcentajeOcupacion < 40)
    .map((c) => ({
      claseId: c.id,
      nombre: c.tipoClase.nombre,
      fecha: c.fecha,
      hora: c.hora,
      ocupados: c.ocupados,
      capacidad: c.capacidad,
      porcentajeOcupacion: c.porcentajeOcupacion,
    }));

  return {
    hoy,
    clasesHoy: clasesHoy.length,
    reservasHoy,
    ingresosHoyCop: ingresosHoy._sum.montoCop ?? 0,
    reservasPagadasHoy: ingresosHoy._count._all,
    pendientesPago: {
      cantidad: pendientesPago._count._all,
      montoCop: pendientesPago._sum.montoCop ?? 0,
    },
    proximas: proximas.slice(0, 8),
    alertas,
  };
}

/** Reservas de una clase concreta, para la vista de lista de inscritos. */
export async function reservasDeClase(claseId) {
  const clase = await prisma.clase.findUnique({
    where: { id: claseId },
    include: { tipoClase: true, instructor: true },
  });
  if (!clase) return null;

  const reservas = await prisma.reserva.findMany({
    where: { claseId },
    include: { usuario: { select: { id: true, nombre: true, telefono: true } } },
    orderBy: [{ estado: 'asc' }, { puestoCodigo: 'asc' }],
  });

  const activas = reservas.filter((r) => ESTADOS_ACTIVOS.includes(r.estado));
  const layout = resolverLayout(clase);
  const bloqueados = (clase.puestosBloqueados || []).filter((c) => layout.codigos.includes(c)).length;

  return {
    clase: serializarClase(clase, activas.length),
    cupos: calcularCupos({
      totalPuestos: layout.total,
      bloqueados,
      ocupados: activas.length,
      cupoMaximo: clase.cupoMaximo,
    }),
    reservas: reservas.map((r) => ({
      id: r.id,
      codigo: r.codigo,
      puestoCodigo: r.puestoCodigo,
      estado: r.estado,
      estadoPago: r.estadoPago,
      metodoPago: r.metodoPago,
      montoCop: r.montoCop,
      creadoEn: r.creadoEn.toISOString(),
      usuario: r.usuario,
    })),
  };
}

/** Reporte de pagos filtrable por rango de fechas de clase y tipo de clase. */
export async function reportePagos({ desde, hasta, tipoSlug, estadoPago }) {
  const where = { estado: { in: ESTADOS_ACTIVOS } };
  const filtroClase = {};

  if (desde || hasta) {
    filtroClase.inicioEn = {};
    if (desde) filtroClase.inicioEn.gte = inicioDelDia(desde);
    if (hasta) filtroClase.inicioEn.lt = finDelDia(hasta);
  }
  if (tipoSlug) filtroClase.tipoClase = { slug: tipoSlug };
  if (Object.keys(filtroClase).length) where.clase = filtroClase;
  if (estadoPago) where.estadoPago = estadoPago;

  const reservas = await prisma.reserva.findMany({
    where,
    include: {
      clase: { include: { tipoClase: true, instructor: true } },
      usuario: { select: { id: true, nombre: true, telefono: true } },
    },
    orderBy: { clase: { inicioEn: 'asc' } },
  });

  const filas = reservas.map((r) => ({
    id: r.id,
    fecha: fechaISOLocal(r.clase.inicioEn),
    hora: horaLocal(r.clase.inicioEn),
    tipoClase: r.clase.tipoClase.nombre,
    instructor: r.clase.instructor?.nombre ?? '',
    cliente: r.usuario.nombre,
    telefono: r.usuario.telefono,
    puesto: r.puestoCodigo,
    codigo: r.codigo,
    estadoReserva: r.estado,
    estadoPago: r.estadoPago,
    metodoPago: r.metodoPago ?? '',
    montoCop: r.montoCop,
  }));

  const acumular = (estado) => {
    const sel = filas.filter((f) => f.estadoPago === estado);
    return { cantidad: sel.length, montoCop: sel.reduce((s, f) => s + f.montoCop, 0) };
  };

  return {
    filtros: { desde: desde ?? null, hasta: hasta ?? null, tipoSlug: tipoSlug ?? null },
    totales: {
      reservas: filas.length,
      pagado: acumular('PAGADO'),
      pendiente: acumular('PENDIENTE'),
      rechazado: acumular('RECHAZADO'),
      montoTotalCop: filas.reduce((s, f) => s + f.montoCop, 0),
    },
    filas,
  };
}

export const COLUMNAS_CSV = [
  { clave: 'fecha', titulo: 'Fecha' },
  { clave: 'hora', titulo: 'Hora' },
  { clave: 'tipoClase', titulo: 'Clase' },
  { clave: 'instructor', titulo: 'Instructor' },
  { clave: 'cliente', titulo: 'Cliente' },
  { clave: 'telefono', titulo: 'Teléfono' },
  { clave: 'puesto', titulo: 'Puesto' },
  { clave: 'codigo', titulo: 'Código' },
  { clave: 'estadoReserva', titulo: 'Estado reserva' },
  { clave: 'estadoPago', titulo: 'Estado pago' },
  { clave: 'metodoPago', titulo: 'Método' },
  { clave: 'montoCop', titulo: 'Monto (COP)' },
];

/**
 * Búsqueda para el mostrador: código de reserva, teléfono o nombre.
 *
 * Es lo que se usa cuando alguien llega a recepción con su QR o dictando su
 * código; antes había que abrir la clase y buscar a ojo en la lista.
 * Prioriza las reservas de hoy y las próximas, que son las que importan al
 * hacer check-in.
 */
export async function buscarReservas(consulta) {
  const q = String(consulta || '').trim();
  if (q.length < 3) return [];

  const soloDigitos = q.replace(/\D/g, '');
  const condiciones = [
    { codigo: { equals: q.toUpperCase() } },
    { usuario: { nombre: { contains: q, mode: 'insensitive' } } },
  ];
  if (soloDigitos.length >= 4) {
    condiciones.push({ usuario: { telefono: { contains: soloDigitos } } });
  }

  const reservas = await prisma.reserva.findMany({
    where: { OR: condiciones },
    include: {
      clase: { include: { tipoClase: true, instructor: true } },
      usuario: { select: { id: true, nombre: true, telefono: true } },
    },
    orderBy: { clase: { inicioEn: 'asc' } },
    take: 40,
  });

  const ahora = Date.now();
  return reservas
    .map((r) => ({
      id: r.id,
      codigo: r.codigo,
      puestoCodigo: r.puestoCodigo,
      estado: r.estado,
      estadoPago: r.estadoPago,
      metodoPago: r.metodoPago,
      montoCop: r.montoCop,
      usuario: r.usuario,
      claseId: r.clase.id,
      tipoClase: r.clase.tipoClase.nombre,
      color: r.clase.tipoClase.color,
      fecha: fechaISOLocal(r.clase.inicioEn),
      hora: horaLocal(r.clase.inicioEn),
      inicioEn: r.clase.inicioEn.toISOString(),
      yaPaso: r.clase.inicioEn.getTime() < ahora,
    }))
    // Las próximas primero; las pasadas al final, de más reciente a más vieja.
    .sort((a, b) => {
      if (a.yaPaso !== b.yaPaso) return a.yaPaso ? 1 : -1;
      const ta = new Date(a.inicioEn).getTime();
      const tb = new Date(b.inicioEn).getTime();
      return a.yaPaso ? tb - ta : ta - tb;
    });
}

/** Listado de clientes con su historial resumido. */
export async function listarClientes({ busqueda } = {}) {
  const where = { rol: 'CLIENTE' };
  if (busqueda) {
    where.OR = [
      { nombre: { contains: busqueda, mode: 'insensitive' } },
      { telefono: { contains: busqueda.replace(/\D/g, '') } },
    ];
  }

  const clientes = await prisma.usuario.findMany({
    where,
    orderBy: { creadoEn: 'desc' },
    take: 300,
    include: {
      reservas: {
        include: { clase: { include: { tipoClase: true } } },
        orderBy: { clase: { inicioEn: 'desc' } },
      },
    },
  });

  return clientes.map((c) => {
    const activas = c.reservas.filter((r) => ESTADOS_ACTIVOS.includes(r.estado));
    const ultima = activas[0];
    return {
      id: c.id,
      nombre: c.nombre,
      telefono: c.telefono,
      creadoEn: c.creadoEn.toISOString(),
      totalReservas: activas.length,
      canceladas: c.reservas.length - activas.length,
      totalPagadoCop: activas
        .filter((r) => r.estadoPago === 'PAGADO')
        .reduce((s, r) => s + r.montoCop, 0),
      pendientesPago: activas.filter((r) => r.estadoPago === 'PENDIENTE').length,
      ultimaClase: ultima
        ? {
            nombre: ultima.clase.tipoClase.nombre,
            fecha: fechaISOLocal(ultima.clase.inicioEn),
            hora: horaLocal(ultima.clase.inicioEn),
          }
        : null,
    };
  });
}

/** Historial detallado de un cliente. */
export async function detalleCliente(usuarioId) {
  const cliente = await prisma.usuario.findUnique({
    where: { id: usuarioId },
    include: {
      reservas: {
        include: { clase: { include: { tipoClase: true, instructor: true } } },
        orderBy: { clase: { inicioEn: 'desc' } },
      },
    },
  });
  if (!cliente) return null;

  return {
    id: cliente.id,
    nombre: cliente.nombre,
    telefono: cliente.telefono,
    notas: cliente.notas,
    creadoEn: cliente.creadoEn.toISOString(),
    reservas: cliente.reservas.map((r) => ({
      id: r.id,
      codigo: r.codigo,
      puestoCodigo: r.puestoCodigo,
      estado: r.estado,
      estadoPago: r.estadoPago,
      montoCop: r.montoCop,
      fecha: fechaISOLocal(r.clase.inicioEn),
      hora: horaLocal(r.clase.inicioEn),
      tipoClase: r.clase.tipoClase.nombre,
      color: r.clase.tipoClase.color,
    })),
  };
}
