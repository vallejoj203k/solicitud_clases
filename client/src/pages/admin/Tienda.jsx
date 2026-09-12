import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client.js';
import { CabeceraAdmin } from './Layout.jsx';
import { Aviso, Boton, Campo, Cargando, Entrada, Hoja, Insignia, Vacio, cx, claseInput } from '../../components/ui.jsx';
import { IconoMas, IconoTienda, IconoCerrar, IconoFoto } from '../../components/Iconos.jsx';
import { pesos } from '../../lib/formato.js';
import { archivoAFotoReducida } from '../../lib/imagen.js';
import { colorCategoria, CATEGORIAS_SUGERIDAS } from '../../lib/categoriaTienda.js';

/**
 * Catálogo de la tienda. SOLO INFORMATIVO, como en el cliente: aquí se carga
 * la foto, la descripción, la ficha nutricional y el precio, pero no hay
 * pedidos ni inventario que gestionar. Vender sigue siendo cosa del mostrador.
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
            descripcion="Agrega el primero: foto, descripción, ficha nutricional y precio."
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
                <div className="flex items-center gap-1.5">
                  <p className="font-semibold truncate">{p.nombre}</p>
                  {p.categoria && (
                    <span className={cx('text-[10px] font-bold uppercase tracking-wider shrink-0', colorCategoria(p.categoria))}>
                      {p.categoria}
                    </span>
                  )}
                </div>
                <p className="text-xs text-humo-500 truncate">{p.descripcion}</p>
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  <span className="text-sm font-bold text-volt-500">{pesos(p.precioCop)}</span>
                  {p.caloriasKcal != null && <span className="text-xs text-humo-500">{p.caloriasKcal} kcal</span>}
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

/** Texto del campo -> número, o `null` si quedó vacío ("no aplica"). */
const numeroONull = (texto) => (texto.trim() === '' ? null : Number(texto));

