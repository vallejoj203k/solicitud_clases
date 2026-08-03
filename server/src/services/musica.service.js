import { prisma } from '../config/prisma.js';
import { AppError, noEncontrado } from '../utils/errores.js';
import { ESTADOS_CONFIRMADOS } from '../config/estados.js';
import {
  buscar as buscarEnYoutube,
  detalle as detalleYoutube,
  detallesDe,
  deListas,
  populares,
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
  // Fecha en que YouTube se negó a ponerla incrustada, si pasó.
  bloqueadaEn: c.bloqueadaEn?.toISOString?.() ?? c.bloqueadaEn ?? null,
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

/**
 * El reproductor se topo con una cancion que no suena: se apunta para no
 * volver a proponerla.
 *
 * POR QUE HACE FALTA. La API de datos de YouTube trae un campo `embeddable` y
 * ya se filtra por el, pero MIENTE de forma sistematica con los sellos grandes:
 * "Muerte en Hawaii" de Calle 13 o "Bandolero" de Don Omar dicen que si y
 * despues el reproductor incrustado responde con el error 150 -"el propietario
 * no permite reproducirlo en otros sitios"-. No hay manera de saberlo sin
 * intentarlo, asi que se aprende del primer intento: la pantalla avisa, la
 * cancion queda marcada y no se propone ni se deja pedir nunca mas.
 *
 * Se guarda la fecha, no un booleano, porque YouTube cambia de opinion: sirve
 * para saber cual se cayo y cuando, y para poder revisarlas mas adelante.
 */
export async function marcarNoSuena(videoId) {
  let cancion = await prisma.cancion.findUnique({ where: { videoId } });

  if (!cancion) {
    // Puede no estar guardada: el reproductor tambien pone cosas que vienen
    // directas del buscador del panel. Se guarda igual, ya marcada, para no
    // volver a toparse con ella si algun dia entra al catalogo.
    const v = await detalleYoutube(videoId).catch(() => null);
    if (!v) return { ok: true, marcada: false, alternativas: [] };
    cancion = await prisma.cancion.create({
      data: {
        videoId: v.videoId,
        titulo: v.titulo,
        artista: v.canal,
        canal: v.canal,
        duracionSeg: v.duracionSeg,
        miniatura: v.miniatura,
        bloqueadaEn: new Date(),
      },
    });
  } else if (!cancion.bloqueadaEn) {
    cancion = await prisma.cancion.update({
      where: { id: cancion.id },
      data: { bloqueadaEn: new Date() },
    });
    // Si estaba esperando en la cola se saca: no va a sonar y solo estorbaria.
    await prisma.pedidoMusica.deleteMany({
      where: { cancionId: cancion.id, estado: 'EN_FILA' },
    });
  }

  return {
    ok: true,
    marcada: true,
    titulo: cancion.titulo,
    artista: cancion.artista ?? cancion.canal ?? null,
    alternativas: await otrasVersiones(cancion).catch(() => []),
  };
}

/**
 * Otras subidas de la misma cancion que si se dejan poner.
 *
 * Que el sello bloquee SU video no quiere decir que la cancion no este en
 * YouTube de otra forma: casi siempre estan el canal "- Topic" -el que genera
 * YouTube solo-, el audio oficial o alguna version en vivo, y esas suelen
 * dejarse incrustar. Buscar por titulo y artista las encuentra.
 *
 * Se filtran las que YA sabemos que no suenan, incluida la que acaba de fallar:
 * ofrecer de reemplazo algo que tambien va a saltarse seria peor que no ofrecer
 * nada.
 */
async function otrasVersiones(cancion, limite = 4) {
  const texto = [cancion.titulo, cancion.artista ?? cancion.canal].filter(Boolean).join(' ');
  if (!texto) return [];

  const encontradas = await buscarEnYoutube(texto);
  if (!encontradas.length) return [];

  const yaFallaron = await prisma.cancion.findMany({
    where: {
      bloqueadaEn: { not: null },
      videoId: { in: encontradas.map((c) => c.videoId) },
    },
    select: { videoId: true },
  });

  const fuera = new Set([cancion.videoId, ...yaFallaron.map((c) => c.videoId)]);
  return encontradas.filter((c) => !fuera.has(c.videoId)).slice(0, limite);
}

/** Las que pone el gimnasio cuando nadie pidio nada. Solo las reproducibles. */
export async function cancionesDeLaCasa(limite = 50) {
  const canciones = await prisma.cancion.findMany({
    where: { activa: true, deLaCasa: true, videoId: { not: null }, bloqueadaEn: null },
    orderBy: { titulo: 'asc' },
    take: limite,
  });
  return canciones.map(serializarCancion);
}

/** Todo lo reproducible que hay guardado, de la casa o no. */
async function delCatalogoLocal(limite = 300) {
  const canciones = await prisma.cancion.findMany({
    where: { activa: true, videoId: { not: null }, bloqueadaEn: null },
    take: limite,
  });
  return canciones.map(serializarCancion);
}

// Cuantas canciones puede aportar un mismo canal a una tanda. Sin tope, un
// artista con mucho catalogo se come la lista entera y el panel se ve monotono.
// Es una PREFERENCIA, no una regla: si con el tope no se llena la tanda, se
// vuelve a pasar sin el (ver `sugerenciasParaReproductor`).
const MAX_POR_CANAL = 2;

const barajar = (lista) => {
  const c = [...lista];
  for (let i = c.length - 1; i > 0; i -= 1) {
    const k = Math.floor(Math.random() * (i + 1));
    [c[i], c[k]] = [c[k], c[i]];
  }
  return c;
};

/**
 * Va tomando de `pozo` hasta `cuantas`, saltando lo excluido, lo ya elegido y
 * lo que pasaria del tope por canal.
 */
function tomar(pozo, cuantas, fuera, elegidas, maxPorCanal = MAX_POR_CANAL) {
  const puestas = new Set(elegidas.map((c) => c.videoId));
  const porCanal = new Map();
  for (const c of elegidas) porCanal.set(c.canal, (porCanal.get(c.canal) ?? 0) + 1);

  const salida = [];
  for (const c of pozo) {
    if (salida.length >= cuantas) break;
    if (!c?.videoId || fuera.has(c.videoId) || puestas.has(c.videoId)) continue;
    const n = porCanal.get(c.canal) ?? 0;
    if (n >= maxPorCanal) continue;
    puestas.add(c.videoId);
    porCanal.set(c.canal, n + 1);
    salida.push(c);
  }
  return salida;
}

/**
 * Que poner a continuacion cuando nadie ha pedido nada.
 *
 * SOLO SUENA LA MUSICA DEL GIMNASIO. Las sugerencias salen unicamente de lo que
 * hay en el panel (/admin/musica): lo que se importo pegando enlaces o listas de
 * YouTube, mas las listas configuradas en `YOUTUBE_LISTAS`. YouTube NO propone
 * nada por su cuenta.
 *
 * Antes se mezclaba el ranking de Colombia y el canal de lo que estaba sonando,
 * y el resultado era que la pantalla ponia musica que el gimnasio no habia
 * elegido. Ahora esas fuentes solo entran en un caso: que no haya NI UNA cancion
 * guardada, para que la pantalla no arranque muda el primer dia.
 *
 * La pantalla tampoco se puede quedar en silencio, asi que si con las
 * exclusiones no sale nada se afloja: primero a las ultimas cinco -cuando ya
 * sono la lista entera hay que repetir, y que sea lo mas viejo- y despues sin
 * exclusiones, o sea la lista dando la vuelta.
 */
export async function sugerenciasParaReproductor({ excluir = [], limite = 12 } = {}) {
  const [listas, local] = await Promise.all([
    deListas().catch(() => []),
    delCatalogoLocal().catch(() => []),
  ]);

  // Lo marcado "de la casa" va primero: es lo que el gimnasio importo a
  // proposito, frente a lo que entro suelto porque alguien lo pidio una vez.
  const propias = [
    ...barajar([...listas, ...local.filter((c) => c.deLaCasa)]),
    ...barajar(local.filter((c) => !c.deLaCasa)),
  ];

  /**
   * Una tanda: primero con el tope por artista, que es lo que da variedad, y si
   * asi no se llena se completa SIN el tope. Una lista de un solo artista es
   * una decision valida del gimnasio, no un motivo para devolver media tanda;
   * lo variado queda arriba, que es lo que se ve y lo que suena primero.
   */
  const componer = (fuera) => {
    const elegidas = tomar(propias, limite, fuera, []);
    if (elegidas.length < limite) {
      elegidas.push(...tomar(propias, limite - elegidas.length, fuera, elegidas, Infinity));
    }
    return elegidas;
  };

  const intentos = [
    () => componer(new Set(excluir.filter(Boolean))),
    () => componer(new Set(excluir.slice(-5).filter(Boolean))),
    () => componer(new Set()),
  ];

  for (const intento of intentos) {
    const lista = intento();
    if (lista.length) return lista;
  }

  // Red de seguridad del primer dia: sin catalogo no hay nada que proponer, y
  // dejar la pantalla muda es peor que sonar el ranking del pais. En cuanto el
  // gimnasio importe su primera cancion, este camino deja de usarse.
  if (propias.length) return [];
  const populacho = barajar(await populares().catch(() => []));
  return tomar(populacho, limite, new Set(excluir.slice(-5).filter(Boolean)), []);
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

/**
 * Cuanto historial reciente se le manda al reproductor al abrirlo, para que no
 * empiece repitiendo justo lo que acababa de sonar. NO es una prohibicion: solo
 * sirve para variar.
 */
const HORAS_DE_MEMORIA = 3;

/**
 * Pedir una cancion para los parlantes.
 *
 * NO HACE FALTA RESERVA NI SESION. El gimnasio lo pidio asi: quien esta en el
 * salon quiere poner musica sin tener que haber reservado por la app.
 *
 * REPETIR ESTA PERMITIDO. Antes una cancion no podia volver a pedirse hasta
 * tres horas despues de sonar; el gimnasio pidio quitarlo, porque si alguien la
 * quiere oir otra vez ese es justo el punto. El unico freno que queda -aparte
 * del reparto de turnos- es que no este YA en la cola: dos veces seguidas la
 * misma no es repetir, es un error.
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
  if (cancion.bloqueadaEn) {
    throw new AppError(
      'Esa canción no se puede reproducir aquí: YouTube no deja ponerla fuera de su página. Elige otra versión.',
      422,
      'CANCION_BLOQUEADA'
    );
  }

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
  const desde = new Date(Date.now() - HORAS_DE_MEMORIA * 3600_000);
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
