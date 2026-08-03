import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client.js';
import { Aviso, Boton, Cargando, Entrada, cx } from '../components/ui.jsx';
import { IconoAtras, IconoBuscar, IconoCerrar, IconoMusica } from '../components/Iconos.jsx';
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
 *   2. de ahí en adelante encadena sola CON LA MÚSICA DEL GIMNASIO: lo que hay
 *      en /admin/musica, no lo que a YouTube le parezca,
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
 * ahora sale de `/admin/musica/sugeridas`, que reparte el catálogo del gimnasio
 * y devuelve solo cosas ya comprobadas como incrustables.
 *
 * QUIÉN DECIDE QUE LA FILA AVANCE. Solo dos cosas, las dos explícitas: la
 * canción terminó, o falló. El sondeo del estado NO decide nada: solo pinta la
 * cola. Cuando sí decidía, traía una foto de hace diez segundos y adelantaba la
 * fila de más, y las canciones se saltaban sin sonar.
 */

// Cuántas canciones recordar para variar un poco. NO es una prohibición de
// repetir: es la lista que se manda como preferencia, y el servidor la afloja
// solo si con ella no le sale nada. Se bajó de 120 a 20 justamente para eso:
// con una lista propia de treinta canciones, recordar ciento veinte significaba
// excluirla entera y andar siempre por el camino de emergencia.
const MAX_RECORDADAS = 20;

// Estados del reproductor de YouTube que importan aquí.
const TERMINADO = 0;
const EN_COLA = 5;
const SIN_EMPEZAR = -1;

// Errores del reproductor incrustado que NO se arreglan reintentando: el vídeo
// ya no existe (100) o su dueño no deja ponerlo fuera de YouTube (101 y 150,
// que son el mismo caso). Con estos la canción se marca para no volver a
// proponerla; con cualquier otro se pasa a la siguiente y ya.
const ERRORES_DEFINITIVOS = [100, 101, 150];

