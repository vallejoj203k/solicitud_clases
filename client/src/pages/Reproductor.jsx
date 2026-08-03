import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client.js';
import { Aviso, Boton, Cargando, Entrada, cx } from '../components/ui.jsx';
import { IconoAtras, IconoBuscar, IconoMusica } from '../components/Iconos.jsx';
import { leerToken } from '../lib/sesion.js';
import { cargarApiYoutube, duracion } from '../lib/youtube.js';

/**
 * La pantalla que suena.
 *
 * Va en el televisor o la tablet del gimnasio, conectada a los parlantes, y se
 * queda abierta todo el día sin que nadie la toque.
 *
 * EL FLUJO ES ESTE:
 *   1. quien abre la pantalla elige la primera canción,
 *   2. de ahí en adelante encadena sola con lo que YouTube da por parecido,
 *   3. si un cliente pide algo, entra en cuanto termine la que está sonando,
 *   4. si hay varias pedidas, van una tras otra y después vuelve la automática.
 *
 * Elegir la primera a mano no es un capricho: los navegadores no dejan iniciar
 * audio sin un gesto de quien está delante, así que ese primer toque hace falta
 * de todos modos. Aprovecharlo para escoger la canción es mejor que un botón de
 * "empezar" que no elige nada.
 *
 * NO SE USAN LAS MEZCLAS "RD" DE YOUTUBE. Eran lo primero que probé -son
 * literalmente lo que YouTube encadena- pero el reproductor incrustado las
 * rechaza: salía "Se produjo un error" y la música se paraba. Lo que sigue
 * ahora sale de `/admin/musica/sugerida`, que busca a partir de lo que acaba de
 * sonar y devuelve algo ya comprobado como incrustable.
 *
 * QUIÉN DECIDE QUE LA FILA AVANCE. Solo dos cosas, las dos explícitas: la
 * canción terminó, o falló. El sondeo del estado NO decide nada: solo pinta la
 * cola. Cuando sí decidía, traía una foto de hace diez segundos y adelantaba la
 * fila de más, y las canciones se saltaban sin sonar.
 */

// Estados del reproductor de YouTube que importan aquí.
const TERMINADO = 0;
const EN_COLA = 5;
const SIN_EMPEZAR = -1;

