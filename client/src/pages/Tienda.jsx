import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client.js';
import { Cargando, Aviso, Vacio, cx } from '../components/ui.jsx';
import { IconoAtras, IconoTienda, IconoFlecha, IconoCerrar } from '../components/Iconos.jsx';
import { pesos } from '../lib/formato.js';
import { rutaInicio } from '../lib/tablet.js';

/**
 * Vidriera de la tienda. SOLO INFORMATIVA: se ve la foto, la descripción y el
 * precio de cada producto, y se compra en el mostrador -no hay carrito ni
 * pago aquí-. Por eso no exige sesión ni dispositivo: es la misma vista para
 * cualquiera.
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
 *
 * Solo nombre y precio: nada de categoría ni datos nutricionales encima de
 * la foto.
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
          <span className="font-bold text-volt-500 text-sm">{pesos(producto.precioCop)}</span>
          <span className="shrink-0 p-1.5 rounded-full bg-carbon-900/70 text-humo-100 border border-white/10">
            <IconoFlecha className="w-3.5 h-3.5" />
          </span>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------- La ficha */

/**
 * A diferencia del resto de las "hojas" de la app (que suben desde abajo, en
 * una sola columna), esta ficha va a dos columnas en pantallas anchas -foto a
 * la derecha, a todo el alto- porque así se ve el catálogo de referencia. En
 * un teléfono angosto, foto y contenido no caben lado a lado: la foto pasa
 * arriba, del ancho de la pantalla, y el contenido queda debajo.
 *
 * Solo nombre, descripción y precio: sin categoría, macros ni insignias.
 */
function FichaProducto({ producto, onCerrar }) {
  useEffect(() => {
    const anterior = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const alPresionar = (e) => e.key === 'Escape' && onCerrar();
    window.addEventListener('keydown', alPresionar);
    return () => {
      document.body.style.overflow = anterior;
      window.removeEventListener('keydown', alPresionar);
    };
  }, [onCerrar]);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center sm:justify-center">
      <button
        aria-label="Cerrar"
        onClick={onCerrar}
        className="absolute inset-0 bg-carbon-950/70 backdrop-blur-sm animate-aparecer"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={producto.nombre}
        className={cx(
          'relative w-full sm:max-w-3xl bg-carbon-800 border-t sm:border border-carbon-600',
          'rounded-t-4xl sm:rounded-3xl max-h-[92vh] md:h-[520px]',
          'overflow-y-auto md:overflow-hidden flex flex-col md:flex-row',
          'animate-subirHoja sm:animate-surgir'
        )}
      >
        <button
          onClick={onCerrar}
          aria-label="Cerrar"
          className="absolute top-3 right-3 z-30 p-2 rounded-full bg-carbon-900/70 backdrop-blur text-humo-100 hover:bg-carbon-700 active:scale-95"
        >
          <IconoCerrar className="w-4 h-4" />
        </button>

        {/* Foto: arriba del todo en un teléfono, a la derecha y a todo el
            alto en una pantalla ancha. */}
        <div className="relative shrink-0 md:order-2 md:w-[46%] md:h-full">
          {producto.foto ? (
            <img
              src={producto.foto}
              alt=""
              className="w-full aspect-video md:aspect-auto md:h-full object-cover bg-carbon-700"
            />
          ) : (
            <div className="w-full aspect-video md:aspect-auto md:h-full bg-carbon-700 flex items-center justify-center">
              <IconoTienda className="w-10 h-10 text-humo-500" />
            </div>
          )}
        </div>

        <div className="md:order-1 md:w-[54%] md:h-full md:overflow-y-auto p-5 sm:p-6 space-y-4">
          <h2 className="text-2xl font-extrabold tracking-tightest">{producto.nombre}</h2>

          <p className="text-sm text-humo-300 leading-relaxed whitespace-pre-line">
            {producto.descripcion}
          </p>

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
      </div>
    </div>
  );
}
