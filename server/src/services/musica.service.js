import { prisma } from '../config/prisma.js';
import { AppError, noEncontrado } from '../utils/errores.js';
import { ESTADOS_CONFIRMADOS } from '../config/estados.js';
import {
  detalle as detalleYoutube,
  detallesDe,
  videosDeLista,
} from './youtube.service.js';

/**
 * La fila de musica del gimnasio.
 *
 * COMO SUENA: hay UN reproductor -la pantalla del gimnasio, en
 * /musica/reproductor- conectado a los parlantes. Los telefonos de los clientes
 * no reproducen nada: eligen y la cancion entra a la fila. Por eso "si ya hay
 * una sonando, espera a que termine" tiene sentido; con cada telefono sonando
 * por su lado no lo tendria.
 *
 * La app no aloja audio: guarda el id del video y lo pone con el reproductor
 * incrustado oficial de YouTube.
 */

/** Momentos de la clase a los que se puede etiquetar una cancion. */
export const MOMENTOS = ['calentamiento', 'subida', 'pico', 'enfriamiento'];

const limpiar = (texto) => texto?.trim().replace(/\s+/g, ' ') || null;

const serializarCancion = (c) => ({
  id: c.id,
  titulo: c.titulo,
  artista: c.artista ?? c.canal ?? null,
  canal: c.canal,
  videoId: c.videoId,
  duracionSeg: c.duracionSeg,
  miniatura: c.miniatura,
  momento: c.momento,
  deLaCasa: c.deLaCasa,
  // El panel pinta "fuera del catálogo" con esto; sin el campo, toda canción
  // recién pedida se veía desactivada.
  activa: c.activa,
});

const serializarPedido = (p) => ({
  id: p.id,
  estado: p.estado,
  turno: p.turno,
  creadoEn: p.creadoEn.toISOString(),
  sonoEn: p.sonoEn?.toISOString() ?? null,
  cancion: serializarCancion(p.cancion),
  pidio: p.usuario
    ? { id: p.usuario.id, nombre: p.usuario.nombre }
    : p.nombre
      ? { id: null, nombre: p.nombre }
      : null,
});

/* ------------------------------------------------------------- Catalogo */

/**
 * Guarda (o reutiliza) la cancion de un video de YouTube.
 *
 * Se le pregunta a YouTube una sola vez por video: a partir de ahi la fila se
 * pinta con lo que quedo en la base, sin gastar cuota.
 */
export async function guardarDeYoutube(videoId) {
  const yaEsta = await prisma.cancion.findUnique({ where: { videoId } });
  if (yaEsta) {
    // Si la habian sacado del catalogo y alguien la vuelve a pedir, es que
    // sigue viva.
    if (!yaEsta.activa) {
      return prisma.cancion.update({ where: { id: yaEsta.id }, data: { activa: true } });
    }
    return yaEsta;
  }

  const v = await detalleYoutube(videoId);
  return prisma.cancion.create({
    data: {
      videoId: v.videoId,
      titulo: v.titulo,
      artista: v.canal,
      canal: v.canal,
      duracionSeg: v.duracionSeg,
      miniatura: v.miniatura,
    },
  });
}

/** Busca en lo que ya se ha pedido alguna vez. No gasta cuota de YouTube. */
export async function buscarCanciones({ q, incluirInactivas = false, limite = 20 } = {}) {
  const texto = q?.trim();
  const canciones = await prisma.cancion.findMany({
    where: {
      ...(incluirInactivas ? {} : { activa: true }),
      ...(texto
        ? {
            OR: [
              { titulo: { contains: texto, mode: 'insensitive' } },
              { artista: { contains: texto, mode: 'insensitive' } },
              { canal: { contains: texto, mode: 'insensitive' } },
            ],
          }
        : {}),
    },
    orderBy: [{ titulo: 'asc' }],
    take: Math.min(limite, 100),
  });
  return canciones.map(serializarCancion);
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
  // Si ya sono en alguna clase se desactiva en vez de borrarse: borrarla se
  // llevaria por delante el registro de quien la pidio.
  if (pedidos > 0) {
    await prisma.cancion.update({ where: { id }, data: { activa: false } });
    return { ok: true, desactivada: true };
  }
  await prisma.cancion.delete({ where: { id } });
  return { ok: true, desactivada: false };
}

