import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client.js';
import { CabeceraAdmin } from './Layout.jsx';
import { Aviso, Boton, Cargando, Entrada, Hoja, Insignia, Vacio, cx } from '../../components/ui.jsx';
import { IconoBuscar, IconoMas, IconoMusica } from '../../components/Iconos.jsx';
import { duracion } from '../../lib/youtube.js';

/**
 * Música del gimnasio.
 *
 * ESTA ES LA LISTA QUE SUENA. El reproductor encadena solo con lo que hay
 * aquí -las canciones **de la casa**- cuando nadie ha pedido nada; YouTube no
 * propone nada por su cuenta. Las que piden los clientes entran solas al
 * catálogo, así que esta pantalla no es para cargarlas todas.
 *
 * La app no aloja audio: guarda el id del video de YouTube y lo pone con el
 * reproductor incrustado oficial, que va con su publicidad y sus reglas.
 *
 * Hay dos formas de agregar, y la diferencia es la CUOTA. La API de YouTube da
 * 10.000 unidades al día: buscar cuesta 100, pedir los datos de 50 videos por
 * su enlace cuesta 1. Por eso pegar enlaces es la vía para cargar muchas y
 * buscar es la vía para agregar una suelta.
 */
export default function AdminMusica() {
  const queryClient = useQueryClient();
  const [filtro, setFiltro] = useState('');
  const [hoja, setHoja] = useState(null); // 'buscar' | 'pegar'
  const [error, setError] = useState(null);

  const { data: canciones, isLoading } = useQuery({
    queryKey: ['adminCanciones', filtro],
    queryFn: () => api.admin.canciones(filtro || undefined),
    placeholderData: (anterior) => anterior,
  });

  const refrescar = () => queryClient.invalidateQueries({ queryKey: ['adminCanciones'] });

  const alternar = useMutation({
    mutationFn: ({ id, datos }) => api.admin.actualizarCancion(id, datos),
    onSuccess: refrescar,
    onError: (e) => setError(e.message),
  });

  const eliminar = useMutation({
    mutationFn: (id) => api.admin.eliminarCancion(id),
    onSuccess: refrescar,
    onError: (e) => setError(e.message),
  });

  const lista = canciones ?? [];
  const deLaCasa = lista.filter((c) => c.deLaCasa).length;

  return (
    <div>
      <CabeceraAdmin
        titulo="Música"
        descripcion={`${deLaCasa} canciones de la casa · es lo que suena cuando nadie pide.`}
        acciones={
          <>
            <Link to="/musica/reproductor">
              <Boton variante="contorno">
                <IconoMusica className="w-4 h-4" />
                Abrir reproductor
              </Boton>
            </Link>
            <Boton variante="fantasma" onClick={() => setHoja('pegar')}>
              Pegar enlaces
            </Boton>
            <Boton onClick={() => setHoja('buscar')}>
              <IconoMas className="w-4 h-4" />
              Canción
            </Boton>
          </>
        }
      />

      <div className="px-5 md:px-8 pb-10 space-y-4">
        {error && <Aviso>{error}</Aviso>}

        <Aviso tono="info">
          Deja <strong>Abrir reproductor</strong> en la pantalla conectada a los parlantes y toca
          «Empezar» una vez al abrir. De ahí en adelante suena sola: primero lo que piden los
          clientes y, cuando no hay pedidos, la mezcla de YouTube o estas canciones.
        </Aviso>

        <div className="relative">
          <IconoBuscar className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-humo-500 pointer-events-none" />
          <Entrada
            value={filtro}
            onChange={(e) => {
              setFiltro(e.target.value);
              setError(null);
            }}
            placeholder="Filtrar lo que ya está en el catálogo"
            className="pl-12"
          />
        </div>

        {isLoading && <Cargando />}

        {!isLoading && lista.length === 0 && (
          <Vacio
            titulo={filtro ? 'Sin resultados' : 'Todavía no hay canciones de la casa'}
            descripcion={
              filtro
                ? 'Ninguna canción coincide con ese filtro.'
                : 'Pega los enlaces de una lista de YouTube para tener algo que suene cuando nadie pida.'
            }
            accion={!filtro && <Boton onClick={() => setHoja('pegar')}>Pegar enlaces</Boton>}
          />
        )}

        <ul className="space-y-2">
          {lista.map((c) => (
            <li key={c.id} className={cx('tarjeta p-3 flex items-center gap-3', !c.activa && 'opacity-50')}>
              {c.miniatura ? (
                <img src={c.miniatura} alt="" className="w-16 h-12 rounded-xl object-cover shrink-0" />
              ) : (
                <span className="w-16 h-12 rounded-xl bg-carbon-700 text-humo-500 flex items-center justify-center shrink-0">
                  <IconoMusica className="w-4 h-4" />
                </span>
              )}
              <div className="min-w-0 flex-1">
                <p className="font-semibold truncate">{c.titulo}</p>
                <p className="text-xs text-humo-500 truncate">
                  {c.canal ?? c.artista ?? 'Sin artista'}
                  {c.duracionSeg ? ` · ${duracion(c.duracionSeg)}` : ''}
                </p>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {c.deLaCasa && <Insignia tono="exito">De la casa</Insignia>}
                  {!c.videoId && <Insignia tono="aviso">Sin video · no suena</Insignia>}
                  {!c.activa && <Insignia tono="peligro">Fuera del catálogo</Insignia>}
                </div>
              </div>
              <div className="shrink-0 flex flex-col items-end gap-1">
                {/* Solo tiene sentido marcar de la casa lo que se puede
                    reproducir: sin video el reproductor la salta. */}
                {c.videoId && (
                  <button
                    onClick={() => {
                      setError(null);
                      alternar.mutate({ id: c.id, datos: { deLaCasa: !c.deLaCasa } });
                    }}
                    className="text-xs font-semibold text-humo-500 hover:text-humo-100"
                  >
                    {c.deLaCasa ? 'Quitar de la casa' : 'Marcar de la casa'}
                  </button>
                )}
                <button
                  onClick={() => {
                    setError(null);
                    if (c.activa) eliminar.mutate(c.id);
                    else alternar.mutate({ id: c.id, datos: { activa: true } });
                  }}
                  className={cx(
                    'text-xs font-semibold',
                    c.activa ? 'text-alerta hover:underline' : 'text-volt-500 hover:underline'
                  )}
                >
                  {c.activa ? 'Sacar del catálogo' : 'Devolver al catálogo'}
                </button>
              </div>
            </li>
          ))}
        </ul>
      </div>

      {hoja === 'buscar' && <HojaBuscar onCerrar={() => setHoja(null)} onListo={refrescar} />}
      {hoja === 'pegar' && <HojaPegar onCerrar={() => setHoja(null)} onListo={refrescar} />}
    </div>
  );
}