function HojaProducto({ producto, onCerrar, onListo }) {
  const [nombre, setNombre] = useState(producto?.nombre ?? '');
  const [categoria, setCategoria] = useState(producto?.categoria ?? '');
  const [descripcion, setDescripcion] = useState(producto?.descripcion ?? '');
  const [precio, setPrecio] = useState(producto ? String(producto.precioCop) : '');
  const [foto, setFoto] = useState(producto?.foto ?? '');
  const [porcion, setPorcion] = useState(producto?.porcion ?? '');
  const [caloriasKcal, setCaloriasKcal] = useState(producto?.caloriasKcal != null ? String(producto.caloriasKcal) : '');
  const [proteinaG, setProteinaG] = useState(producto?.proteinaG != null ? String(producto.proteinaG) : '');
  const [carbohidratosG, setCarbohidratosG] = useState(producto?.carbohidratosG != null ? String(producto.carbohidratosG) : '');
  const [azucaresG, setAzucaresG] = useState(producto?.azucaresG != null ? String(producto.azucaresG) : '');
  const [grasasTotalesG, setGrasasTotalesG] = useState(producto?.grasasTotalesG != null ? String(producto.grasasTotalesG) : '');
  const [sodioMg, setSodioMg] = useState(producto?.sodioMg != null ? String(producto.sodioMg) : '');
  const [insignias, setInsignias] = useState(producto?.insignias ?? []);
  const [nuevaInsignia, setNuevaInsignia] = useState('');
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

  const agregarInsignia = () => {
    const texto = nuevaInsignia.trim();
    if (!texto) return;
    setInsignias((lista) => [...lista, texto]);
    setNuevaInsignia('');
  };

  const quitarInsignia = (i) => setInsignias((lista) => lista.filter((_, j) => j !== i));

  const enviar = () => {
    setError(null);
    const precioNum = Number(precio);
    if (!nombre.trim()) return setError('Ponle un nombre al producto.');
    if (!descripcion.trim()) return setError('Falta la descripción.');
    if (!Number.isFinite(precioNum) || precioNum < 0) return setError('El precio no es válido.');

    const camposNutricion = { caloriasKcal, proteinaG, carbohidratosG, azucaresG, grasasTotalesG, sodioMg };
    for (const valor of Object.values(camposNutricion)) {
      const n = Number(valor);
      if (valor.trim() !== '' && (!Number.isFinite(n) || n < 0)) {
        return setError('Revisa los datos nutricionales: alguno no es un número válido.');
      }
    }

    guardar.mutate({
      nombre: nombre.trim(),
      descripcion: descripcion.trim(),
      categoria: categoria.trim(),
      precioCop: Math.round(precioNum),
      foto,
      insignias,
      porcion: porcion.trim() || null,
      caloriasKcal: numeroONull(caloriasKcal),
      proteinaG: numeroONull(proteinaG),
      carbohidratosG: numeroONull(carbohidratosG),
      azucaresG: numeroONull(azucaresG),
      grasasTotalesG: numeroONull(grasasTotalesG),
      sodioMg: numeroONull(sodioMg),
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

        <Campo etiqueta="Categoría" ayuda="Le pinta un color a la tarjeta. Texto libre.">
          <Entrada
            value={categoria}
            onChange={(e) => setCategoria(e.target.value)}
            placeholder="Proteína"
            list="categorias-tienda"
          />
          <datalist id="categorias-tienda">
            {CATEGORIAS_SUGERIDAS.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
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

        <Campo etiqueta="Información nutricional" ayuda="Todo es opcional: deja en blanco lo que no aplique.">
          <div className="space-y-2">
            <Entrada
              value={porcion}
              onChange={(e) => setPorcion(e.target.value)}
              placeholder="Porción: 1 medida · 30 g"
            />
            <div className="grid grid-cols-2 gap-2">
              <CampoNumero etiqueta="Calorías (kcal)" valor={caloriasKcal} onChange={setCaloriasKcal} />
              <CampoNumero etiqueta="Proteína (g)" valor={proteinaG} onChange={setProteinaG} />
              <CampoNumero etiqueta="Carbohidratos (g)" valor={carbohidratosG} onChange={setCarbohidratosG} />
              <CampoNumero etiqueta="— Azúcares (g)" valor={azucaresG} onChange={setAzucaresG} />
              <CampoNumero etiqueta="Grasas totales (g)" valor={grasasTotalesG} onChange={setGrasasTotalesG} />
              <CampoNumero etiqueta="Sodio (mg)" valor={sodioMg} onChange={setSodioMg} />
            </div>
          </div>
        </Campo>

        <Campo etiqueta="Insignias" ayuda='Cortas, como "Sin lactosa" o "Sabor cacao".'>
          {insignias.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-2">
              {insignias.map((insignia, i) => (
                <span
                  key={i}
                  className="inline-flex items-center gap-1.5 pl-3 pr-1.5 py-1 rounded-full border border-carbon-500 text-xs font-semibold"
                >
                  {insignia}
                  <button
                    type="button"
                    onClick={() => quitarInsignia(i)}
                    aria-label={`Quitar ${insignia}`}
                    className="p-0.5 rounded-full text-humo-500 hover:text-alerta hover:bg-carbon-700"
                  >
                    <IconoCerrar className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <Entrada
              value={nuevaInsignia}
              onChange={(e) => setNuevaInsignia(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  agregarInsignia();
                }
              }}
              placeholder="Sin lactosa"
              className="flex-1"
            />
            <Boton type="button" variante="contorno" onClick={agregarInsignia}>
              Agregar
            </Boton>
          </div>
        </Campo>

        <Boton className="w-full" cargando={guardar.isPending} onClick={enviar}>
          {producto ? 'Guardar cambios' : 'Crear producto'}
        </Boton>
      </div>
    </Hoja>
  );
}

/** Un campo numérico opcional de la ficha nutricional. */
function CampoNumero({ etiqueta, valor, onChange }) {
  return (
    <label className="block">
      <span className="block mb-1 text-xs text-humo-500">{etiqueta}</span>
      <Entrada
        type="number"
        inputMode="decimal"
        min="0"
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        placeholder="—"
      />
    </label>
  );
}
