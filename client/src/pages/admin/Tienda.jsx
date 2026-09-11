import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client.js';
import { CabeceraAdmin } from './Layout.jsx';
import { Aviso, Boton, Campo, Cargando, Entrada, Hoja, Insignia, Vacio, cx, claseInput } from '../../components/ui.jsx';
import { IconoMas, IconoTienda, IconoCerrar, IconoFoto } from '../../components/Iconos.jsx';
import { pesos } from '../../lib/formato.js';
import { archivoAFotoReducida } from '../../lib/imagen.js';

/**
 * Catálogo de la tienda. SOLO INFORMATIVO, como en el cliente: aquí se carga
 * la foto, la descripción, los macros y el precio, pero no hay pedidos ni
 * inventario que gestionar. Vender sigue siendo cosa del mostrador.
 */
export default function AdminTienda() {
  const queryClient = useQueryClient();
  const [editando, setEditando] = useState(null); // producto | 'nuevo' | null
  const [error, setError] = useState(null);

  const { data: productos, isLoading } = useQuery({
    queryKey: ['adminProductos'],
    queryFn: api.admin.productos,
  });

  const refrescar = () => queryClient.invalidateQueries({ queryKey: ['adminProductos'] });

  const alternar = useMutation({
    mutationFn: ({ id, activo }) => api.admin.actualizarProducto(id, { activo }),
    onSuccess: refrescar,
    onError: (e) => setError(e.message),
  });

  const borrar = useMutation({
    mutationFn: (id) => api.admin.borrarProducto(id),
    onSuccess: refrescar,
    onError: (e) => setError(e.message),
  });

  const lista = productos ?? [];
  const activos = lista.filter((p) => p.activo).length;

  return (
    <div>
      <CabeceraAdmin
        titulo="Tienda"
        descripcion={`${activos} producto(s) visibles en la tienda del cliente.`}
        acciones={
          <Boton onClick={() => setEditando('nuevo')}>
            <IconoMas className="w-4 h-4" />
            Producto
          </Boton>
        }
      />

      <div className="px-5 md:px-8 pb-10 space-y-4">
        {error && <Aviso>{error}</Aviso>}

        {isLoading && <Cargando />}

        {!isLoading && lista.length === 0 && (
          <Vacio
            titulo="Todavía no hay productos"
            descripcion="Agrega el primero: foto, descripción, macros y precio."
            accion={<Boton onClick={() => setEditando('nuevo')}>Agregar producto</Boton>}
          />
        )}

        <ul className="space-y-2">
          {lista.map((p) => (
            <li
              key={p.id}
              className={cx('tarjeta p-3 flex items-center gap-3', !p.activo && 'opacity-50')}
            >
              {p.foto ? (
                <img src={p.foto} alt="" className="w-16 h-16 rounded-xl object-cover shrink-0" />
              ) : (
                <span className="w-16 h-16 rounded-xl bg-carbon-700 text-humo-500 flex items-center justify-center shrink-0">
                  <IconoTienda className="w-5 h-5" />
                </span>
              )}
              <div className="min-w-0 flex-1">
                <p className="font-semibold truncate">{p.nombre}</p>
                <p className="text-xs text-humo-500 truncate">{p.descripcion}</p>
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  <span className="text-sm font-bold text-volt-500">{pesos(p.precioCop)}</span>
                  {!p.activo && <Insignia tono="peligro">Oculto</Insignia>}
                </div>
              </div>
              <div className="shrink-0 flex flex-col items-end gap-1">
                <button
                  onClick={() => setEditando(p)}
                  className="text-xs font-semibold text-humo-300 hover:text-humo-100"
                >
                  Editar
                </button>
                <button
                  onClick={() => {
                    setError(null);
                    alternar.mutate({ id: p.id, activo: !p.activo });
                  }}
                  className="text-xs font-semibold text-humo-500 hover:text-humo-100"
                >
                  {p.activo ? 'Ocultar' : 'Mostrar'}
                </button>
                <button
                  onClick={() => {
                    setError(null);
                    if (window.confirm(`¿Borrar "${p.nombre}"? No se puede deshacer.`)) {
                      borrar.mutate(p.id);
                    }
                  }}
                  className="text-xs font-semibold text-alerta hover:underline"
                >
                  Borrar
                </button>
              </div>
            </li>
          ))}
        </ul>
      </div>

      {editando && (
        <HojaProducto
          producto={editando === 'nuevo' ? null : editando}
          onCerrar={() => setEditando(null)}
          onListo={() => {
            refrescar();
            setEditando(null);
          }}
        />
      )}
    </div>
  );
}

/* -------------------------------------------------------- Crear / editar */

