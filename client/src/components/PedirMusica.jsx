import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client.js';
import { Aviso, Boton, Cargando, Entrada, Hoja, cx } from './ui.jsx';
import { IconoBuscar, IconoCheck, IconoCerrar, IconoMusica } from './Iconos.jsx';
import { duracion } from '../lib/youtube.js';

/**
 * El cliente elige música para su clase.
 *
 * De su teléfono NO sale sonido: la canción entra a la fila y suena en la
 * pantalla del gimnasio, la que está conectada a los parlantes. Por eso la hoja
 * habla de "pedir" y muestra qué está sonando y cuántas van antes.
 *
 * Se abre con un catálogo para ojear -listas de YouTube que configura el
 * gimnasio, más las canciones de la casa- y la búsqueda va a todo YouTube.
 *
 * LA BÚSQUEDA SE DISPARA AL ENVIAR, NO EN CADA TECLA. Cada búsqueda gasta 100
 * de las 10.000 unidades diarias que da la API de YouTube; buscar mientras se
 * escribe agotaría la cuota del gimnasio en una tarde.
 */
export default function PedirMusica({ claseId, acento = '#C8F751', abierta, onCerrar }) {
  const queryClient = useQueryClient();
  const [texto, setTexto] = useState('');
  const [consulta, setConsulta] = useState('');
  const [error, setError] = useState(null);
  const [pidiendo, setPidiendo] = useState(null);
  const entrada = useRef(null);

  const { data: estado } = useQuery({
    queryKey: ['musicaAhora', claseId],
    queryFn: () => api.musicaAhora(claseId),
    enabled: abierta && Boolean(claseId),
    refetchInterval: 15_000,
  });

  const { data: catalogo, isLoading: cargandoCatalogo } = useQuery({
    queryKey: ['catalogoMusica'],
    queryFn: api.catalogoMusica,
    enabled: abierta,
    staleTime: 30 * 60_000,
  });

  const {
    data: resultados,
    isFetching: buscando,
    error: errorBusqueda,
  } = useQuery({
    queryKey: ['buscarMusica', consulta],
    queryFn: () => api.buscarMusica(consulta),
    enabled: abierta && consulta.length >= 2,
    staleTime: 30 * 60_000,
    retry: false,
  });

  useEffect(() => {
    if (!abierta) {
      setTexto('');
      setConsulta('');
      setError(null);
    }
  }, [abierta]);

  const refrescar = () => {
    queryClient.invalidateQueries({ queryKey: ['musicaAhora'] });
  };

  const pedir = useMutation({
    mutationFn: (videoId) => api.pedirCancion(claseId, { videoId }),
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
  const fila = estado?.fila ?? [];
  // Lo que ya está pedido no se vuelve a ofrecer.
  const yaPedidas = new Set(
    [sonando, ...fila].filter(Boolean).map((p) => p.cancion.videoId)
  );

  const enviarBusqueda = (e) => {
    e.preventDefault();
    setError(null);
    setConsulta(texto.trim());
    entrada.current?.blur();
  };

  const listaDeCatalogo = [
    ...(catalogo?.grupos ?? []).flatMap((g) => g.canciones),
    ...(catalogo?.deLaCasa ?? []),
  ];

  const mostrando = consulta.length >= 2 ? resultados : listaDeCatalogo;

  return (
    <Hoja abierta={abierta} onCerrar={onCerrar} titulo="Pide tu música">
      <div className="space-y-4">
        {sonando && (
          <div className="rounded-2xl border border-carbon-600 bg-carbon-700 p-3 flex items-center gap-3">
            {sonando.cancion.miniatura ? (
              <img
                src={sonando.cancion.miniatura}
                alt=""
                className="w-14 h-10 rounded-lg object-cover shrink-0"
              />
            ) : (
              <span className="w-14 h-10 rounded-lg bg-carbon-600 flex items-center justify-center shrink-0">
                <IconoMusica className="w-4 h-4 text-humo-500" />
              </span>
            )}
            <div className="min-w-0 flex-1">
              <p className="etiqueta" style={{ color: acento }}>
                Sonando ahora
              </p>
              <p className="font-semibold text-sm truncate">{sonando.cancion.titulo}</p>
            </div>
          </div>
        )}

        <p className="text-sm text-humo-500">
          Suena en los parlantes del salón, no en tu teléfono. Si ya hay una sonando, la tuya
          entra a la fila. Suena una de cada persona por ronda, así que puedes pedir varias
          sin quitarle el turno a nadie.
        </p>

        {error && <Aviso>{error}</Aviso>}

        {fila.length > 0 && (
          <div>
            <p className="etiqueta mb-2">En la fila ({fila.length})</p>
            <ul className="space-y-1.5">
              {fila.map((p, i) => (
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
                      {p.cancion.artista ?? 'Sin artista'} · pidió {p.pidio?.nombre ?? 'la casa'}
                    </p>
                  </div>
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

        <form onSubmit={enviarBusqueda}>
          <div className="relative">
            <IconoBuscar className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-humo-500 pointer-events-none" />
            <Entrada
              ref={entrada}
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder="Busca en YouTube"
              className="pl-12 pr-20"
              autoCorrect="off"
              enterKeyHint="search"
            />
            <button
              type="submit"
              disabled={texto.trim().length < 2}
              className="absolute right-2 top-1/2 -translate-y-1/2 px-3 h-9 rounded-xl text-xs font-bold text-carbon-900 disabled:opacity-40"
              style={{ backgroundColor: acento }}
            >
              Buscar
            </button>
          </div>
        </form>

        {errorBusqueda && <Aviso tono="info">{errorBusqueda.message}</Aviso>}

        <div>
          <p className="etiqueta mb-2">
            {consulta.length >= 2 ? `Resultados de "${consulta}"` : 'Para empezar'}
          </p>

          <div className="space-y-1.5 max-h-[42vh] overflow-y-auto">
            {(buscando || cargandoCatalogo) && !mostrando?.length && <Cargando texto="Buscando…" />}

            {!buscando && mostrando?.length === 0 && (
              <p className="py-6 text-center text-sm text-humo-500">
                {consulta
                  ? 'No encontramos nada con ese nombre.'
                  : 'Busca una canción en YouTube para empezar.'}
              </p>
            )}

            {(mostrando ?? []).map((c) => {
              const puesta = yaPedidas.has(c.videoId);
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
                      className="w-14 h-10 rounded-lg object-cover shrink-0"
                    />
                  ) : (
                    <span className="w-14 h-10 rounded-lg bg-carbon-600 flex items-center justify-center shrink-0">
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
                    <IconoCheck className="w-4 h-4 shrink-0" style={{ color: acento }} />
                  ) : (
                    <span className="text-xs font-semibold shrink-0" style={{ color: acento }}>
                      {pidiendo === c.videoId ? '…' : 'Pedir'}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <Boton className="w-full" onClick={onCerrar} style={{ backgroundColor: acento }}>
          Listo
        </Boton>
      </div>
    </Hoja>
  );
}
