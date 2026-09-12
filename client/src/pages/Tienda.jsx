import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client.js';
import { Cargando, Aviso, Vacio, Hoja, cx } from '../components/ui.jsx';
import { IconoAtras, IconoTienda, IconoFlecha } from '../components/Iconos.jsx';
import { pesos } from '../lib/formato.js';
import { rutaInicio } from '../lib/tablet.js';
import { colorCategoria } from '../lib/categoriaTienda.js';
import { porcentajeVD } from '../lib/nutricion.js';

/**
 * Vidriera de la tienda. SOLO INFORMATIVA: se ve la foto, la descripción, la
 * ficha nutricional y el precio de cada producto, y se compra en el
 * mostrador -no hay carrito ni pago aquí-. Por eso no exige sesión ni
 * dispositivo: es la misma vista para cualquiera.
 *
 * MIENTRAS HAYA 4 PRODUCTOS O MENOS, la rejilla no se desplaza: se reparte el
 * alto disponible igual que hace el inicio (ver `Home.jsx`). Con 5 o más deja
 * de tener sentido encoger las tarjetas -se verían diminutas- y la pantalla
 * vuelve a ser una página normal, con scroll.
 */
export default function Tienda() {
  const [abierto, setAbierto] = useState(null);

  const { data: productos, isLoading, error } = useQuery({
    queryKey: ['productos'],
    queryFn: api.productos,
    staleTime: 60_000,
  });

  const cantidad = productos?.length ?? 0;
  const pocos = cantidad > 0 && cantidad <= 4;

  // Cuántas filas hacen falta según cuántas columnas hay en cada tamaño de
  // pantalla. Escritas enteras -"grid-rows-1", "grid-rows-2"- porque Tailwind
  // busca las clases por texto en el código, no las arma con un `${n}`.
  const FILAS_2_COLUMNAS = { 1: 'grid-rows-1', 2: 'grid-rows-1', 3: 'grid-rows-2', 4: 'grid-rows-2' };

  return (
    <div className={cx('flex flex-col', pocos ? 'h-dvh overflow-hidden' : 'min-h-dvh pb-10')}>
      <header className="shrink-0 px-5 pt-6 pb-4 flex items-center gap-3">
        <Link
          to={rutaInicio()}
          aria-label="Volver"
          className="p-2 -ml-2 rounded-xl text-humo-300 hover:bg-carbon-700 active:scale-95"
        >
          <IconoAtras />
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-extrabold tracking-tightest">Tienda</h1>
          <p className="text-xs text-humo-500">Compra en el mostrador.</p>
        </div>
      </header>

      <main className={cx('px-4 md:px-6', pocos ? 'flex-1 min-h-0 flex flex-col pb-4' : 'pb-4')}>
        {isLoading && (
          <div className="py-16 flex justify-center">
            <Cargando texto="Buscando productos…" />
          </div>
        )}

        {error && <Aviso>No pudimos cargar la tienda. Revisa tu conexión.</Aviso>}

        {productos && productos.length === 0 && (
          <Vacio
            titulo="Todavía no hay productos"
            descripcion="Pronto vas a poder ver aquí lo que vende el gimnasio."
          />
        )}

        {productos && productos.length > 0 && (
          <div
            className={cx(
              'grid grid-cols-2 sm:grid-cols-4 gap-3',
              pocos && 'flex-1 min-h-0',
              pocos && FILAS_2_COLUMNAS[cantidad],
              pocos && 'sm:grid-rows-1'
            )}
          >
            {productos.map((p) => (
              <TarjetaProducto key={p.id} producto={p} pocos={pocos} onAbrir={() => setAbierto(p)} />
            ))}
          </div>
        )}
      </main>

      {abierto && <FichaProducto producto={abierto} onCerrar={() => setAbierto(null)} />}
    </div>
  );
}