function HojaProducto({ producto, onCerrar, onListo }) {
  const [nombre, setNombre] = useState(producto?.nombre ?? '');
  const [descripcion, setDescripcion] = useState(producto?.descripcion ?? '');
  const [precio, setPrecio] = useState(producto ? String(producto.precioCop) : '');
  const [foto, setFoto] = useState(producto?.foto ?? '');
  const [macros, setMacros] = useState(producto?.macros?.length ? producto.macros : [{ nombre: '', valor: '' }]);
  const [error, setError] = useState(null);
  const [subiendoFoto, setSubiendoFoto] = useState(false);
  const archivoRef = useRef(null);

  const guardar = useMutation({
    mutationFn: (datos) =>
      producto ? api.admin.actualizarProducto(producto.id, datos) : api.admin.crearProducto(datos),
    onSuccess: onListo,
    onError: (e) => setError(e.message),
  });

  const elegirFoto = async (e) => {
    const archivo = e.target.files?.[0];
    e.target.value = '';
    if (!archivo) return;
    setError(null);
    setSubiendoFoto(true);
    try {
      setFoto(await archivoAFotoReducida(archivo));
    } catch {
      setError('No pudimos leer esa imagen. Prueba con otra foto.');
    } finally {
      setSubiendoFoto(false);
    }
  };

  const cambiarMacro = (i, campo, valor) =>
    setMacros((m) => m.map((fila, j) => (j === i ? { ...fila, [campo]: valor } : fila)));

  const quitarMacro = (i) => setMacros((m) => m.filter((_, j) => j !== i));

  const enviar = () => {
    setError(null);
    const precioNum = Number(precio);
    if (!nombre.trim()) return setError('Ponle un nombre al producto.');
    if (!descripcion.trim()) return setError('Falta la descripción.');
    if (!Number.isFinite(precioNum) || precioNum < 0) return setError('El precio no es válido.');

    guardar.mutate({
      nombre: nombre.trim(),
      descripcion: descripcion.trim(),
      precioCop: Math.round(precioNum),
      foto,
      macros: macros
        .map((m) => ({ nombre: m.nombre.trim(), valor: m.valor.trim() }))
        .filter((m) => m.nombre && m.valor),
    });
  };

  return (
    <Hoja abierta onCerrar={onCerrar} titulo={producto ? 'Editar producto' : 'Nuevo producto'}>
      <div className="space-y-4">
        {error && <Aviso>{error}</Aviso>}

        <Campo etiqueta="Foto">
          <input
            ref={archivoRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            hidden
            onChange={elegirFoto}
          />
          <button
            type="button"
            onClick={() => archivoRef.current?.click()}
            className="w-full aspect-[16/9] rounded-2xl border border-dashed border-carbon-500 bg-carbon-700 flex items-center justify-center overflow-hidden relative"
          >
            {foto ? (
              <img src={foto} alt="" className="w-full h-full object-cover" />
            ) : (
              <span className="flex flex-col items-center gap-1.5 text-humo-500 text-sm">
                <IconoFoto className="w-6 h-6" />
                {subiendoFoto ? 'Cargando…' : 'Toca para elegir una foto'}
              </span>
            )}
          </button>
          {foto && (
            <button
              type="button"
              onClick={() => setFoto('')}
              className="mt-1.5 text-xs font-semibold text-alerta hover:underline"
            >
              Quitar foto
            </button>
          )}
        </Campo>

        <Campo etiqueta="Nombre">
          <Entrada value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Whey Isolate" />
        </Campo>

        <Campo etiqueta="Descripción">
          <textarea
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            rows={4}
            placeholder="Qué es, para qué sirve, cómo se toma…"
            className={cx(claseInput, 'resize-none')}
          />
        </Campo>

        <Campo etiqueta="Precio (COP)">
          <Entrada
            type="number"
            inputMode="numeric"
            min="0"
            value={precio}
            onChange={(e) => setPrecio(e.target.value)}
            placeholder="32900"
          />
        </Campo>

        <Campo etiqueta="Información nutricional" ayuda="Un renglón por dato: nombre y valor.">
          <div className="space-y-2">
            {macros.map((m, i) => (
              <div key={i} className="flex gap-2">
                <Entrada
                  value={m.nombre}
                  onChange={(e) => cambiarMacro(i, 'nombre', e.target.value)}
                  placeholder="Proteína"
                  className="flex-1"
                />
                <Entrada
                  value={m.valor}
                  onChange={(e) => cambiarMacro(i, 'valor', e.target.value)}
                  placeholder="27 g"
                  className="w-24"
                />
                <button
                  type="button"
                  onClick={() => quitarMacro(i)}
                  aria-label="Quitar renglón"
                  className="shrink-0 p-2.5 rounded-xl text-humo-500 hover:text-alerta hover:bg-carbon-700"
                >
                  <IconoCerrar className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setMacros((m) => [...m, { nombre: '', valor: '' }])}
            className="mt-2 text-xs font-semibold text-volt-500 hover:underline"
          >
            + Agregar renglón
          </button>
        </Campo>

        <Boton className="w-full" cargando={guardar.isPending} onClick={enviar}>
          {producto ? 'Guardar cambios' : 'Crear producto'}
        </Boton>
      </div>
    </Hoja>
  );
}
