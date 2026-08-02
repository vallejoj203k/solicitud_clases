import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client.js';
import { Aviso, Boton, cx } from '../components/ui.jsx';
import { IconoAtras, IconoMusica } from '../components/Iconos.jsx';
import { leerToken } from '../lib/sesion.js';
import { cargarApiYoutube, duracion } from '../lib/youtube.js';

/**
 * La pantalla que suena.
 *
 * Va en el televisor o la tablet del gimnasio, conectada a los parlantes, y se
 * queda abierta todo el día sin que nadie la toque. Los teléfonos de los
 * clientes no reproducen nada: solo mandan canciones a la fila.
 *
 * LA REGLA ES SENCILLA Y NO TIENE EXCEPCIONES:
 *   - si hay algo en la fila, suena cuando termine lo que está puesto;
 *   - si no hay nada, sigue lo que YouTube encadene.
 *
 * QUIÉN DECIDE QUE LA FILA AVANCE. Solo tres cosas, todas explícitas:
 *   1. el reproductor está listo (primera canción),
 *   2. la canción terminó (o falló),
 *   3. estamos con relleno y entró un pedido.
 *
 * Lo que NO decide es el sondeo del estado. Antes sí, y ese era el error: la
 * consulta trae una foto de hace hasta diez segundos, así que justo después de
 * poner una canción el sondeo todavía decía "no hay nada sonando" y disparaba
 * un segundo avance. El servidor daba por sonada la que acababa de empezar y
 * saltaba a la siguiente. Por eso pedías dos canciones y solo sonaba una.
 *
 * De ahí que el modo viva en un `ref` y no en un estado: los callbacks del
 * reproductor de YouTube se registran UNA vez al montar, y con estado leerían
 * para siempre el valor que había en ese momento.
 */

// Estados del reproductor de YouTube que importan aquí.
const TERMINADO = 0;
const REPRODUCIENDO = 1;
const EN_COLA = 5;
const SIN_EMPEZAR = -1;

