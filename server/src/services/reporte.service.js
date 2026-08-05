import { prisma } from '../config/prisma.js';
import { inicioDelDia, finDelDia, fechaISOLocal, horaLocal, sumarDias } from '../utils/fechas.js';
import { serializarClase, calcularCupos, resolverLayout, puestosEnJuego } from './disponibilidad.service.js';
import { ESTADOS_OCUPAN_PUESTO } from '../config/estados.js';
import { noEncontrado } from '../utils/errores.js';
import { ESTADOS_CONFIRMADOS } from '../config/estados.js';


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
      where: { estado: { in: ESTADOS_CONFIRMADOS }, clase: { inicioEn: { gte: inicioHoy, lt: finHoy } } },
    }),
    prisma.reserva.aggregate({
      where: {
        estado: { in: ESTADOS_CONFIRMADOS },
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
        where: { claseId: { in: idsProximas }, estado: { in: ESTADOS_CONFIRMADOS } },
        _count: { _all: true },
      })
    : [];
  const mapaConteo = new Map(conteos.map((c) => [c.claseId, c._count._all]));
  const proximas = proximasRaw.map((c) => serializarClase(c, mapaConteo.get(c.id) ?? 0));

  const ingresosHoy = await prisma.reserva.aggregate({
    where: {
      estadoPago: 'PAGADO',
      estado: { in: ESTADOS_CONFIRMADOS },
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

  const activas = reservas.filter((r) => ESTADOS_CONFIRMADOS.includes(r.estado));
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
      nombreInvitado: r.nombreInvitado,
    })),
  };
}

/** Reporte de pagos filtrable por rango de fechas de clase y tipo de clase. */
export async function reportePagos({ desde, hasta, tipoSlug, estadoPago }) {
  const where = { estado: { in: ESTADOS_CONFIRMADOS } };
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
    // Cuando el puesto es para un acompanante, quien asiste no es quien reservo.
    asiste: r.nombreInvitado ?? r.usuario.nombre,
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
  { clave: 'cliente', titulo: 'Quién reservó' },
  { clave: 'asiste', titulo: 'Quién asiste' },
  { clave: 'telefono', titulo: 'Teléfono' },
  { clave: 'puesto', titulo: 'Puesto' },
  { clave: 'codigo', titulo: 'Código' },
  { clave: 'estadoReserva', titulo: 'Estado reserva' },
  { clave: 'estadoPago', titulo: 'Estado pago' },
  { clave: 'metodoPago', titulo: 'Método' },
  { clave: 'montoCop', titulo: 'Monto (COP)' },
];

/**
 * Agenda del mostrador: las clases ordenadas de la más cercana a la más lejana.
 *
 * Arranca una hora ANTES de ahora a propósito: una clase que ya empezó sigue
 * siendo la relevante en recepción, porque la gente entra durante los primeros
 * minutos.
 */
/**
 * Cola de pagos por confirmar del mostrador.
 *
 * En el cobro por transferencia no hay pasarela que avise: el cliente dice "ya
 * transferi" y alguien coteja contra la notificacion del banco. Aparecen
 * primero los que ya avisaron -y de esos, el que lleva mas rato esperando-,
 * porque son los que tienen a alguien parado en el mostrador.
 *
 * Se listan tambien los que todavia no avisan: sirven para ver quien esta a
 * punto de perder el puesto, y a veces la persona transfiere sin tocar el
 * boton.
 */
export async function pagosPorConfirmar() {
  const reservas = await prisma.reserva.findMany({
    where: {
      estado: 'PENDIENTE_PAGO',
      // Sin vencimiento entran las que quedaron en conflicto -pago recibido pero
      // el puesto ya era de otro-: no se pueden perder de vista, son las que hay
      // que devolver o reubicar.
      OR: [{ expiraEn: null }, { expiraEn: { gt: new Date() } }],
    },
    include: {
      clase: { include: { tipoClase: true } },
      usuario: { select: { nombre: true, telefono: true } },
    },
    orderBy: [{ avisoPagoEn: 'asc' }, { creadoEn: 'asc' }],
  });

  const ahora = Date.now();
  return reservas.map((r) => ({
    id: r.id,
    codigo: r.codigo,
    puestoCodigo: r.puestoCodigo,
    montoCop: r.montoCop,
    creadoEn: r.creadoEn.toISOString(),
    avisoPagoEn: r.avisoPagoEn?.toISOString() ?? null,
    // Si el puesto se lo llevó otro, aquí viene la instrucción para recepción.
    notasPago: r.notasPago,
    // Minutos que le quedan al puesto apartado, para que recepcion sepa a quien
    // atender primero.
    minutosRestantes: r.expiraEn
      ? Math.max(0, Math.round((r.expiraEn.getTime() - ahora) / 60000))
      : null,
    usuario: r.usuario,
    nombreInvitado: r.nombreInvitado,
    clase: {
      id: r.claseId,
      fecha: fechaISOLocal(r.clase.inicioEn),
      hora: horaLocal(r.clase.inicioEn),
      tipoClase: r.clase.tipoClase.nombre,
      color: r.clase.tipoClase.color,
    },
  }));
}

