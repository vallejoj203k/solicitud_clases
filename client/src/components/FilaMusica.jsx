import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client.js';
import { Aviso, Cargando, Insignia, Vacio, cx } from './ui.jsx';
import { IconoCerrar, IconoCheck, IconoMusica } from './Iconos.jsx';
import { useState } from 'react';

/**
 * La fila de música de una clase, como la ve el instructor.
 *
 * La app no reproduce nada: esto es el papelito de "qué va después". Se toca
 * "Sonó" cuando termina la canción que está puesta y la siguiente queda de
 * primera. Si nadie pidió nada, abajo quedan las canciones de la casa.
 *
 * El orden viene del servidor y es por rondas: primero la primera canción de
 * cada quien, después la segunda de cada quien. Así el que pide diez no tapa al
 * que pidió una.
 */
export default function FilaMusica({ acento = '#C8F751' }) {
  const queryClient = useQueryClient();
  const [error, setError] = useState(null);

  const { data, isLoading } = useQuery({
    queryKey: ['adminColaMusica'],
    queryFn: api.admin.colaMusica,
    refetchInterval: 20_000,
  });

  const refrescar = () => queryClient.invalidateQueries({ queryKey: ['adminColaMusica'] });

  const sono = useMutation({
    mutationFn: ({ id, valor }) => api.admin.marcarSono(id, valor),
    onSuccess: refrescar,
    onError: (e) => setError(e.message),
  });

  const quitar = useMutation({
    mutationFn: (id) => api.admin.quitarPedidoMusica(id),
    onSuccess: refrescar,
    onError: (e) => setError(e.message),
  });

  const pedidos = data ?? [];
  const sonando = pedidos.find((p) => p.estado === 'SONANDO') ?? null;
  const enFila = pedidos.filter((p) => p.estado === 'EN_FILA');
  const sonadas = pedidos.filter((p) => p.estado === 'SONO');
  const ocupado = sono.isPending || quitar.isPending;

  if (isLoading) return <Cargando texto="Cargando la fila…" />;

  return (
    <div className="space-y-4">
      {error && <Aviso>{error}</Aviso>}

      {/* Lo que el reproductor del gimnasio tiene puesto en este momento. */}
      {sonando && (
        <div
          className="rounded-2xl border p-3 flex items-center gap-3"
          style={{ borderColor: `${acento}55`, backgroundColor: `${acento}12` }}
        >
          {sonando.cancion.miniatura && (
            <img
              src={sonando.cancion.miniatura}
              alt=""
              className="w-16 h-12 rounded-xl object-cover shrink-0"
            />
          )}
          <div className="min-w-0 flex-1">
            <p className="etiqueta" style={{ color: acento }}>
              Sonando ahora
            </p>
            <p className="font-bold truncate">{sonando.cancion.titulo}</p>
            <p className="text-xs text-humo-500 truncate">
              pidió {sonando.pidio?.nombre ?? 'la casa'}
            </p>
          </div>
        </div>
      )}

      {enFila.length === 0 ? (
        <>
          <Vacio
            titulo="Nadie ha pedido música"
            descripcion="Pon las de la casa mientras llegan los pedidos."
          />
          <DeLaCasa />
        </>
      ) : (
        <div>
          <p className="etiqueta mb-2">Sigue ({enFila.length})</p>
          <ul className="space-y-2">
            {enFila.map((p, i) => (
              <li
                key={p.id}
                className={cx(
                  'flex items-center gap-3 rounded-2xl border px-3 py-2.5',
                  // La primera es la que va ahora: se resalta para leerla de un
                  // vistazo desde la tarima.
                  i === 0 ? 'border-carbon-500 bg-carbon-600' : 'border-carbon-600 bg-carbon-700'
                )}
              >
                <span
                  className="w-8 h-8 shrink-0 rounded-xl flex items-center justify-center text-xs font-extrabold tabular-nums"
                  style={
                    i === 0
                      ? { backgroundColor: acento, color: '#0F1115' }
                      : { backgroundColor: 'rgba(255,255,255,.06)' }
                  }
                >
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className={cx('truncate', i === 0 ? 'font-extrabold' : 'font-semibold text-sm')}>
                    {p.cancion.titulo}
                  </p>
                  <p className="text-xs text-humo-500 truncate">
                    {p.cancion.artista ?? 'Sin artista'} · pidió {p.pidio?.nombre ?? 'alguien'}
                  </p>
                </div>
                <button
                  disabled={ocupado}
                  onClick={() => {
                    setError(null);
                    sono.mutate({ id: p.id, valor: true });
                  }}
                  className="shrink-0 inline-flex items-center gap-1.5 rounded-xl bg-volt-500 text-carbon-900 px-3 h-9 text-xs font-bold disabled:opacity-60"
                >
                  <IconoCheck className="w-4 h-4" />
                  Sonó
                </button>
                <button
                  disabled={ocupado}
                  onClick={() => {
                    setError(null);
                    quitar.mutate(p.id);
                  }}
                  aria-label={`Quitar ${p.cancion.titulo}`}
                  className="shrink-0 p-1.5 rounded-lg text-humo-500 hover:text-alerta disabled:opacity-60"
                >
                  <IconoCerrar className="w-4 h-4" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {sonadas.length > 0 && (
        <div>
          <p className="etiqueta mb-2">Ya sonaron ({sonadas.length})</p>
          <ul className="space-y-1.5">
            {sonadas.map((p) => (
              <li
                key={p.id}
                className="flex items-center gap-3 rounded-2xl border border-carbon-700 bg-carbon-800/60 px-3 py-2 opacity-70"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm truncate">{p.cancion.titulo}</p>
                  <p className="text-xs text-humo-500 truncate">
                    {p.cancion.artista ?? 'Sin artista'}
                  </p>
                </div>
                {/* Marcar por error se deshace: sin esto habría que volver a
                    pedir la canción desde el teléfono del cliente. */}
                <button
                  disabled={ocupado}
                  onClick={() => {
                    setError(null);
                    sono.mutate({ id: p.id, valor: false });
                  }}
                  className="shrink-0 text-xs font-semibold text-humo-500 hover:text-humo-100 disabled:opacity-60"
                >
                  Devolver a la fila
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** Las que el gimnasio marcó como suyas, para llenar los huecos. */
function DeLaCasa() {
  const { data: canciones } = useQuery({
    queryKey: ['cancionesDeLaCasa'],
    queryFn: api.cancionesDeLaCasa,
    staleTime: 5 * 60_000,
  });

  if (!canciones?.length) return null;

  return (
    <div>
      <p className="etiqueta mb-2">De la casa</p>
      <ul className="space-y-1.5">
        {canciones.map((c) => (
          <li
            key={c.id}
            className="flex items-center gap-3 rounded-2xl border border-carbon-600 bg-carbon-700 px-3 py-2"
          >
            <IconoMusica className="w-4 h-4 shrink-0 text-humo-500" />
            <div className="min-w-0">
              <p className="text-sm font-semibold truncate">{c.titulo}</p>
              <p className="text-xs text-humo-500 truncate">{c.artista ?? 'Sin artista'}</p>
            </div>
            {c.momento && <Insignia className="ml-auto shrink-0">{c.momento}</Insignia>}
          </li>
        ))}
      </ul>
    </div>
  );
}