export default function Reproductor() {
  const queryClient = useQueryClient();
  const esAdmin = Boolean(leerToken('admin'));

  const contenedor = useRef(null);
  const reproductor = useRef(null);
  const avanzando = useRef(false);
  // Todo lo que ya sonó, en orden y ACOTADO. El tope importa: si la lista
  // creciera sin freno acabaría excluyendo el catálogo entero y las
  // sugerencias volverían vacías.
  const reproducidas = useRef([]);
  const reintento = useRef(null);
  const apartando = useRef(false);
  // Lo que está esperando en la cola. La automática también lo tiene que
  // esquivar: proponer algo que ya está pedido lo haría sonar dos veces.
  const enCola = useRef([]);

  const [semilla, setSemilla] = useState(null);
  const [error, setError] = useState(null);
  // Aviso propio para las canciones que YouTube rechaza. NO comparte estado con
  // `error` porque poner la siguiente canción lo limpia, y entonces el aviso se
  // borraba en el mismo instante en que aparecía: nadie llegaba a leerlo.
  const [descartada, setDescartada] = useState(null);
  const [automatica, setAutomatica] = useState(null);
  // Las recomendaciones que se enseñan en el panel. La primera es la que sonará
  // sola cuando termine lo de ahora; las demás están para que quien atiende la
  // pantalla pueda escoger otra y no acabe oyendo el mismo artista una hora.
  // Se piden por adelantado: así se pueden enseñar y el cambio de canción no
  // tiene que esperar a la red.
  const [sugeridas, setSugeridas] = useState([]);
  const sugeridasRef = useRef([]);
  // Buscador del panel: para cuando ni las sugerencias ni los pedidos sirven y
  // quien atiende la pantalla quiere poner algo concreto.
  const [texto, setTexto] = useState('');
  const [consulta, setConsulta] = useState('');
  const entradaPanel = useRef(null);

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

  const { data: resultados, isFetching: buscando } = useQuery({
    queryKey: ['adminBuscarYoutube', consulta],
    queryFn: () => api.admin.buscarEnYoutube(consulta),
    enabled: consulta.length >= 2,
    staleTime: 30 * 60_000,
    retry: false,
  });

  /** Pone un vídeo y se asegura de que arranque. */
  const cargar = useCallback((videoId) => {
    reproducidas.current = [...reproducidas.current.filter((v) => v !== videoId), videoId].slice(
      -MAX_RECORDADAS
    );
    reproductor.current?.loadVideoById(videoId);
    // `loadVideoById` normalmente reproduce solo, pero si el navegador lo deja
    // en cola la pantalla se quedaría muda sin que nadie se entere.
    setTimeout(() => {
      const estado = reproductor.current?.getPlayerState?.();
      if (estado === EN_COLA || estado === SIN_EMPEZAR) reproductor.current?.playVideo?.();
    }, 2000);
  }, []);

  /**
   * Aparta la siguiente recomendación sin ponerla todavía.
   *
   * Se pide en cuanto arranca una canción, por dos motivos: el panel de la
   * derecha puede enseñar qué viene, y cuando la canción termina el cambio es
   * inmediato en vez de esperar a que responda la red.
   */
  const apartarProxima = useCallback(async () => {
    // Dos peticiones a la vez se pisarían: la que responde segunda gana aunque
    // se haya calculado con datos más viejos.
    if (apartando.current) return;
    apartando.current = true;
    try {
      const lista = await api.admin
        // Se excluye lo ya sonado Y lo que está esperando en la cola: si no, la
        // automática proponía justo la canción que un cliente acababa de pedir y
        // sonaba dos veces seguidas.
        .sugeridas([...reproducidas.current, ...enCola.current], 12)
        .catch(() => []);

      if (lista?.length) {
        sugeridasRef.current = lista;
        setSugeridas(lista);
        return;
      }

      // Sin sugerencias, la red de seguridad son las canciones de la casa.
      const casa = await api.cancionesDeLaCasa().catch(() => []);
      const libres = casa.filter((c) => c.videoId && !reproducidas.current.includes(c.videoId));
      if (libres.length) {
        sugeridasRef.current = libres;
        setSugeridas(libres);
      }
      // Si tampoco hay, NO se pisa lo que ya había: una lista buena vale más
      // que una vacía recién traída.
    } finally {
      apartando.current = false;
    }
  }, []);

  /** Pone una canción concreta y deja lista la siguiente tanda. */
  const ponerSugerida = useCallback(
    (cancion) => {
      if (!cancion?.videoId) return;
      sugeridasRef.current = sugeridasRef.current.filter((c) => c.videoId !== cancion.videoId);
      setSugeridas(sugeridasRef.current);
      setAutomatica(cancion);
      setError(null);
      cargar(cancion.videoId);
      // Se rellena la lista para la próxima vez.
      apartarProxima();
    },
    [cargar, apartarProxima]
  );

  /**
   * Pone la siguiente automática. NUNCA DEJA LA PANTALLA EN SILENCIO.
   *
   * El servidor ya baja por su propia escalera de respaldos y casi nunca
   * devuelve vacío. Si aun así no hay nada -no hay internet, o el gimnasio
   * acaba de estrenar la app y no tiene ni una canción guardada- se vuelve a
   * poner algo de lo que ya sonó antes que callar, y se sigue reintentando por
   * detrás. Un salón en silencio es peor que una canción repetida.
   */
  const ponerAutomatica = useCallback(async () => {
    // Se intenta dos veces: la primera puede toparse con una petición en vuelo
    // que aún no ha dejado la lista puesta.
    for (let i = 0; i < 2 && !sugeridasRef.current.length; i += 1) {
      await apartarProxima();
      if (!sugeridasRef.current.length) await new Promise((r) => setTimeout(r, 400));
    }
    const elegida = sugeridasRef.current[0];

    if (elegida?.videoId) {
      ponerSugerida(elegida);
      return;
    }

    // Última red: repetir lo más antiguo de la sesión, que es lo que menos
    // fresco suena.
    const vieja = reproducidas.current[0];
    if (vieja) {
      setAutomatica(null);
      setError('Sin conexión con el servidor: repitiendo mientras vuelve.');
      cargar(vieja);
    } else {
      setError('Busca una canción arriba para arrancar.');
    }

    // Se sigue intentando por detrás para retomar en cuanto se pueda.
    clearTimeout(reintento.current);
    reintento.current = setTimeout(() => apartarProxima(), 20_000);
  }, [apartarProxima, ponerSugerida, cargar]);

  /**
   * YouTube se negó a poner el vídeo.
   *
   * Si el motivo es definitivo -no existe, o el dueño no deja incrustarlo- se
   * avisa al servidor para que esa canción no se vuelva a proponer nunca. Es la
   * única forma de saberlo: la API de datos dice que se deja incrustar y luego
   * el reproductor la rechaza, y pasa justo con lo más conocido (los sellos
   * grandes bloquean sus vídeos fuera de YouTube).
   */
  const fallo = useCallback(async (codigo) => {
    const video = reproducidas.current[reproducidas.current.length - 1];
    if (!ERRORES_DEFINITIVOS.includes(codigo) || !video) return;

    const { titulo } = await api.admin.noSuena(video).catch(() => ({}));
    setDescartada(titulo || 'Esa canción');
    // Se cae de las sugerencias apartadas por si estaba en la tanda.
    sugeridasRef.current = sugeridasRef.current.filter((c) => c.videoId !== video);
    setSugeridas(sugeridasRef.current);
    refrescar();
  }, [refrescar]);

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
        // La recomendación apartada sigue valiendo para cuando la cola se vacíe.
        return;
      }
      await ponerAutomatica();
    } finally {
      avanzando.current = false;
    }
  }, [refrescar, cargar, ponerAutomatica]);

  // La cola se refleja en una ref para que las funciones de arriba la vean sin
  // tener que rehacerse en cada sondeo.
  useEffect(() => {
    // Lo que el servidor da por sonado se suma a lo que no debe repetirse.
    // Importa al recargar la pantalla a media sesión: sin esto, el reproductor
    // no sabría qué sonó antes de abrirla y volvería a ponerlo.
    for (const id of data?.reproducidas ?? []) {
      if (!reproducidas.current.includes(id)) reproducidas.current.push(id);
    }
    reproducidas.current = reproducidas.current.slice(-MAX_RECORDADAS);

    enCola.current = [
      ...(data?.fila ?? []).map((p) => p.cancion.videoId),
      data?.sonando?.cancion.videoId,
    ].filter(Boolean);
  }, [data]);

  // La pantalla pasa el día sin que nadie la toque: el aviso se retira solo
  // para no quedarse ahí hasta mañana.
  useEffect(() => {
    if (!descartada) return undefined;
    const t = setTimeout(() => setDescartada(null), 60_000);
    return () => clearTimeout(t);
  }, [descartada]);

  // Los callbacks de YouTube se registran una sola vez al montar, así que leen
  // la versión viva a través de una ref en vez de capturarla.
  const refAvanzar = useRef(avanzar);
  const refApartar = useRef(apartarProxima);
  const refFallo = useRef(fallo);
  useEffect(() => {
    refAvanzar.current = avanzar;
    refApartar.current = apartarProxima;
    refFallo.current = fallo;
  }, [avanzar, apartarProxima, fallo]);

  // --- Montaje del reproductor ---------------------------------------------
  useEffect(() => {
    if (!semilla) return undefined;
    let vivo = true;

    cargarApiYoutube()
      .then((YT) => {
        if (!vivo || !contenedor.current) return;
        reproducidas.current = [semilla.videoId];

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
            onReady: () => {
              // Con la primera ya sonando se busca qué viene, para poder
              // enseñarlo en el panel desde el minuto uno.
              refApartar.current();
            },
            onStateChange: (e) => {
              if (e.data === TERMINADO) refAvanzar.current();
            },
            onError: (e) => {
              // Un vídeo que falla no puede congelar la pantalla: se pasa al
              // siguiente pase lo que pase.
              refFallo.current(e?.data);
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

      {descartada && (
        <div className="shrink-0 px-5 pt-3">
          <Aviso tono="peligro">
            <strong>{descartada}</strong>: YouTube no la deja sonar fuera de su página, así que
            se saltó y ya no se va a proponer. Queda marcada en Música.{' '}
            <button
              onClick={() => setDescartada(null)}
              className="underline font-semibold"
            >
              Entendido
            </button>
          </Aviso>
        </div>
      )}

      <div className="flex-1 min-h-0 flex flex-col lg:flex-row">
        <div className="flex-1 min-h-0 bg-black">
          <div ref={contenedor} className="w-full h-full" />
        </div>

        <aside className="shrink-0 lg:w-[340px] border-t lg:border-t-0 lg:border-l border-carbon-700 overflow-y-auto max-h-[38vh] lg:max-h-none">
          <div className="p-4 space-y-4">
            {fila.length > 0 && (
              <div>
                <p className="etiqueta mb-2">Pedidas ({fila.length})</p>
                <ul className="space-y-2">
                  {fila.map((p, i) => (
                    <li
                      key={p.id}
                      className={cx(
                        'flex items-center gap-3 rounded-2xl border px-3 py-2',
                        i === 0
                          ? 'border-carbon-500 bg-carbon-700'
                          : 'border-carbon-600 bg-carbon-800'
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
                          {duracion(p.cancion.duracionSeg)}
                          {p.pidio?.nombre ? ` · ${p.pidio.nombre}` : ''}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Buscador. Va a TODO YouTube, no solo al catálogo: es la vía para
                poner algo que todavía no está en la lista del gimnasio sin
                tener que salir de la pantalla. */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                setConsulta(texto.trim());
                entradaPanel.current?.blur();
              }}
            >
              <div className="relative">
                <IconoBuscar className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-humo-500 pointer-events-none" />
                <Entrada
                  ref={entradaPanel}
                  value={texto}
                  onChange={(e) => setTexto(e.target.value)}
                  placeholder="Buscar y poner otra"
                  className="pl-9 pr-9 min-h-[44px] text-sm"
                  enterKeyHint="search"
                />
                {(texto || consulta) && (
                  <button
                    type="button"
                    aria-label="Limpiar búsqueda"
                    onClick={() => {
                      setTexto('');
                      setConsulta('');
                    }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-humo-500 hover:text-humo-100"
                  >
                    <IconoCerrar className="w-4 h-4" />
                  </button>
                )}
              </div>
            </form>

            {consulta.length >= 2 && (
              <div>
                <p className="etiqueta mb-2">Resultados</p>
                {buscando && !resultados && <Cargando texto="Buscando…" />}
                {resultados?.length === 0 && (
                  <p className="text-sm text-humo-500">Sin resultados.</p>
                )}
                <ul className="space-y-1.5">
                  {(resultados ?? []).map((c) => (
                    <li key={c.videoId}>
                      <button
                        onClick={() => {
                          ponerSugerida(c);
                          setTexto('');
                          setConsulta('');
                        }}
                        title="Poner esta ahora"
                        className="w-full flex items-center gap-3 rounded-2xl border border-carbon-600 bg-carbon-700 px-2.5 py-2 text-left hover:border-carbon-500 transition-colors"
                      >
                        {c.miniatura && (
                          <img
                            src={c.miniatura}
                            alt=""
                            className="w-14 h-10 rounded-lg object-cover shrink-0"
                          />
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold truncate leading-tight">{c.titulo}</p>
                          <p className="text-[11px] text-humo-500 truncate">
                            {c.canal} · {duracion(c.duracionSeg)}
                          </p>
                        </div>
                        <span className="text-[10px] font-bold text-volt-500 shrink-0">PONER</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Lo que viene del catálogo del gimnasio. Se enseñan siempre, no
                solo cuando la cola está vacía: sirven para escoger otra cosa y
                no acabar oyendo el mismo artista una hora seguida. Se ocultan
                mientras hay una búsqueda a la vista, para no amontonar dos
                listas. */}
            <div className={consulta.length >= 2 ? 'hidden' : undefined}>
              <p className="etiqueta mb-2">
                {fila.length > 0 ? 'Y después, del gimnasio' : 'De la lista del gimnasio'}
              </p>

              {sugeridas.length === 0 ? (
                <p className="text-sm text-humo-500">Buscando qué poner…</p>
              ) : (
                <ul className="space-y-1.5">
                  {sugeridas.map((c, i) => (
                    <li key={c.videoId}>
                      <button
                        onClick={() => ponerSugerida(c)}
                        title="Poner esta ahora"
                        className={cx(
                          'w-full flex items-center gap-3 rounded-2xl border px-2.5 py-2 text-left transition-colors',
                          // La primera es la que sonará sola si nadie toca nada.
                          i === 0 && fila.length === 0
                            ? 'border-carbon-500 bg-carbon-700'
                            : 'border-transparent hover:border-carbon-600 hover:bg-carbon-800'
                        )}
                      >
                        {c.miniatura ? (
                          <img
                            src={c.miniatura}
                            alt=""
                            className="w-14 h-10 rounded-lg object-cover shrink-0"
                          />
                        ) : (
                          <span className="w-14 h-10 rounded-lg bg-carbon-700 flex items-center justify-center shrink-0">
                            <IconoMusica className="w-4 h-4 text-humo-500" />
                          </span>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold truncate leading-tight">
                            {c.titulo}
                          </p>
                          <p className="text-[11px] text-humo-500 truncate">
                            {c.canal ?? c.artista ?? 'YouTube'}
                            {c.duracionSeg ? ` · ${duracion(c.duracionSeg)}` : ''}
                          </p>
                        </div>
                        {i === 0 && fila.length === 0 && (
                          <span className="text-[10px] font-bold text-volt-500 shrink-0">
                            SIGUE
                          </span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {fila.length === 0 && (
              <p className="text-xs text-humo-500">
                Nadie ha pedido nada: sigue sonando sola. Toca cualquiera de arriba para
                ponerla ya.
              </p>
            )}
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
