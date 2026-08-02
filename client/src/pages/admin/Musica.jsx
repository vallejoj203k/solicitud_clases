import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client.js';
import { CabeceraAdmin } from './Layout.jsx';
import {
  Aviso,
  Boton,
  Campo,
  Cargando,
  Entrada,
  Hoja,
  Insignia,
  Seleccion,
  Vacio,
  cx,
} from '../../components/ui.jsx';
import { IconoBuscar, IconoMas, IconoMusica } from '../../components/Iconos.jsx';

/**
 * Catálogo de música del gimnasio.
 *
 * Es solo texto: título, artista y a lo sumo en qué momento de la clase encaja.
 * La app no guarda ni reproduce audio -no pesa nada y no hay líos de derechos-,
 * sino que arma la lista que el instructor lee para saber qué poner después.
 *
 * La forma rápida de llenarlo es pegar la playlist que el gimnasio ya tiene:
 * una canción por línea, "Título - Artista". Repetir la carga no duplica nada.
 */

const MOMENTOS = [
  { valor: '', texto: 'Cualquier momento' },
  { valor: 'calentamiento', texto: 'Calentamiento' },
  { valor: 'subida', texto: 'Subida' },
  { valor: 'pico', texto: 'Pico' },
  { valor: 'enfriamiento', texto: 'Enfriamiento' },
];

const NOMBRE_MOMENTO = Object.fromEntries(MOMENTOS.slice(1).map((m) => [m.valor, m.texto]));

