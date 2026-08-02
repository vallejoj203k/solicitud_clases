import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client.js';
import { Aviso, Boton, Cargando, Entrada, Hoja, Insignia, cx } from './ui.jsx';
import { IconoBuscar, IconoCheck, IconoCerrar } from './Iconos.jsx';

/**
 * El cliente pide canciones para su clase.
 *
 * La app NO reproduce nada: esto arma la lista que el instructor lee. Por eso
 * la pantalla habla de "pedir", no de "poner".
 *
 * Se busca contra el servidor mientras se escribe y solo bajan 20 resultados:
 * el catálogo del gimnasio puede crecer sin que la app pese más en el teléfono.
 */
export default function PedirMusica({ claseId, acento = '#C8F751', abierta, onCerrar }) {
  const queryClient = useQueryClient();
  const [q, setQ] = useState('');
  const [error, setError] = useState(null);

  const { data: fila } = useQuery({
    queryKey: ['musicaClase', claseId],
    queryFn: () => api.musicaDeClase(claseId),
    enabled: abierta,
  });

  const { data: canciones, isFetching } = useQuery({
    queryKey: ['canciones', q.trim()],
    queryFn: () => api.canciones(q.trim()),
    enabled: abierta,
    placeholderData: (anterior) => anterior,
  });

  const refrescar = () => queryClient.invalidateQueries({ queryKey: ['musicaClase', claseId] });

  const pedir = useMutation({
    mutationFn: (cancionId) => api.pedirCancion(claseId, cancionId),
    onSuccess: refrescar,
    onError: (e) => setError(e.message),
  });

  const quitar = useMutation({
    mutationFn: (pedidoId) => api.quitarPedido(pedidoId),
    onSuccess: refrescar,
    onError: (e) => setError(e.message),
  });

  const pedidos = fila?.pedidos ?? [];
  // Los ids que ya están en la fila, para no ofrecer dos veces la misma.
  const yaEnFila = new Set(pedidos.map((p) => p.cancion.id));

  return (
    <Hoja abierta={abierta} onCerrar={onCerrar} titulo="Pide tu música">
      <div className="space-y-4">
        <p className="text-sm text-humo-500">
          Elige del catálogo del gimnasio. Suena una de cada persona por ronda, así que puedes
          pedir varias sin quitarle el turno a nadie.
        </p>

        {error && <Aviso>{error}</Aviso>}

        {pedidos.length > 0 && (
          <div>
            <p className="etiqueta mb-2">En la fila ({pedidos.length})</p>
            <ul className="space-y-1.5">
              {pedidos.map((p, i) => (
                <li
                  key={p.id}
                  className={cx(
                    'flex items-center gap-3 rounded-2xl border px-3 py-2.5',
                    p.estado === 'SONO'
                      ? 'border-carbon-700 bg-carbon-800/60 opacity-60'
                      : 'border-carbon-600 bg-carbon-700'
                  )}
                >
                  <span className="w-6 text-center text-xs font-bold text-humo-500 tabular-nums">
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold truncate text-sm">{p.cancion.titulo}</p>
                    <p className="text-xs text-humo-500 truncate">
                      {p.cancion.artista ?? 'Sin artista'} · pidió {p.pidio.nombre}
                    </p>
                  </div>
                  {p.estado === 'SONO' ? (
                    <Insignia tono="exito">Sonó</Insignia>
                  ) : (
                    <button
                      onClick={() => quitar.mutate(p.id)}
                      aria-label={`Quitar ${p.cancion.titulo}`}
                      className="p-1.5 rounded-lg text-humo-500 hover:text-alerta"
                    >
                      <IconoCerrar className="w-4 h-4" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div>
          <div className="relative">
            <IconoBuscar className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-humo-500 pointer-events-none" />
            <Entrada
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setError(null);
              }}
              placeholder="Busca una canción o un artista"
              className="pl-12"
              autoCorrect="off"
            />
          </div>

          <div className="mt-3 space-y-1.5 max-h-[46vh] overflow-y-auto">
            {isFetching && !canciones && <Cargando texto="Buscando…" />}
            {canciones?.length === 0 && (
              <p className="py-6 text-center text-sm text-humo-500">
                No encontramos esa canción en el catálogo del gimnasio.
              </p>
            )}
            {(canciones ?? []).map((c) => {
              const puesta = yaEnFila.has(c.id);
              return (
                <button
                  key={c.id}
                  disabled={puesta || pedir.isPending}
                  onClick={() => {
                    setError(null);
                    pedir.mutate(c.id);
                  }}
                  className={cx(
                    'w-full flex items-center gap-3 rounded-2xl border px-3 py-2.5 text-left transition-colors',
                    puesta
                      ? 'border-carbon-700 bg-carbon-800/60 cursor-default'
                      : 'border-carbon-600 bg-carbon-700 hover:border-carbon-500 active:scale-[.99]'
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold truncate text-sm">{c.titulo}</p>
                    <p className="text-xs text-humo-500 truncate">{c.artista ?? 'Sin artista'}</p>
                  </div>
                  {puesta ? (
                    <IconoCheck className="w-4 h-4 shrink-0" style={{ color: acento }} />
                  ) : (
                    <span className="text-xs font-semibold shrink-0" style={{ color: acento }}>
                      Pedir
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