export default function Reproductor() {
  const queryClient = useQueryClient();
  const esAdmin = Boolean(leerToken('admin'));

  const contenedor = useRef(null);
  const reproductor = useRef(null);

  // 'pedidos' = suena algo que alguien pidió · 'relleno' = nadie pidió nada.
  const modo = useRef('parado');
  const avanzando = useRef(false);
  // Semilla de la mezcla de YouTube: el último vídeo que se puso.
  const ultimoVideo = useRef(null);
  // Si la mezcla no arranca -YouTube no siempre deja incrustarlas- se pasa a
  // las canciones de la casa y no se vuelve a intentar hasta la próxima pedida.
  const mezclaFallida = useRef(false);
  const rellenoEsCasa = useRef(false);
  const casa = useRef([]);
  const casaIdx = useRef(0);

  const [arrancado, setArrancado] = useState(false);
  const [listo, setListo] = useState(false);
  const [error, setError] = useState(null);
  const [vista, setVista] = useState('parado');

  const { data } = useQuery({
    queryKey: ['musicaAhora'],
    queryFn: () => api.musicaAhora(),
    refetchInterval: 10_000,
    // La pantalla del gimnasio pasa el día en segundo plano.
    refetchIntervalInBackground: true,
  });

  const refrescar = useCallback(
    () => queryClient.invalidateQueries({ queryKey: ['musicaAhora'] }),
    [queryClient]
  );

  const fijarModo = (m) => {
    modo.current = m;
    setVista(m);
  };

  /**
   * Carga un vídeo y se asegura de que empiece.
   *
   * `loadVideoById` normalmente reproduce solo, pero si el navegador lo deja en
   * cola la pantalla se quedaría muda sin que nadie se entere. El empujón a los
   * dos segundos cubre ese caso.
   */
  const cargar = useCallback((videoId) => {
    ultimoVideo.current = videoId;
    reproductor.current?.loadVideoById(videoId);
    setTimeout(() => {
      const estado = reproductor.current?.getPlayerState?.();
      if (estado === EN_COLA || estado === SIN_EMPEZAR) reproductor.current?.playVideo?.();
    }, 2000);
  }, []);

  /** Siguiente canción de la casa, en círculo. */
  const ponerDeLaCasa = useCallback(async () => {
    if (!casa.current.length) {
      const lista = await api.cancionesDeLaCasa().catch(() => []);
      casa.current = lista.filter((c) => c.videoId);
      casaIdx.current = 0;
    }
    if (!casa.current.length) {
      setError(
        'No hay pedidos ni canciones de la casa. Agrega algunas en Panel → Música para que la pantalla nunca se quede muda.'
      );
      return;
    }
    setError(null);
    rellenoEsCasa.current = true;
    const c = casa.current[casaIdx.current % casa.current.length];
    casaIdx.current += 1;
    cargar(c.videoId);
  }, [cargar]);

  /**
   * Nadie ha pedido nada: sigue la música sola.
   *
   * Primero la mezcla que YouTube arma alrededor de la última canción, que es
   * lo más cercano a "que YouTube siga sugiriendo" que expone el reproductor
   * incrustado. Si esa mezcla no arranca, las canciones de la casa.
   */
  const ponerRelleno = useCallback(async () => {
    fijarModo('relleno');
    if (ultimoVideo.current && !mezclaFallida.current) {
      rellenoEsCasa.current = false;
      reproductor.current?.loadPlaylist({
        list: `RD${ultimoVideo.current}`,
        listType: 'playlist',
      });
      return;
    }
    await ponerDeLaCasa();
  }, [ponerDeLaCasa]);

  /**
   * Pide la siguiente al servidor y la pone.
   *
   * `soloSiHayPedidos` sirve para el relleno: se pregunta si entró algo, pero
   * si no hay nada se deja seguir lo que esté sonando en vez de reiniciarlo.
   * Devuelve `true` si acabó poniendo un pedido.
   */
  const avanzar = useCallback(
    async ({ soloSiHayPedidos = false } = {}) => {
      if (avanzando.current) return false;
      avanzando.current = true;
      try {
        const { sonando } = await api.admin.siguienteCancion();
        refrescar();

        if (sonando?.cancion.videoId) {
          fijarModo('pedidos');
          // Semilla nueva: vuelve a valer la pena intentar la mezcla.
          mezclaFallida.current = false;
          rellenoEsCasa.current = false;
          setError(null);
          cargar(sonando.cancion.videoId);
          return true;
        }

        if (soloSiHayPedidos) return false;
        await ponerRelleno();
        return false;
      } catch (e) {
        setError(e.message);
        return false;
      } finally {
        avanzando.current = false;
      }
    },
    [refrescar, cargar, ponerRelleno]
  );

  /** Terminó lo que sonaba. */
  const alTerminar = useCallback(async () => {
    if (modo.current !== 'relleno') {
      await avanzar();
      return;
    }
    // En relleno: si entró un pedido se atiende; si no, que siga el relleno.
    const hubo = await avanzar({ soloSiHayPedidos: true });
    // Una lista de reproducción encadena sola; una canción suelta de la casa no.
    if (!hubo && rellenoEsCasa.current) await ponerDeLaCasa();
  }, [avanzar, ponerDeLaCasa]);

  // Los callbacks de YouTube se registran una vez, así que leen las refs y no
  // el estado. Estas guardan la versión viva de cada función.
  const refAlTerminar = useRef(alTerminar);
  const refAvanzar = useRef(avanzar);
  const refPonerDeLaCasa = useRef(ponerDeLaCasa);
  useEffect(() => {
    refAlTerminar.current = alTerminar;
    refAvanzar.current = avanzar;
    refPonerDeLaCasa.current = ponerDeLaCasa;
  }, [alTerminar, avanzar, ponerDeLaCasa]);

  // --- Montaje del reproductor ---------------------------------------------
  useEffect(() => {
    if (!arrancado) return undefined;
    let vivo = true;

    cargarApiYoutube()
      .then((YT) => {
        if (!vivo || !contenedor.current) return;
        reproductor.current = new YT.Player(contenedor.current, {
          playerVars: {
            autoplay: 1,
            controls: 1,
            rel: 0,
            modestbranding: 1,
            playsinline: 1,
          },
          events: {
            onReady: () => {
              setListo(true);
              refAvanzar.current();
            },
            onStateChange: (e) => {
              if (e.data === TERMINADO) refAlTerminar.current();
            },
            onError: () => {
              // Un vídeo que falla no puede congelar la pantalla.
              if (modo.current === 'relleno' && !rellenoEsCasa.current) {
                // La mezcla no se dejó incrustar: a las de la casa.
                mezclaFallida.current = true;
                refPonerDeLaCasa.current();
                return;
              }
              refAlTerminar.current();
            },
          },
        });
      })
      .catch((e) => setError(e.message));

    return () => {
      vivo = false;
      reproductor.current?.destroy?.();
      reproductor.current = null;
    };
  }, [arrancado]);

  /**
   * Entró un pedido mientras sonaba el relleno: se atiende sin esperar.
   *
   * Es el ÚNICO avance que dispara el sondeo, y va cerrado con llave al modo
   * relleno. Mientras suena algo pedido, esta consulta no puede tocarlo por
   * desfasada que venga.
   */
  useEffect(() => {
    if (!listo) return;
    if (modo.current !== 'relleno') return;
    if (!(data?.fila?.length > 0)) return;
    avanzar({ soloSiHayPedidos: true });
  }, [data, listo, avanzar]);

  if (!esAdmin) return <Navigate to="/admin/login" replace />;

  const sonando = data?.sonando ?? null;
  const fila = data?.fila ?? [];

  return (
    <div className="h-dvh flex flex-col bg-carbon-950 overflow-hidden">
      <header className="shrink-0 px-5 py-3 flex items-center gap-3 border-b border-carbon-700">
        <Link
          to="/admin"
          aria-label="Volver al panel"
          className="p-2 -ml-2 rounded-xl text-humo-500 hover:text-humo-100"
        >
          <IconoAtras />
        </Link>
        <div className="min-w-0 flex-1">
          <p className="etiqueta truncate">
            {data?.clase ? `${data.clase.tipoClase} · en curso` : 'Sin clase en curso'}
          </p>
          <h1 className="text-lg font-extrabold tracking-tightest truncate">
            {vista === 'relleno'
              ? rellenoEsCasa.current
                ? 'Música de la casa'
                : 'Mezcla de YouTube'
              : (sonando?.cancion.titulo ?? 'Reproductor')}
          </h1>
        </div>
        {arrancado && (
          <Boton
            variante="secundario"
            onClick={() => avanzar()}
            className="shrink-0 min-h-[44px] px-4"
          >
            Saltar
          </Boton>
        )}
      </header>

      {error && (
        <div className="shrink-0 px-5 pt-3">
          <Aviso tono="info">{error}</Aviso>
        </div>
      )}

      {!arrancado ? (
        // El navegador exige un gesto antes de dejar sonar nada. Se toca una vez
        // al abrir el gimnasio y la pantalla ya no se vuelve a tocar.
        <div className="flex-1 flex flex-col items-center justify-center gap-6 px-8 text-center">
          <span className="w-24 h-24 rounded-3xl bg-volt-500/15 text-volt-500 flex items-center justify-center">
            <IconoMusica className="w-12 h-12" />
          </span>
          <div>
            <h2 className="text-3xl font-extrabold tracking-tightest">Poner la música</h2>
            <p className="mt-2 text-humo-500 max-w-sm">
              Deja esta pantalla abierta y conectada a los parlantes. Suena lo que pidan los
              clientes y, cuando no haya pedidos, sigue sola.
            </p>
          </div>
          <Boton onClick={() => setArrancado(true)} className="px-10 text-lg">
            Empezar
          </Boton>
        </div>
      ) : (
        <div className="flex-1 min-h-0 flex flex-col lg:flex-row">
          <div className="flex-1 min-h-0 bg-black">
            <div ref={contenedor} className="w-full h-full" />
          </div>

          <aside className="shrink-0 lg:w-[340px] border-t lg:border-t-0 lg:border-l border-carbon-700 overflow-y-auto max-h-[38vh] lg:max-h-none">
            <div className="p-4">
              <p className="etiqueta mb-2">
                {fila.length > 0 ? `Siguen (${fila.length})` : 'Nadie ha pedido'}
              </p>

              {fila.length === 0 && (
                <p className="text-sm text-humo-500">
                  {vista === 'relleno'
                    ? 'Sigue sonando sola. En cuanto alguien pida algo, entra aquí.'
                    : 'En cuanto alguien pida algo, entra aquí.'}
                </p>
              )}

              <ul className="space-y-2">
                {fila.map((p, i) => (
                  <li
                    key={p.id}
                    className={cx(
                      'flex items-center gap-3 rounded-2xl border px-3 py-2',
                      i === 0 ? 'border-carbon-500 bg-carbon-700' : 'border-carbon-600 bg-carbon-800'
                    )}
                  >
                    <span className="w-6 text-center text-xs font-bold text-humo-500 tabular-nums">
                      {i + 1}
                    </span>
                    {p.cancion.miniatura && (
                      <img
                        src={p.cancion.miniatura}
                        alt=""
                        className="w-12 h-9 rounded-lg object-cover shrink-0"
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold truncate">{p.cancion.titulo}</p>
                      <p className="text-[11px] text-humo-500 truncate">
                        {duracion(p.cancion.duracionSeg)} · {p.pidio?.nombre ?? 'la casa'}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