/**
 * Carga masiva pegando enlaces de YouTube, uno por linea, o el enlace de una
 * lista de reproduccion entera:
 *
 *   https://www.youtube.com/watch?v=XXXXXXXXXXX
 *   https://youtu.be/XXXXXXXXXXX
 *   XXXXXXXXXXX
 *   https://www.youtube.com/playlist?list=PL...
 *
 * ES LA VIA BARATA. Pegar titulos en texto obligaria a buscar cada uno (100
 * unidades por cancion: media cuota diaria en una lista de 50). Con los enlaces
 * basta pedir los detalles de 50 en 50, que cuesta 1.
 *
 * Las que entran quedan marcadas "de la casa": son justo las que el gimnasio
 * quiere que suenen cuando nadie ha pedido nada.
 */
export async function importarDeYoutube(texto, { deLaCasa = true } = {}) {
  const crudo = String(texto || '');

  const listas = [...crudo.matchAll(/[?&]list=([\w-]+)/g)].map((m) => m[1]);
  const sueltos = [
    // watch?v=ID  /  youtu.be/ID  /  /embed/ID  /  /shorts/ID
    ...[...crudo.matchAll(/(?:v=|youtu\.be\/|\/embed\/|\/shorts\/)([\w-]{11})/g)].map((m) => m[1]),
    // Lineas que son solo el id.
    ...crudo
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => /^[\w-]{11}$/.test(l)),
  ];

  const ids = [...sueltos];
  for (const lista of listas) {
    try {
      ids.push(...(await videosDeLista(lista, 100)));
    } catch {
      // Una lista privada o borrada no invalida los enlaces sueltos que vengan
      // en el mismo pegado.
    }
  }

  const unicos = [...new Set(ids)];
  if (!unicos.length) {
    throw new AppError(
      'No encontramos ningún enlace de YouTube. Pega los enlaces de las canciones, uno por línea, o el de una lista de reproducción.',
      422,
      'SIN_ENLACES'
    );
  }

  const videos = await detallesDe(unicos);

  let creadas = 0;
  let repetidas = 0;
  for (const v of videos) {
    const yaEsta = await prisma.cancion.findUnique({ where: { videoId: v.videoId } });
    if (yaEsta) {
      repetidas += 1;
      if (deLaCasa && (!yaEsta.deLaCasa || !yaEsta.activa)) {
        await prisma.cancion.update({
          where: { id: yaEsta.id },
          data: { deLaCasa: true, activa: true },
        });
      }
      continue;
    }
    await prisma.cancion.create({
      data: {
        videoId: v.videoId,
        titulo: v.titulo,
        artista: v.canal,
        canal: v.canal,
        duracionSeg: v.duracionSeg,
        miniatura: v.miniatura,
        deLaCasa,
      },
    });
    creadas += 1;
  }

  return {
    leidas: unicos.length,
    creadas,
    repetidas,
    // Lo que YouTube descartó por no dejarse incrustar, estar bloqueado en el
    // país o durar de más. Decirlo evita el "pegué 40 y solo entraron 31".
    descartadas: unicos.length - videos.length,
  };
}

/** Las que pone el gimnasio cuando nadie pidio nada. Solo las reproducibles. */
export async function cancionesDeLaCasa(limite = 50) {
  const canciones = await prisma.cancion.findMany({
    where: { activa: true, deLaCasa: true, videoId: { not: null } },
    orderBy: { titulo: 'asc' },
    take: limite,
  });
  return canciones.map(serializarCancion);
}

/* ----------------------------------------------------------------- Fila */

/**
 * La cola del gimnasio, en el orden en que va a sonar.
 *
 * POR RONDAS: primero la primera cancion de cada quien, despues la segunda de
 * cada quien, y asi. Cada persona puede pedir las que quiera sin dejar a los
 * demas sin sonar, que es lo que pasaria con un orden de llegada estricto.
 */
export async function colaActual({ incluirSonadas = false, limiteSonadas = 20 } = {}) {
  const pedidos = await prisma.pedidoMusica.findMany({
    where: incluirSonadas ? {} : { estado: { in: ['EN_FILA', 'SONANDO'] } },
    include: { cancion: true, usuario: { select: { id: true, nombre: true } } },
    orderBy: [{ turno: 'asc' }, { creadoEn: 'asc' }],
    ...(incluirSonadas ? { take: limiteSonadas } : {}),
  });
  return pedidos.map(serializarPedido);
}

/** Cuanto tiempo tiene que pasar para que una cancion pueda repetirse. */
const HORAS_SIN_REPETIR = 3;