/**
 * Agenda del mostrador.
 *
 * Mira los próximos `dias`, que es lo que le importa a recepción. Pero si en esa
 * ventana no hay nada, NO responde "no hay clases": busca las siguientes que
 * existan y las devuelve marcando `hayEnVentana: false`. Decir "no hay clases
 * programadas" mientras el calendario y la app del cliente muestran clases
 * dentro de dos semanas hace pensar que los datos están rotos.
 */
export async function agendaRecepcion({ horasAtras = 1, dias = 7, siguientes = 8 } = {}) {
  const desde = new Date(Date.now() - horasAtras * 3600_000);
  const hasta = new Date(Date.now() + dias * 24 * 3600_000);
  const enAdelante = { inicioEn: { gte: desde }, estado: 'ACTIVA' };

  let hayEnVentana = true;
  let clases = await prisma.clase.findMany({
    where: { ...enAdelante, inicioEn: { gte: desde, lte: hasta } },
    include: { tipoClase: true, instructor: true },
    orderBy: { inicioEn: 'asc' },
  });

  if (clases.length === 0) {
    hayEnVentana = false;
    clases = await prisma.clase.findMany({
      where: enAdelante,
      include: { tipoClase: true, instructor: true },
      orderBy: { inicioEn: 'asc' },
      take: siguientes,
    });
  }

  if (clases.length === 0) return { clases: [], hayEnVentana: true, dias };

  const conteos = await prisma.reserva.groupBy({
    by: ['claseId'],
    where: { claseId: { in: clases.map((c) => c.id) }, estado: { in: ESTADOS_OCUPAN_PUESTO } },
    _count: { _all: true },
  });
  const mapaConteo = new Map(conteos.map((c) => [c.claseId, c._count._all]));

  const ahora = Date.now();
  return {
    hayEnVentana,
    dias,
    clases: clases.map((c) => {
      const serializada = serializarClase(c, mapaConteo.get(c.id) ?? 0);
      const inicio = c.inicioEn.getTime();
      const fin = inicio + c.duracionMin * 60_000;
      return {
        ...serializada,
        enCurso: ahora >= inicio && ahora <= fin,
        minutosParaEmpezar: Math.round((inicio - ahora) / 60_000),
      };
    }),
  };
}

/**
 * Mapa del salón con el ocupante de cada puesto.
 *
 * Es lo que recepción necesita para responder "¿quién está en la bici C2?" sin
 * leer una lista. Reusa la misma expansión de layout que el mapa del cliente,
 * pero adjunta la reserva a cada puesto tomado.
 */
export async function mapaConOcupantes(claseId) {
  const clase = await prisma.clase.findUnique({
    where: { id: claseId },
    include: { tipoClase: true, instructor: true },
  });
  if (!clase) throw noEncontrado('Clase');

  const reservas = await prisma.reserva.findMany({
    where: { claseId, estado: { in: ESTADOS_OCUPAN_PUESTO } },
    include: { usuario: { select: { id: true, nombre: true, telefono: true } } },
  });

  const porPuesto = new Map(reservas.map((r) => [r.puestoCodigo, r]));
  const bloqueados = new Set(clase.puestosBloqueados || []);
  const layout = resolverLayout(clase);

  const enJuego = puestosEnJuego({
    layout,
    ocupados: new Set(porPuesto.keys()),
    bloqueados,
    cupoMaximo: clase.cupoMaximo,
  });

  const filas = layout.filas
    .map((fila) => ({
      ...fila,
      puestos: fila.puestos
        .filter((p) => enJuego.has(p.codigo))
        .map((p) => {
          const r = porPuesto.get(p.codigo);
          return {
            ...p,
            estado: r ? 'ocupado' : bloqueados.has(p.codigo) ? 'bloqueado' : 'libre',
            reserva: r
              ? {
                  id: r.id,
                  codigo: r.codigo,
                  estado: r.estado,
                  estadoPago: r.estadoPago,
                  metodoPago: r.metodoPago,
                  montoCop: r.montoCop,
                  creadoEn: r.creadoEn.toISOString(),
                  usuario: r.usuario,
                  nombreInvitado: r.nombreInvitado,
                }
              : null,
          };
        }),
    }))
    .filter((fila) => fila.puestos.length > 0);

  const activas = reservas.length;
  return {
    clase: serializarClase(clase, activas),
    cupos: calcularCupos({
      totalPuestos: layout.total,
      bloqueados: layout.codigos.filter((c) => bloqueados.has(c)).length,
      ocupados: activas,
      cupoMaximo: clase.cupoMaximo,
    }),
    mapa: {
      titulo: layout.titulo,
      columnas: layout.columnas,
      pasilloDespuesDeCol: layout.pasilloDespuesDeCol,
      filas,
    },
  };
}

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
      nombreInvitado: r.nombreInvitado,
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
    where.OR = [{ nombre: { contains: busqueda, mode: 'insensitive' } }];
    // OJO: solo se busca por telefono si de verdad se escribieron digitos. Con
    // un nombre, `replace(/\D/g,'')` deja la cadena VACIA, y `contains: ''`
    // coincide con todas las filas: buscar "Quintero" devolvia el listado
    // entero. Es la misma guarda que ya tenia `buscarReservas`.
    const soloDigitos = busqueda.replace(/\D/g, '');
    if (soloDigitos.length >= 4) where.OR.push({ telefono: { contains: soloDigitos } });
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
    const activas = c.reservas.filter((r) => ESTADOS_CONFIRMADOS.includes(r.estado));
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
