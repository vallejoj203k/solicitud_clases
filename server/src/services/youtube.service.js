import { env } from '../config/env.js';
import { AppError } from '../utils/errores.js';

/**
 * YouTube: buscar canciones y traer sus datos.
 *
 * La app NO descarga ni aloja audio. Guarda el id del video y lo reproduce con
 * el reproductor incrustado oficial de YouTube, que va con su publicidad y sus
 * reglas. Aqui solo se consulta la API de datos para saber que existe, cuanto
 * dura y si se deja incrustar.
 *
 * LA CUOTA ES EL LIMITE REAL, no la velocidad. La API gratuita da 10.000
 * unidades por dia:
 *
 *   search.list        100 unidades   <- una busqueda
 *   videos.list          1 unidad     <- detalles de hasta 50 videos
 *   playlistItems.list   1 unidad     <- una pagina de una lista
 *
 * O sea ~100 busquedas al dia si no se hace nada. Por eso:
 *  - se cachea por texto normalizado, asi que "bad bunny" cuesta una sola vez;
 *  - el catalogo para ojear sale de listas de reproduccion (1 unidad), no de
 *    busquedas;
 *  - la busqueda se dispara al enviar, nunca en cada tecla.
 */

const BASE = env.youtube.urlBasePruebas || 'https://www.googleapis.com/youtube/v3';

/** Resultados cacheados en memoria. Se pierde al reiniciar y no importa. */
const cache = new Map();

function deCache(clave) {
  const entrada = cache.get(clave);
  if (!entrada) return null;
  if (entrada.expira < Date.now()) {
    cache.delete(clave);
    return null;
  }
  return entrada.valor;
}

function aCache(clave, valor, minutos) {
  // Cota simple para que el proceso no crezca sin freno: al llegar al tope se
  // bota la entrada mas vieja.
  if (cache.size > 500) cache.delete(cache.keys().next().value);
  cache.set(clave, { valor, expira: Date.now() + minutos * 60_000 });
}

export const hayYoutube = () => Boolean(env.youtube.apiKey);

function exigirLlave() {
  if (!env.youtube.apiKey) {
    throw new AppError(
      'La búsqueda de música no está configurada todavía.',
      503,
      'YOUTUBE_SIN_CONFIGURAR'
    );
  }
}

async function llamar(recurso, params) {
  exigirLlave();
  const q = new URLSearchParams({ ...params, key: env.youtube.apiKey });
  const respuesta = await fetch(`${BASE}/${recurso}?${q}`);
  const datos = await respuesta.json().catch(() => null);

  if (!respuesta.ok) {
    const motivo = datos?.error?.errors?.[0]?.reason;
    // La cuota agotada no es un fallo del gimnasio ni algo que reintentar:
    // merece un mensaje que se entienda desde la pantalla.
    if (motivo === 'quotaExceeded' || motivo === 'dailyLimitExceeded') {
      throw new AppError(
        'Se acabaron las búsquedas de hoy. Elige del catálogo mientras tanto.',
        429,
        'YOUTUBE_SIN_CUOTA'
      );
    }
    throw new AppError(
      datos?.error?.message || 'YouTube no respondió.',
      502,
      'YOUTUBE_ERROR'
    );
  }
  return datos;
}

/** "PT3M33S" -> 213. Devuelve 0 si no se puede leer (directos, por ejemplo). */
function duracionASegundos(iso) {
  const m = /^P(?:(\d+)D)?T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso || '');
  if (!m) return 0;
  const [, d, h, min, s] = m.map((v) => Number(v || 0));
  return d * 86400 + h * 3600 + min * 60 + s;
}