export default function AdminMusica() {
  const queryClient = useQueryClient();
  const [busqueda, setBusqueda] = useState('');
  const [hoja, setHoja] = useState(null); // 'nueva' | 'importar'
  const [error, setError] = useState(null);

  const { data: canciones, isLoading } = useQuery({
    queryKey: ['adminCanciones', busqueda],
    queryFn: () => api.admin.canciones(busqueda || undefined),
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

  return (
    <div>
      <CabeceraAdmin
        titulo="Música"
        descripcion="El catálogo del que los clientes eligen sus canciones."
        acciones={
          <>
            <Boton variante="fantasma" onClick={() => setHoja('importar')}>
              Pegar lista
            </Boton>
            <Boton onClick={() => setHoja('nueva')}>
              <IconoMas className="w-4 h-4" />
              Canción
            </Boton>
          </>
        }
      />

      <div className="px-5 md:px-8 pb-10 space-y-4">
        {error && <Aviso>{error}</Aviso>}

        <div className="relative">
          <IconoBuscar className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-humo-500 pointer-events-none" />
          <Entrada
            value={busqueda}
            onChange={(e) => {
              setBusqueda(e.target.value);
              setError(null);
            }}
            placeholder="Buscar por título o artista"
            className="pl-12"
          />
        </div>

        {isLoading && <Cargando />}

        {!isLoading && lista.length === 0 && (
          <Vacio
            titulo={busqueda ? 'Sin resultados' : 'Catálogo vacío'}
            descripcion={
              busqueda
                ? 'Ninguna canción coincide con esa búsqueda.'
                : 'Pega la playlist del gimnasio para empezar: una canción por línea.'
            }
            accion={
              !busqueda && <Boton onClick={() => setHoja('importar')}>Pegar lista</Boton>
            }
          />
        )}

        <ul className="space-y-2">
          {lista.map((c) => (
            <li
              key={c.id}
              className={cx(
                'tarjeta p-4 flex items-center gap-3',
                !c.activa && 'opacity-50'
              )}
            >
              <span className="p-2 rounded-xl bg-carbon-700 text-humo-500 shrink-0">
                <IconoMusica className="w-4 h-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-semibold truncate">{c.titulo}</p>
                <p className="text-xs text-humo-500 truncate">{c.artista ?? 'Sin artista'}</p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {c.deLaCasa && <Insignia tono="exito">De la casa</Insignia>}
                  {c.momento && <Insignia>{NOMBRE_MOMENTO[c.momento] ?? c.momento}</Insignia>}
                  {!c.activa && <Insignia tono="peligro">Fuera del catálogo</Insignia>}
                </div>
              </div>
              <div className="shrink-0 flex flex-col items-end gap-1">
                {/* "De la casa" son las que el instructor pone cuando nadie pidió
                    nada, así que se marcan de a una y sin salir de la lista. */}
                <button
                  onClick={() => {
                    setError(null);
                    alternar.mutate({ id: c.id, datos: { deLaCasa: !c.deLaCasa } });
                  }}
                  className="text-xs font-semibold text-humo-500 hover:text-humo-100"
                >
                  {c.deLaCasa ? 'Quitar de la casa' : 'Marcar de la casa'}
                </button>
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

      {hoja === 'nueva' && <HojaNueva onCerrar={() => setHoja(null)} onListo={refrescar} />}
      {hoja === 'importar' && <HojaImportar onCerrar={() => setHoja(null)} onListo={refrescar} />}
    </div>
  );
}

/* ------------------------------------------------------- Agregar de a una */

function HojaNueva({ onCerrar, onListo }) {
  const [datos, setDatos] = useState({ titulo: '', artista: '', momento: '', deLaCasa: false });
  const [error, setError] = useState(null);

  const crear = useMutation({
    mutationFn: () =>
      api.admin.crearCancion({
        titulo: datos.titulo,
        artista: datos.artista || null,
        momento: datos.momento || null,
        deLaCasa: datos.deLaCasa,
      }),
    onSuccess: () => {
      onListo();
      onCerrar();
    },
    onError: (e) => setError(e.message),
  });

  return (
    <Hoja abierta onCerrar={onCerrar} titulo="Nueva canción">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          crear.mutate();
        }}
      >
        {error && <Aviso>{error}</Aviso>}

        <Campo etiqueta="Título">
          <Entrada
            value={datos.titulo}
            onChange={(e) => setDatos({ ...datos, titulo: e.target.value })}
            placeholder="Blinding Lights"
            required
            autoFocus
          />
        </Campo>

        <Campo etiqueta="Artista">
          <Entrada
            value={datos.artista}
            onChange={(e) => setDatos({ ...datos, artista: e.target.value })}
            placeholder="The Weeknd"
          />
        </Campo>

        <Campo etiqueta="Momento de la clase" ayuda="Opcional, para armar la sesión.">
          <Seleccion
            value={datos.momento}
            onChange={(e) => setDatos({ ...datos, momento: e.target.value })}
          >
            {MOMENTOS.map((m) => (
              <option key={m.valor} value={m.valor}>
                {m.texto}
              </option>
            ))}
          </Seleccion>
        </Campo>

        <label className="flex items-center gap-3 rounded-2xl border border-carbon-600 bg-carbon-700 px-4 py-3 cursor-pointer">
          <input
            type="checkbox"
            checked={datos.deLaCasa}
            onChange={(e) => setDatos({ ...datos, deLaCasa: e.target.checked })}
            className="w-5 h-5 accent-volt-500"
          />
          <span className="text-sm">
            De la casa
            <span className="block text-xs text-humo-500">
              Suena cuando nadie pidió nada.
            </span>
          </span>
        </label>

        <Boton type="submit" className="w-full" cargando={crear.isPending}>
          Agregar al catálogo
        </Boton>
      </form>
    </Hoja>
  );
}

/* ------------------------------------------------------------ Pegar lista */

function HojaImportar({ onCerrar, onListo }) {
  const [texto, setTexto] = useState('');
  const [error, setError] = useState(null);
  const [resumen, setResumen] = useState(null);

  const importar = useMutation({
    mutationFn: () => api.admin.importarCanciones(texto),
    onSuccess: (r) => {
      setResumen(r);
      setTexto('');
      onListo();
    },
    onError: (e) => setError(e.message),
  });

  return (
    <Hoja abierta onCerrar={onCerrar} titulo="Pegar lista">
      <div className="space-y-4">
        <p className="text-sm text-humo-500">
          Una canción por línea, con el artista después de un guion. Puedes pegar la misma
          lista otra vez: las repetidas no se duplican.
        </p>

        {error && <Aviso>{error}</Aviso>}

        {resumen && (
          <Aviso tono="info">
            Leídas {resumen.leidas} · agregadas {resumen.creadas} · ya estaban {resumen.repetidas}
          </Aviso>
        )}

        <textarea
          value={texto}
          onChange={(e) => {
            setTexto(e.target.value);
            setError(null);
            setResumen(null);
          }}
          rows={10}
          spellCheck={false}
          placeholder={'Blinding Lights - The Weeknd\nTiti Me Preguntó - Bad Bunny\nLevitating - Dua Lipa'}
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
