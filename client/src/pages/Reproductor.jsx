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
 * queda abierta todo el día. Los teléfonos de los clientes NO reproducen nada:
 * solo mandan canciones a la fila. Por eso "si ya hay una sonando, espera a que
 * termine" funciona: hay un solo sitio donde suena.
 *
 * TRES COSAS QUE MANDAN EN EL DISEÑO:
 *
 * 1. El navegador no deja arrancar audio sin que alguien haya tocado la
 *    pantalla. No hay forma de saltárselo, así que en vez de fallar en silencio
 *    la pantalla arranca con un botón grande de "Empezar" que se toca una vez
 *    al abrir el gimnasio. De ahí en adelante encadena sola.
 *
 * 2. Se toma la clase que se está dictando en ese momento; el servidor la
 *    resuelve. Así no hay que reconfigurar la pantalla a cada hora.
 *
 * 3. Cuando la fila se vacía, NO se para la música. Se deja que YouTube siga
 *    solo con su mezcla a partir de la última canción, que es lo más parecido a
 *    "lo que YouTube sugiere". Si esa mezcla tampoco arranca, entran las
 *    canciones de la casa.
 */
export default function Reproductor() {
  const queryClient = useQueryClient();
  const esAdmin = Boolean(leerToken('admin'));

  const contenedor = useRef(null);
  const reproductor = useRef(null);
  // El id que está puesto AHORA en el iframe. Sirve para no recargar el mismo
  // video cada vez que el sondeo trae el mismo estado.
  const puesto = useRef(null);
  const avanzando = useRef(false);

  const [arrancado, setArrancado] = useState(false);
  const [listo, setListo] = useState(false);
  const [error, setError] = useState(null);
  const [enMezcla, setEnMezcla] = useState(false);

  const { data } = useQuery({
    queryKey: ['musicaAhora'],
    queryFn: () => api.musicaAhora(),
    refetchInterval: 10_000,
    // La pantalla del gimnasio pasa el día sin que nadie la toque.
    refetchIntervalInBackground: true,
  });

  const refrescar = useCallback(
    () => queryClient.invalidateQueries({ queryKey: ['musicaAhora'] }),
    [queryClient]
  );

  /**
   * Pide la siguiente al servidor y la pone.
   *
   * Si no queda nada pedido, se deja correr la mezcla de YouTube en vez de
   * cortar el sonido: un gimnasio en silencio es peor que una canción que nadie
   * eligió.
   */
  const siguiente = useCallback(async () => {
    if (avanzando.current) return;
    avanzando.current = true;
    try {
      const { sonando } = await api.admin.siguienteCancion();
      refrescar();

      if (sonando?.cancion.videoId) {
        setEnMezcla(false);
        puesto.current = sonando.cancion.videoId;
        reproductor.current?.loadVideoById(sonando.cancion.videoId);
        return;
      }

      // Fila vacía. `RD<videoId>` es la mezcla que YouTube arma alrededor de un
      // video: es lo más cercano a "que siga sugiriendo" que expone el
      // reproductor incrustado.
      const ultima = puesto.current;
      if (ultima && !enMezcla) {
        setEnMezcla(true);
        reproductor.current?.loadPlaylist({ list: `RD${ultima}`, listType: 'playlist' });
        return;
      }

      // Ni pedidos ni mezcla: las de la casa.
      if (!enMezcla) {
        const casa = await api.cancionesDeLaCasa();
        const conVideo = casa.filter((c) => c.videoId);
        if (conVideo.length) {
          const elegida = conVideo[Math.floor(Math.random() * conVideo.length)];
          puesto.current = elegida.videoId;
          reproductor.current?.loadVideoById(elegida.videoId);
        }
      }
    } catch (e) {
      setError(e.message);
    } finally {
      avanzando.current = false;
    }
  }, [refrescar, enMezcla]);

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
              siguiente();
            },
            onStateChange: (e) => {
              // 0 = terminó. Es el único punto donde la fila avanza sola.
              if (e.data === 0) siguiente();
            },
            onError: () => {
              // Un video que falla no puede congelar la pantalla: se salta.
              setError('Esa canción no se pudo reproducir; va la siguiente.');
              siguiente();
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
    // `siguiente` cambia con `enMezcla`, pero el reproductor debe montarse una
    // sola vez: los callbacks leen la versión viva a través de las refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [arrancado]);

  /**
   * Si alguien pide una canción y no hay nada puesto (o estamos rellenando con
   * la mezcla), se atiende sin esperar a que termine lo que sonaba.
   */
  useEffect(() => {
    if (!listo) return;
    const hayPedidos = (data?.fila?.length ?? 0) > 0;
    if (hayPedidos && (enMezcla || !data?.sonando)) siguiente();
  }, [data, listo, enMezcla, siguiente]);

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
            {data?.clase
              ? `${data.clase.tipoClase} · en curso`
              : 'Sin clase en curso'}
          </p>
          <h1 className="text-lg font-extrabold tracking-tightest truncate">
            {sonando?.cancion.titulo ?? (enMezcla ? 'Mezcla de YouTube' : 'Reproductor')}
          </h1>
        </div>
        {arrancado && (
          <Boton variante="secundario" onClick={siguiente} className="shrink-0 min-h-[44px] px-4">
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
                  {enMezcla
                    ? 'Sonando la mezcla que YouTube arma con la última canción.'
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