const limpiarTitulo = (t) =>
  String(t || '')
    // Los titulos de YouTube vienen cargados de adornos: "(Official Video)",
    // "[4K]", "| Lyrics". En una fila que se lee de reojo estorban.
    .replace(/\s*[([][^)\]]*(official|video|audio|lyric|letra|hd|4k|mv)[^)\]]*[)\]]/gi, '')
    .replace(/\s*\|\s*.*(official|video|audio|lyric|letra)\s*$/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

/**
 * Convierte la respuesta de `videos.list` en lo que usa la app, dejando fuera
 * lo que no serviria: lo que no se puede incrustar (sonaria un cuadro negro),
 * lo bloqueado en el pais y lo que dura demasiado.
 */
function aCancion(v) {
  const duracionSeg = duracionASegundos(v.contentDetails?.duration);
  const region = v.contentDetails?.regionRestriction;
  const bloqueadoAqui =
    region?.blocked?.includes(env.youtube.region) ||
    (region?.allowed && !region.allowed.includes(env.youtube.region));

  if (v.status?.embeddable === false) return null;
  if (bloqueadoAqui) return null;
  // Duracion 0 = emision en directo: no termina nunca y colgaria la fila.
  if (!duracionSeg || duracionSeg > env.youtube.maxDuracionSeg) return null;

  return {
    videoId: v.id,
    titulo: limpiarTitulo(v.snippet.title),
    tituloOriginal: v.snippet.title,
    canal: v.snippet.channelTitle,
    duracionSeg,
    miniatura:
      v.snippet.thumbnails?.medium?.url ?? v.snippet.thumbnails?.default?.url ?? null,
  };
}

/**
 * Detalles de videos, de 50 en 50 (1 unidad por tanda). Es la llamada barata:
 * saber todo de 50 canciones cuesta lo mismo que la mitad de una busqueda.
 */
export async function detallesDe(ids) {
  const unicos = [...new Set(ids.filter(Boolean))];
  const canciones = [];
  for (let i = 0; i < unicos.length; i += 50) {
    const datos = await llamar('videos', {
      part: 'snippet,contentDetails,status',
      id: unicos.slice(i, i + 50).join(','),
      maxResults: '50',
    });
    canciones.push(...(datos.items ?? []).map(aCancion).filter(Boolean));
  }
  return canciones;
}

/** Los ids de video de una lista de reproduccion publica (1 unidad por pagina). */
export async function videosDeLista(listaId, maximo = 100) {
  const ids = [];
  let pagina;
  do {
    const datos = await llamar('playlistItems', {
      part: 'contentDetails',
      playlistId: listaId,
      maxResults: '50',
      ...(pagina ? { pageToken: pagina } : {}),
    });
    ids.push(...(datos.items ?? []).map((i) => i.contentDetails?.videoId).filter(Boolean));
    pagina = datos.nextPageToken;
  } while (pagina && ids.length < maximo);
  return ids.slice(0, maximo);
}

/**
 * Busca en todo YouTube.
 *
 * Son dos llamadas -search.list y videos.list- porque search.list no dice ni la
 * duracion ni si el video se puede incrustar, y ofrecer una cancion que despues
 * no suena es peor que no ofrecerla.
 */
export async function buscar(texto) {
  const q = String(texto || '').trim().slice(0, 100);
  if (q.length < 2) return [];

  const clave = `buscar:${q.toLowerCase()}`;
  const guardado = deCache(clave);
  if (guardado) return guardado;

  const datos = await llamar('search', {
    part: 'snippet',
    q,
    type: 'video',
    // Categoria 10 = musica. Evita que "bad bunny" traiga entrevistas.
    videoCategoryId: '10',
    videoEmbeddable: 'true',
    maxResults: '20',
    regionCode: env.youtube.region,
    relevanceLanguage: 'es',
  });

  const ids = (datos.items ?? []).map((i) => i.id?.videoId).filter(Boolean);
  const canciones = await detallesDe(ids);

  // 12 horas: una busqueda repetida el mismo dia no vuelve a gastar cuota, y al
  // dia siguiente se refresca por si salio algo nuevo.
  aCache(clave, canciones, 12 * 60);
  return canciones;
}

/**
 * Catalogo para ojear sin buscar, armado con las listas configuradas en
 * `YOUTUBE_LISTAS`. Cuesta 2 unidades por lista en vez de 101.
 */
export async function catalogo() {
  if (!env.youtube.listas.length) return [];

  const clave = 'catalogo';
  const guardado = deCache(clave);
  if (guardado) return guardado;

  const grupos = [];
  for (const listaId of env.youtube.listas.slice(0, 6)) {
    try {
      const ids = await videosDeLista(listaId, 30);
      const canciones = await detallesDe(ids);
      if (canciones.length) grupos.push({ id: listaId, canciones });
    } catch (e) {
      // Una lista que el dueño borró o volvió privada no puede tumbar el resto
      // del catálogo.
      if (e.codigo === 'YOUTUBE_SIN_CUOTA') throw e;
    }
  }

  aCache(clave, grupos, 6 * 60);
  return grupos;
}

/**
 * Lo mas popular en musica ahora mismo, en el pais del gimnasio.
 *
 * Es la lista que YouTube usa para su propia pantalla de Musica, y se actualiza
 * sola cuando ellos la actualizan. Cuesta 1 UNIDAD -no 100 como una busqueda-
 * porque `chart=mostPopular` no pasa por `search.list`.
 */
export async function populares(limite = 40) {
  const clave = `populares:${env.youtube.region}`;
  const guardado = deCache(clave);
  if (guardado) return guardado.slice(0, limite);

  const datos = await llamar('videos', {
    part: 'snippet,contentDetails,status',
    chart: 'mostPopular',
    // 10 = musica.
    videoCategoryId: '10',
    regionCode: env.youtube.region,
    maxResults: '50',
  });

  const canciones = (datos.items ?? []).map(aCancion).filter(Boolean);
  // Dos horas: lo bastante para no gastar llamadas y lo bastante poco para que
  // "lo del momento" siga siendo del momento.
  aCache(clave, canciones, 120);
  return canciones.slice(0, limite);
}

/**
 * Las canciones de las listas que configuro el gimnasio (`YOUTUBE_LISTAS`).
 *
 * Es la fuente que representa su gusto musical, y la mas barata: 1 unidad de
 * cuota por lista, cacheada 6 horas.
 */
export async function deListas() {
  const grupos = await catalogo().catch(() => []);
  return grupos.flatMap((g) => g.canciones);
}

/** Detalle de un video suelto, para cuando el cliente elige uno. */
export async function detalle(videoId) {
  const id = String(videoId || '').trim();
  if (!/^[\w-]{11}$/.test(id)) {
    throw new AppError('Ese video no existe.', 422, 'VIDEO_INVALIDO');
  }

  const clave = `video:${id}`;
  const guardado = deCache(clave);
  if (guardado) return guardado;

  const [cancion] = await detallesDe([id]);
  if (!cancion) {
    throw new AppError(
      'Esa canción no se puede reproducir aquí: el dueño no permite incrustarla, está bloqueada en Colombia o dura demasiado.',
      422,
      'VIDEO_NO_REPRODUCIBLE'
    );
  }

  aCache(clave, cancion, 24 * 60);
  return cancion;
}
