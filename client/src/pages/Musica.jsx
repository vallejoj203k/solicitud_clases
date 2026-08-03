import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client.js';
import { Aviso, Cargando, Entrada, cx } from '../components/ui.jsx';
import {
  IconoAtras,
  IconoBuscar,
  IconoCheck,
  IconoCerrar,
  IconoMusica,
} from '../components/Iconos.jsx';
import { duracion } from '../lib/youtube.js';

/**
 * Pide tu música.
 *
 * NO HACE FALTA RESERVA NI CUENTA. Quien está en el salón puede poner música,
 * haya reservado por la app o no: el gimnasio lo pidió así. Lo único que
 * identifica a quien pide es su navegador, y sirve para repartir los turnos y
 * para que cada quien pueda quitar lo suyo.
 *
 * De aquí no sale sonido: la canción entra a la cola y suena en la pantalla del
 * gimnasio, la que está conectada a los parlantes.
 *
 * LA BÚSQUEDA SE DISPARA AL ENVIAR, NO AL TECLEAR. Cada búsqueda gasta 100 de
 * las 10.000 unidades diarias que da la API de YouTube; buscar mientras se
 * escribe agotaría la cuota del gimnasio en una tarde.
 */
export default function Musica() {
  const queryClient = useQueryClient();
  const [texto, setTexto] = useState('');
  const [consulta, setConsulta] = useState('');
  const [error, setError] = useState(null);
  const [pidiendo, setPidiendo] = useState(null);
  const entrada = useRef(null);

  const { data: estado } = useQuery({
    queryKey: ['musicaAhora'],
    queryFn: api.musicaAhora,
    refetchInterval: 15_000,
  });

  // Lo más escuchado ahora mismo, que es con lo que abre la pantalla. Sale del
  // ranking de música de YouTube para Colombia, así que cambia cuando ellos lo
  // cambian; y cuesta 1 unidad de cuota, no 100 como una búsqueda.
  const { data: populares, isLoading: cargandoPopulares } = useQuery({
    queryKey: ['popularesMusica'],
    queryFn: api.popularesMusica,
    staleTime: 30 * 60_000,
  });

  const { data: catalogo } = useQuery({
    queryKey: ['catalogoMusica'],
    queryFn: api.catalogoMusica,
    staleTime: 30 * 60_000,
  });

  const {
    data: resultados,
    isFetching: buscando,
    error: errorBusqueda,
  } = useQuery({
    queryKey: ['buscarMusica', consulta],
    queryFn: () => api.buscarMusica(consulta),
    enabled: consulta.length >= 2,
    staleTime: 30 * 60_000,
    retry: false,
  });

  const refrescar = () => queryClient.invalidateQueries({ queryKey: ['musicaAhora'] });

  const pedir = useMutation({
    mutationFn: (videoId) => api.pedirCancion({ videoId }),
    onMutate: (videoId) => setPidiendo(videoId),
    onSuccess: () => {
      setError(null);
      refrescar();
    },
    onError: (e) => setError(e.message),
    onSettled: () => setPidiendo(null),
  });

  const quitar = useMutation({
    mutationFn: (pedidoId) => api.quitarPedido(pedidoId),
    onSuccess: refrescar,
    onError: (e) => setError(e.message),
  });

  const sonando = estado?.sonando ?? null;
  const cola = estado?.fila ?? [];
  // Lo que ya está en la cola no se vuelve a ofrecer.
  const yaEnCola = new Set([sonando, ...cola].filter(Boolean).map((p) => p.cancion.videoId));

  // Primero lo popular; las listas del gimnasio y las de la casa completan.
  const paraEmpezar = [
    ...(populares ?? []),
    ...(catalogo?.grupos ?? []).flatMap((g) => g.canciones),
    ...(catalogo?.deLaCasa ?? []),
  ];
  const mostrando = consulta.length >= 2 ? resultados : paraEmpezar;

  return (
    <div className="min-h-dvh pb-16">
      <header className="px-5 pt-6 pb-4 flex items-center gap-3">
        <Link
          to="/"
          aria-label="Volver"
          className="p-2 -ml-2 rounded-xl text-humo-300 hover:bg-carbon-700 active:scale-95"
        >
          <IconoAtras />
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-extrabold tracking-tightest">Pide tu música</h1>
          <p className="text-xs text-humo-500">Suena en los parlantes del salón.</p>
        </div>
      </header>

      <main className="px-5 space-y-5">
        {sonando && (
          <div className="tarjeta p-3 flex items-center gap-3">
            {sonando.cancion.miniatura ? (
              <img
                src={sonando.cancion.miniatura}
                alt=""
                className="w-16 h-12 rounded-xl object-cover shrink-0"
              />
            ) : (
              <span className="w-16 h-12 rounded-xl bg-carbon-700 flex items-center justify-center shrink-0">
                <IconoMusica className="w-5 h-5 text-humo-500" />
              </span>
            )}
            <div className="min-w-0 flex-1">
              <p className="etiqueta text-volt-500">Sonando ahora</p>
              <p className="font-bold truncate">{sonando.cancion.titulo}</p>
              <p className="text-xs text-humo-500 truncate">
                {sonando.cancion.canal ?? sonando.cancion.artista}
              </p>
            </div>
          </div>
        )}

        {error && <Aviso>{error}</Aviso>}

        {cola.length > 0 && (
          <div>
            <p className="etiqueta mb-2">En la cola ({cola.length})</p>
            <ul className="space-y-1.5">
              {cola.map((p, i) => (
                <li
                  key={p.id}
                  className="flex items-center gap-3 rounded-2xl border border-carbon-600 bg-carbon-700 px-3 py-2"
                >
                  <span className="w-5 text-center text-xs font-bold text-humo-500 tabular-nums">
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold truncate text-sm">{p.cancion.titulo}</p>
                    <p className="text-xs text-humo-500 truncate">
                      {p.cancion.canal ?? p.cancion.artista ?? 'YouTube'}
                      {p.pidio?.nombre ? ` · pidió ${p.pidio.nombre}` : ''}
                    </p>
                  </div>
                  {/* Quitar solo funciona con lo propio; lo comprueba el servidor. */}
                  <button
                    onClick={() => quitar.mutate(p.id)}
                    aria-label={`Quitar ${p.cancion.titulo}`}
                    className="p-1.5 rounded-lg text-humo-500 hover:text-alerta"
                  >
                    <IconoCerrar className="w-4 h-4" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
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
              autoCorrect="off"
              enterKeyHint="search"
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

        {errorBusqueda && <Aviso tono="info">{errorBusqueda.message}</Aviso>}

        <div>
          <p className="etiqueta mb-2">
            {consulta.length >= 2 ? `Resultados de "${consulta}"` : 'Populares ahora'}
          </p>

          <div className="space-y-1.5">
            {(buscando || cargandoPopulares) && !mostrando?.length && <Cargando texto="Buscando…" />}

            {!buscando && mostrando?.length === 0 && (
              <p className="py-6 text-center text-sm text-humo-500">
                {consulta
                  ? 'No encontramos nada con ese nombre.'
                  : 'Busca una canción en YouTube para empezar.'}
              </p>
            )}

            {(mostrando ?? []).map((c) => {
              const puesta = yaEnCola.has(c.videoId);
              return (
                <button
                  key={c.videoId ?? c.id}
                  disabled={puesta || pidiendo === c.videoId}
                  onClick={() => {
                    setError(null);
                    pedir.mutate(c.videoId);
                  }}
                  className={cx(
                    'w-full flex items-center gap-3 rounded-2xl border px-3 py-2 text-left transition-colors',
                    puesta
                      ? 'border-carbon-700 bg-carbon-800/60 cursor-default'
                      : 'border-carbon-600 bg-carbon-700 hover:border-carbon-500 active:scale-[.99]'
                  )}
                >
                  {c.miniatura ? (
                    <img
                      src={c.miniatura}
                      alt=""
                      className="w-16 h-12 rounded-xl object-cover shrink-0"
                    />
                  ) : (
                    <span className="w-16 h-12 rounded-xl bg-carbon-600 flex items-center justify-center shrink-0">
                      <IconoMusica className="w-4 h-4 text-humo-500" />
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold truncate text-sm">{c.titulo}</p>
                    <p className="text-xs text-humo-500 truncate">
                      {c.canal ?? c.artista ?? 'YouTube'}
                      {c.duracionSeg ? ` · ${duracion(c.duracionSeg)}` : ''}
                    </p>
                  </div>
                  {puesta ? (
                    <IconoCheck className="w-4 h-4 shrink-0 text-volt-500" />
                  ) : (
                    <span className="text-xs font-bold shrink-0 text-volt-500">
                      {pidiendo === c.videoId ? '…' : 'Pedir'}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </main>
    </div>
  );
}