export default function Reproductor() {
  const queryClient = useQueryClient();
  const esAdmin = Boolean(leerToken('admin'));

  const contenedor = useRef(null);
  const reproductor = useRef(null);
  const avanzando = useRef(false);
  // Lo último que se puso: es la semilla de la siguiente sugerencia.
  const ultimoVideo = useRef(null);
  // Todo lo que ya sonó, para no repetir nada en la misma sesión.
  const reproducidas = useRef(new Set());

  const [semilla, setSemilla] = useState(null);
  const [error, setError] = useState(null);
  const [automatica, setAutomatica] = useState(null);

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

  /** Pone un vídeo y se asegura de que arranque. */
  const cargar = useCallback((videoId) => {
    ultimoVideo.current = videoId;
    reproducidas.current.add(videoId);
    reproductor.current?.loadVideoById(videoId);
    // `loadVideoById` normalmente reproduce solo, pero si el navegador lo deja
    // en cola la pantalla se quedaría muda sin que nadie se entere.
    setTimeout(() => {
      const estado = reproductor.current?.getPlayerState?.();
      if (estado === EN_COLA || estado === SIN_EMPEZAR) reproductor.current?.playVideo?.();
    }, 2000);
  }, []);

  /**
   * Sigue sola: algo parecido a lo último que sonó y que no haya sonado ya.
   *
   * Si la sugerencia falla se tira de las canciones de la casa, y si tampoco
   * hay se dice en pantalla en vez de quedarse en silencio sin explicación.
   */
  const ponerAutomatica = useCallback(async () => {
    const sugerida = await api.admin
      .sugerida(ultimoVideo.current, [...reproducidas.current])
      .catch(() => null);

    if (sugerida?.videoId) {
      setAutomatica(sugerida);
      setError(null);
      cargar(sugerida.videoId);
      return;
    }

    const casa = await api.cancionesDeLaCasa().catch(() => []);
    const libre = casa.find((c) => c.videoId && !reproducidas.current.has(c.videoId));
    if (libre) {
      setAutomatica(libre);
      setError(null);
      cargar(libre.videoId);
      return;
    }

    setError(
      'No encontramos con qué seguir. Busca una canción arriba para retomar, o agrega canciones de la casa en Panel → Música.'
    );
  }, [cargar]);

  /**
   * Terminó lo que sonaba: primero lo pedido, si no, la automática.
   *
   * Este es el ÚNICO punto donde la fila avanza, y por eso una canción pedida
   * nunca se salta: solo se pide la siguiente cuando la anterior de verdad
   * terminó.
   */
  const avanzar = useCallback(async () => {
    if (avanzando.current) return;
    avanzando.current = true;
    try {
      const { sonando } = await api.admin.siguienteCancion().catch(() => ({ sonando: null }));
      refrescar();

      // LO PEDIDO SUENA SIEMPRE, aunque la automática ya lo hubiera puesto
      // antes: si alguien lo pidió, es porque lo quiere oír. El "no repetir"
      // vale para lo que elige la máquina, no para lo que elige una persona.
      if (sonando?.cancion.videoId) {
        setAutomatica(null);
        setError(null);
        cargar(sonando.cancion.videoId);
        return;
      }
      await ponerAutomatica();
    } finally {
      avanzando.current = false;
    }
  }, [refrescar, cargar, ponerAutomatica]);

  // Los callbacks de YouTube se registran una sola vez al montar, así que leen
  // la versión viva a través de una ref en vez de capturarla.
  const refAvanzar = useRef(avanzar);
  useEffect(() => {
    refAvanzar.current = avanzar;
  }, [avanzar]);

  // --- Montaje del reproductor ---------------------------------------------
  useEffect(() => {
    if (!semilla) return undefined;
    let vivo = true;

    cargarApiYoutube()
      .then((YT) => {
        if (!vivo || !contenedor.current) return;
        ultimoVideo.current = semilla.videoId;
        reproducidas.current.add(semilla.videoId);

        reproductor.current = new YT.Player(contenedor.current, {
          // El vídeo va en el constructor: crear el reproductor vacío hacía que
          // YouTube pintara su propio "Se produjo un error" antes de que
          // hubiera nada que poner.
          videoId: semilla.videoId,
          playerVars: {
            autoplay: 1,
            controls: 1,
            rel: 0,
            modestbranding: 1,
            playsinline: 1,
          },
          events: {
            onStateChange: (e) => {
              if (e.data === TERMINADO) refAvanzar.current();
            },
            onError: () => {
              // Un vídeo que falla no puede congelar la pantalla: se pasa al
              // siguiente. Ya quedó marcado como reproducido, así que la
              // sugerencia no lo va a proponer otra vez.
              refAvanzar.current();
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
  }, [semilla]);

  if (!esAdmin) return <Navigate to="/admin/login" replace />;

  const sonando = data?.sonando ?? null;
  const fila = data?.fila ?? [];
  const titulo = sonando?.cancion.titulo ?? automatica?.titulo ?? semilla?.titulo ?? 'Reproductor';

  if (!semilla) return <ElegirPrimera onElegir={setSemilla} />;

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
            {sonando ? `Pidió ${sonando.pidio?.nombre ?? 'la casa'}` : 'Automática'}
          </p>
          <h1 className="text-lg font-extrabold tracking-tightest truncate">{titulo}</h1>
        </div>
        <Boton
          variante="secundario"
          onClick={() => avanzar()}
          className="shrink-0 min-h-[44px] px-4"
        >
          Saltar
        </Boton>
      </header>

      {error && (
        <div className="shrink-0 px-5 pt-3">
          <Aviso tono="info">{error}</Aviso>
        </div>
      )}

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
                Sigue sonando sola. Lo que pidan los clientes entra aquí y suena en cuanto
                termine la de ahora.
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
    </div>
  );
}

/**
 * Elegir la primera canción.
 *
 * Es la puerta de entrada de la pantalla: el toque que hace falta para que el
 * navegador deje sonar el audio sirve además para escoger por dónde empieza.
 */
function ElegirPrimera({ onElegir }) {
  const [texto, setTexto] = useState('');
  const [consulta, setConsulta] = useState('');
  const entrada = useRef(null);

  const { data: resultados, isFetching, error } = useQuery({
    queryKey: ['adminBuscarYoutube', consulta],
    queryFn: () => api.admin.buscarEnYoutube(consulta),
    enabled: consulta.length >= 2,
    staleTime: 30 * 60_000,
    retry: false,
  });

  return (
    <div className="min-h-dvh flex flex-col">
      <header className="shrink-0 px-5 py-3 flex items-center gap-3 border-b border-carbon-700">
        <Link
          to="/admin"
          aria-label="Volver al panel"
          className="p-2 -ml-2 rounded-xl text-humo-500 hover:text-humo-100"
        >
          <IconoAtras />
        </Link>
        <h1 className="text-lg font-extrabold tracking-tightest">Reproductor</h1>
      </header>

      <div className="flex-1 px-5 py-8 max-w-2xl mx-auto w-full">
        <div className="text-center">
          <span className="inline-flex w-20 h-20 rounded-3xl bg-volt-500/15 text-volt-500 items-center justify-center">
            <IconoMusica className="w-10 h-10" />
          </span>
          <h2 className="mt-4 text-3xl font-extrabold tracking-tightest">
            Elige la primera canción
          </h2>
          <p className="mt-2 text-humo-500">
            De ahí en adelante sigue sola. Lo que pidan los clientes entra en cuanto termine la
            que esté sonando.
          </p>
        </div>

        <form
          className="mt-6"
          onSubmit={(e) => {
            e.preventDefault();
            setConsulta(texto.trim());
            entrada.current?.blur();
          }}
        >
          <div className="relative">
            <IconoBuscar className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-humo-500 pointer-events-none" />
            <Entrada
              ref={entrada}
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder="Busca en YouTube"
              className="pl-12 pr-24"
              autoFocus
            />
            <button
              type="submit"
              disabled={texto.trim().length < 2}
              className="absolute right-2 top-1/2 -translate-y-1/2 px-4 h-10 rounded-xl bg-volt-500 text-carbon-900 text-sm font-bold disabled:opacity-40"
            >
              Buscar
            </button>
          </div>
        </form>

        {error && (
          <div className="mt-4">
            <Aviso tono="info">{error.message}</Aviso>
          </div>
        )}

        <div className="mt-4 space-y-1.5">
          {isFetching && <Cargando texto="Buscando en YouTube…" />}
          {resultados?.length === 0 && (
            <p className="py-6 text-center text-sm text-humo-500">Sin resultados.</p>
          )}
          {(resultados ?? []).map((c) => (
            <button
              key={c.videoId}
              onClick={() => onElegir(c)}
              className="w-full flex items-center gap-3 rounded-2xl border border-carbon-600 bg-carbon-700 px-3 py-2 text-left hover:border-carbon-500 active:scale-[.99] transition-all"
            >
              {c.miniatura && (
                <img
                  src={c.miniatura}
                  alt=""
                  className="w-16 h-12 rounded-xl object-cover shrink-0"
                />
              )}
              <div className="min-w-0 flex-1">
                <p className="font-semibold truncate text-sm">{c.titulo}</p>
                <p className="text-xs text-humo-500 truncate">
                  {c.canal} · {duracion(c.duracionSeg)}
                </p>
              </div>
              <span className="text-xs font-bold shrink-0 text-volt-500">Poner</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