/**
 * La tarjeta se apoya en la misma idea que las del inicio (`Home.jsx`): la
 * foto va absoluta detrás, así que la tarjeta puede encogerse o crecer con lo
 * que le dé la rejilla sin arrastrar un alto propio -eso es lo que permite
 * que quepan las 4 sin scroll-. Sin productos por mostrar todavía (más de 4
 * en catálogo, rejilla normal con scroll) se le da una proporción fija para
 * que no quede ni gigante ni aplastada.
 */
function TarjetaProducto({ producto, pocos, onAbrir }) {
  return (
    <div
      className={cx(
        'relative min-h-0 rounded-3xl overflow-hidden border border-carbon-600 bg-carbon-700 animate-aparecer',
        !pocos && 'aspect-[3/4]'
      )}
    >
      <button onClick={onAbrir} aria-label={`Ver ${producto.nombre}`} className="absolute inset-0 z-10 active:scale-[.98] transition-transform" />

      {producto.categoria && (
        <span
          className={cx(
            'absolute top-2.5 left-2.5 z-20 px-2 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wider',
            'bg-carbon-900/80 backdrop-blur-sm border border-white/10',
            colorCategoria(producto.categoria)
          )}
        >
          {producto.categoria}
        </span>
      )}

      {producto.foto ? (
        <img src={producto.foto} alt="" className="absolute inset-0 w-full h-full object-cover" />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center">
          <IconoTienda className="w-8 h-8 text-humo-500" />
        </div>
      )}

      <div
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(to top, #1C2028 0%, rgba(28,32,40,0.92) 32%, rgba(28,32,40,0.25) 62%, rgba(28,32,40,0) 100%)',
        }}
      />

      <div className="relative z-20 h-full p-3 flex flex-col justify-end pointer-events-none">
        <p className="font-bold tracking-tight text-sm truncate">{producto.nombre}</p>
        <div className="mt-1 flex items-end justify-between gap-2">
          <p className="text-xs text-humo-300 truncate">
            {producto.caloriasKcal != null ? `${producto.caloriasKcal} kcal · ` : ''}
            <span className="font-bold text-volt-500">{pesos(producto.precioCop)}</span>
          </p>
          <span className="shrink-0 p-1.5 rounded-full bg-carbon-900/70 text-humo-100 border border-white/10">
            <IconoFlecha className="w-3.5 h-3.5" />
          </span>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------- La ficha */

function FichaProducto({ producto, onCerrar }) {
  const tieneMacros =
    producto.proteinaG != null || producto.carbohidratosG != null || producto.grasasTotalesG != null;
  const tieneTablaCompleta =
    tieneMacros || producto.caloriasKcal != null || producto.azucaresG != null || producto.sodioMg != null;

  return (
    <Hoja abierta onCerrar={onCerrar} titulo={producto.nombre}>
      <div className="space-y-4">
        {producto.categoria && (
          <span className={cx('block text-[11px] font-extrabold uppercase tracking-wider', colorCategoria(producto.categoria))}>
            {producto.categoria}
          </span>
        )}

        {producto.foto && (
          <img
            src={producto.foto}
            alt=""
            className="w-full aspect-video rounded-2xl object-cover bg-carbon-700"
          />
        )}

        <p className="text-sm text-humo-300 leading-relaxed whitespace-pre-line">
          {producto.descripcion}
        </p>

        {tieneMacros && (
          <div className="flex gap-3">
            {producto.proteinaG != null && (
              <BarraMacro
                etiqueta="Proteína"
                valor={producto.proteinaG}
                campo="proteinaG"
                claseTexto="text-volt-500"
                claseBarra="bg-volt-500"
              />
            )}
            {producto.carbohidratosG != null && (
              <BarraMacro
                etiqueta="Carbs"
                valor={producto.carbohidratosG}
                campo="carbohidratosG"
                claseTexto="text-aqua-500"
                claseBarra="bg-aqua-500"
              />
            )}
            {producto.grasasTotalesG != null && (
              <BarraMacro
                etiqueta="Grasas"
                valor={producto.grasasTotalesG}
                campo="grasasTotalesG"
                claseTexto="text-purple-400"
                claseBarra="bg-purple-400"
              />
            )}
          </div>
        )}

        {tieneTablaCompleta && (
          <div>
            <div className="mb-2 flex items-baseline justify-between gap-2">
              <p className="etiqueta">Información nutricional</p>
              {producto.porcion && <p className="text-xs text-humo-500 truncate">{producto.porcion}</p>}
            </div>
            <ul className="rounded-2xl border border-carbon-600 divide-y divide-carbon-700 overflow-hidden">
              <FilaNutricion etiqueta="Calorías" valor={producto.caloriasKcal} unidad=" kcal" campo="caloriasKcal" />
              <FilaNutricion etiqueta="Proteína" valor={producto.proteinaG} unidad=" g" campo="proteinaG" />
              <FilaNutricion etiqueta="Carbohidratos" valor={producto.carbohidratosG} unidad=" g" campo="carbohidratosG" />
              <FilaNutricion etiqueta="Azúcares" valor={producto.azucaresG} unidad=" g" campo="azucaresG" sangria />
              <FilaNutricion etiqueta="Grasas totales" valor={producto.grasasTotalesG} unidad=" g" campo="grasasTotalesG" />
              <FilaNutricion etiqueta="Sodio" valor={producto.sodioMg} unidad=" mg" campo="sodioMg" />
            </ul>
            <p className="mt-1.5 text-[11px] text-humo-500">
              % VD: porcentaje de un valor diario de 2.000 kcal.
            </p>
          </div>
        )}

        {producto.insignias?.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {producto.insignias.map((insignia, i) => (
              <span
                key={i}
                className="px-3 py-1 rounded-full border border-volt-500/30 text-volt-500 text-xs font-semibold"
              >
                {insignia}
              </span>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between pt-1">
          <div>
            <p className="etiqueta">Precio</p>
            <p className="text-2xl font-extrabold tracking-tightest">{pesos(producto.precioCop)}</p>
          </div>
          <p className="text-xs text-humo-500 max-w-[45%] text-right">
            Cómpralo en el mostrador del gimnasio.
          </p>
        </div>
      </div>
    </Hoja>
  );
}

/** Una de las tres barras destacadas (proteína/carbs/grasas). El largo es el
 *  %VD de ese macro -la misma cuenta que en la tabla de abajo-, no un número
 *  aparte por producto. */
function BarraMacro({ etiqueta, valor, campo, claseTexto, claseBarra }) {
  const pct = porcentajeVD(campo, valor);
  return (
    <div className="min-w-0 flex-1">
      <p className={cx('text-[11px] font-bold uppercase tracking-wider truncate', claseTexto)}>{etiqueta}</p>
      <p className={cx('text-lg font-extrabold tabular-nums', claseTexto)}>{formatearGramos(valor)} g</p>
      <div className="mt-1.5 h-1.5 rounded-full bg-carbon-700 overflow-hidden">
        <div
          className={cx('h-full rounded-full', claseBarra)}
          style={{ width: `${Math.max(4, Math.min(100, pct ?? 0))}%` }}
        />
      </div>
    </div>
  );
}

/** Un renglón de la tabla nutricional; no sale si el producto no trae ese
 *  dato -no todo lo que se vende tiene ficha completa-. */
function FilaNutricion({ etiqueta, valor, unidad, campo, sangria = false }) {
  if (valor == null) return null;
  const pct = porcentajeVD(campo, valor);
  return (
    <li className={cx('flex items-center justify-between px-4 py-2.5 text-sm', sangria && 'pl-7')}>
      <span className={sangria ? 'text-humo-500' : 'text-humo-300'}>
        {sangria && '— '}
        {etiqueta}
      </span>
      <span className="flex items-center gap-3">
        <span className="font-bold tabular-nums">
          {formatearGramos(valor)}
          {unidad}
        </span>
        {pct != null && <span className="w-9 text-right text-xs text-humo-500 tabular-nums">{pct}%</span>}
      </span>
    </li>
  );
}

/** "27" en vez de "27.0", pero "27.5" se queda igual. */
function formatearGramos(valor) {
  return Number.isInteger(valor) ? valor : Number(valor.toFixed(1));
}