/**
 * Pedir una cancion para los parlantes.
 *
 * NO HACE FALTA RESERVA NI SESION. El gimnasio lo pidio asi: quien esta en el
 * salon quiere poner musica sin tener que haber reservado por la app. A cambio
 * quedan dos frenos, que son los que de verdad importan:
 *
 *  - la misma cancion no puede estar dos veces en la cola, ni volver a pedirse
 *    hasta unas horas despues de haber sonado;
 *  - los turnos se reparten por persona -o por navegador, si no hay sesion-, de
 *    modo que quien pide diez no deja sin sonar a quien pidio una.
 */
export async function pedirCancion({
  videoId,
  cancionId,
  usuarioId = null,
  dispositivoId = null,
  claseId = null,
}) {
  const cancion = videoId
    ? await guardarDeYoutube(videoId)
    : await prisma.cancion.findUnique({ where: { id: cancionId } });
  if (!cancion || !cancion.activa) throw noEncontrado('Canción');

  // Ya esperando o sonando: no se encola dos veces, la pida quien la pida.
  const enCola = await prisma.pedidoMusica.findFirst({
    where: { cancionId: cancion.id, estado: { in: ['EN_FILA', 'SONANDO'] } },
  });
  if (enCola) {
    throw new AppError(
      enCola.estado === 'SONANDO'
        ? 'Esa canción está sonando ahora mismo.'
        : 'Esa canción ya está en la cola.',
      409,
      'CANCION_YA_EN_COLA'
    );
  }

  // Sono hace poco: se deja descansar. Sin esto, tres personas pueden dejar la
  // tarde entera dando vueltas sobre las mismas canciones.
  const desde = new Date(Date.now() - HORAS_SIN_REPETIR * 3600_000);
  const reciente = await prisma.pedidoMusica.findFirst({
    where: { cancionId: cancion.id, estado: 'SONO', sonoEn: { gte: desde } },
  });
  if (reciente) {
    throw new AppError(
      'Esa canción sonó hace poco. Elige otra y vuelve a intentarlo más tarde.',
      409,
      'CANCION_YA_SONO'
    );
  }

  const usuario = usuarioId
    ? await prisma.usuario.findUnique({ where: { id: usuarioId } })
    : null;

  // El turno es cuantas lleva pedidas QUIEN pide, contando solo lo que sigue
  // vivo: al vaciarse la cola todos vuelven a empezar en la ronda 1.
  const quien = usuario
    ? { usuarioId: usuario.id }
    : dispositivoId
      ? { dispositivoId }
      : null;
  const suyas = quien
    ? await prisma.pedidoMusica.count({
        where: { ...quien, estado: { in: ['EN_FILA', 'SONANDO'] } },
      })
    : 0;

  const pedido = await prisma.pedidoMusica.create({
    data: {
      cancionId: cancion.id,
      usuarioId: usuario?.id ?? null,
      dispositivoId,
      nombre: usuario?.nombre ?? null,
      claseId,
      turno: suyas + 1,
    },
    include: { cancion: true, usuario: { select: { id: true, nombre: true } } },
  });
  return serializarPedido(pedido);
}

/** Quitar un pedido propio mientras no haya sonado ni este sonando. */
export async function quitarPedido({
  pedidoId,
  usuarioId = null,
  dispositivoId = null,
  porAdmin = false,
}) {
  const pedido = await prisma.pedidoMusica.findUnique({ where: { id: pedidoId } });
  if (!pedido) throw noEncontrado('Pedido');

  // Es suyo si coincide la sesion o, cuando no hay sesion, el navegador desde
  // el que se pidio.
  const esSuyo =
    (usuarioId && pedido.usuarioId === usuarioId) ||
    (dispositivoId && pedido.dispositivoId === dispositivoId);
  if (!porAdmin && !esSuyo) {
    throw new AppError('Ese pedido no es tuyo.', 403, 'SIN_PERMISO');
  }
  if (pedido.estado === 'SONO') {
    throw new AppError('Esa canción ya sonó.', 409, 'YA_SONO');
  }
  if (pedido.estado === 'SONANDO' && !porAdmin) {
    throw new AppError('Esa canción está sonando ahora mismo.', 409, 'SONANDO');
  }
  await prisma.pedidoMusica.delete({ where: { id: pedidoId } });
  return { ok: true };
}

/* --------------------------------------------------------- Reproduccion */