/* ------------------------------------------- Buscar una suelta en YouTube */

function HojaBuscar({ onCerrar, onListo }) {
  const [texto, setTexto] = useState('');
  const [consulta, setConsulta] = useState('');
  const [error, setError] = useState(null);
  const [agregadas, setAgregadas] = useState(() => new Set());
  const entrada = useRef(null);

  const { data: resultados, isFetching, error: errorBusqueda } = useQuery({
    queryKey: ['adminBuscarYoutube', consulta],
    queryFn: () => api.admin.buscarEnYoutube(consulta),
    enabled: consulta.length >= 2,
    staleTime: 30 * 60_000,
    retry: false,
  });

  const agregar = useMutation({
    mutationFn: (videoId) => api.admin.agregarDeYoutube(videoId, true),
    onSuccess: (_r, videoId) => {
      setAgregadas((s) => new Set(s).add(videoId));
      onListo();
    },
    onError: (e) => setError(e.message),
  });

  return (
    <Hoja abierta onCerrar={onCerrar} titulo="Agregar de YouTube">
      <div className="space-y-4">
        <p className="text-sm text-humo-500">
          Lo que agregues aquí queda como <strong>de la casa</strong>: suena cuando nadie ha
          pedido nada.
        </p>

        {error && <Aviso>{error}</Aviso>}
        {errorBusqueda && <Aviso tono="info">{errorBusqueda.message}</Aviso>}

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
              placeholder="Nombre de la canción o del artista"
              className="pl-12 pr-20"
              autoFocus
            />
            <button
              type="submit"
              disabled={texto.trim().length < 2}
              className="absolute right-2 top-1/2 -translate-y-1/2 px-3 h-9 rounded-xl bg-volt-500 text-carbon-900 text-xs font-bold disabled:opacity-40"
            >
              Buscar
            </button>
          </div>
        </form>

        <div className="space-y-1.5 max-h-[52vh] overflow-y-auto">
          {isFetching && <Cargando texto="Buscando en YouTube…" />}
          {resultados?.length === 0 && (
            <p className="py-6 text-center text-sm text-humo-500">Sin resultados.</p>
          )}
          {(resultados ?? []).map((c) => {
            const puesta = agregadas.has(c.videoId);
            return (
              <button
                key={c.videoId}
                disabled={puesta}
                onClick={() => {
                  setError(null);
                  agregar.mutate(c.videoId);
                }}
                className={cx(
                  'w-full flex items-center gap-3 rounded-2xl border px-3 py-2 text-left transition-colors',
                  puesta
                    ? 'border-volt-500/40 bg-volt-500/10 cursor-default'
                    : 'border-carbon-600 bg-carbon-700 hover:border-carbon-500'
                )}
              >
                {c.miniatura && (
                  <img src={c.miniatura} alt="" className="w-16 h-12 rounded-xl object-cover shrink-0" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="font-semibold truncate text-sm">{c.titulo}</p>
                  <p className="text-xs text-humo-500 truncate">
                    {c.canal} · {duracion(c.duracionSeg)}
                  </p>
                </div>
                <span className="text-xs font-semibold shrink-0 text-volt-500">
                  {puesta ? 'Agregada' : 'Agregar'}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </Hoja>
  );
}

/* ------------------------------------------------ Pegar muchas de una vez */

function HojaPegar({ onCerrar, onListo }) {
  const [texto, setTexto] = useState('');
  const [error, setError] = useState(null);
  const [resumen, setResumen] = useState(null);

  const importar = useMutation({
    mutationFn: () => api.admin.importarCanciones(texto, true),
    onSuccess: (r) => {
      setResumen(r);
      setTexto('');
      onListo();
    },
    onError: (e) => setError(e.message),
  });

  return (
    <Hoja abierta onCerrar={onCerrar} titulo="Pegar enlaces">
      <div className="space-y-4">
        <p className="text-sm text-humo-500">
          Pega el enlace de una <strong>lista de reproducción</strong> de YouTube y entra
          completa, o los enlaces de las canciones, uno por línea. Pegar lo mismo dos veces no
          duplica nada.
        </p>

        {error && <Aviso>{error}</Aviso>}

        {resumen && (
          <Aviso tono="info">
            Leídas {resumen.leidas} · agregadas {resumen.creadas} · ya estaban {resumen.repetidas}
            {resumen.descartadas > 0 && (
              <>
                {' '}
                · {resumen.descartadas} descartadas porque no se dejan incrustar, están
                bloqueadas en Colombia o duran demasiado
              </>
            )}
          </Aviso>
        )}

        <textarea
          value={texto}
          onChange={(e) => {
            setTexto(e.target.value);
            setError(null);
            setResumen(null);
          }}
          rows={9}
          spellCheck={false}
          placeholder={'https://www.youtube.com/playlist?list=PL...\n\no bien:\nhttps://www.youtube.com/watch?v=...\nhttps://youtu.be/...'}
          className="w-full rounded-2xl bg-carbon-700 border border-carbon-600 px-4 py-3 text-sm font-mono leading-relaxed placeholder:text-humo-500/60 focus:outline-none focus:border-volt-500"
        />

        <Boton
          className="w-full"
          disabled={!texto.trim()}
          cargando={importar.isPending}
          onClick={() => {
            setError(null);
            importar.mutate();
          }}
        >
          Agregar al catálogo
        </Boton>
      </div>
    </Hoja>
  );
}