/** La clase que se esta dictando ahora mismo, que es la que manda la musica. */
export async function claseEnCurso() {
  const ahora = new Date();
  // Ventana holgada hacia atras y se filtra por el fin real, que depende de la
  // duracion de cada clase.
  const candidatas = await prisma.clase.findMany({
    where: {
      estado: 'ACTIVA',
      inicioEn: { gte: new Date(ahora.getTime() - 4 * 3600_000), lte: ahora },
    },
    include: { tipoClase: true },
    orderBy: { inicioEn: 'desc' },
  });
  return (
    candidatas.find((c) => c.inicioEn.getTime() + c.duracionMin * 60_000 > ahora.getTime()) ?? null
  );
}

/**
 * Lo que suena ahora y lo que viene, para la pantalla del gimnasio y para los
 * telefonos de los clientes.
 *
 * Es UNA SOLA cola para todo el gimnasio. La clase en curso se informa solo
 * para poder enseñarla en pantalla; no filtra nada.
 */
export async function estadoReproduccion() {
  const [pedidos, clase] = await Promise.all([
    prisma.pedidoMusica.findMany({
      where: { estado: { in: ['EN_FILA', 'SONANDO'] } },
      include: { cancion: true, usuario: { select: { id: true, nombre: true } } },
      orderBy: [{ turno: 'asc' }, { creadoEn: 'asc' }],
    }),
    claseEnCurso(),
  ]);

  // Lo sonado hace poco, para que la automatica no lo repita. Se mira una
  // ventana y no todo el historial: el gimnasio lleva meses abierto y la lista
  // completa no cabria en una URL.
  const desde = new Date(Date.now() - HORAS_SIN_REPETIR * 3600_000);
  const recientes = await prisma.pedidoMusica.findMany({
    where: { estado: 'SONO', sonoEn: { gte: desde } },
    include: { cancion: { select: { videoId: true } } },
    orderBy: { sonoEn: 'desc' },
    take: 60,
  });

  const sonando = pedidos.find((p) => p.estado === 'SONANDO') ?? null;

  return {
    clase: clase
      ? {
          id: clase.id,
          tipoClase: clase.tipoClase.nombre,
          color: clase.tipoClase.color,
          inicioEn: clase.inicioEn.toISOString(),
          terminaEn: new Date(
            clase.inicioEn.getTime() + clase.duracionMin * 60_000
          ).toISOString(),
        }
      : null,
    sonando: sonando ? serializarPedido(sonando) : null,
    fila: pedidos.filter((p) => p.estado === 'EN_FILA').map(serializarPedido),
    sonadas: recientes.length,
    reproducidas: recientes.map((p) => p.cancion.videoId).filter(Boolean),
  };
}

/**
 * El reproductor pide la siguiente.
 *
 * Cierra la que estaba sonando y promueve la primera de la cola. Devuelve
 * `sonando: null` cuando no queda nada pedido: ahi la pantalla sigue sola con
 * lo que sugiere el servidor.
 */
export async function siguienteCancion() {
  return prisma.$transaction(async (tx) => {
    // Cierra lo que estuviera puesto. Si hubiera dos pantallas abiertas y las
    // dos pidieran "siguiente" casi al tiempo, como esto va dentro de la
    // transaccion la segunda ya no encuentra nada SONANDO y no salta dos.
    await tx.pedidoMusica.updateMany({
      where: { estado: 'SONANDO' },
      data: { estado: 'SONO', sonoEn: new Date() },
    });

    const siguiente = await tx.pedidoMusica.findFirst({
      where: { estado: 'EN_FILA' },
      orderBy: [{ turno: 'asc' }, { creadoEn: 'asc' }],
    });

    if (!siguiente) return { sonando: null, motivo: 'COLA_VACIA' };

    const puesta = await tx.pedidoMusica.update({
      where: { id: siguiente.id },
      data: { estado: 'SONANDO', sonoEn: new Date() },
      include: { cancion: true, usuario: { select: { id: true, nombre: true } } },
    });
    return { sonando: serializarPedido(puesta), motivo: 'OK' };
  });
}

/**
 * Marcar a mano que una cancion sono, o devolverla a la fila.
 *
 * Sigue existiendo para el instructor que pone la musica por su cuenta y para
 * deshacer un salto por error.
 */
export async function marcarSono(pedidoId, sono = true) {
  const pedido = await prisma.pedidoMusica.findUnique({ where: { id: pedidoId } });
  if (!pedido) throw noEncontrado('Pedido');

  const actualizado = await prisma.pedidoMusica.update({
    where: { id: pedidoId },
    data: sono ? { estado: 'SONO', sonoEn: new Date() } : { estado: 'EN_FILA', sonoEn: null },
    include: { cancion: true, usuario: { select: { id: true, nombre: true } } },
  });
  return serializarPedido(actualizado);
}
