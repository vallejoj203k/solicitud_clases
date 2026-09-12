import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client.js';
import { Cargando, Aviso, Vacio, Hoja } from '../components/ui.jsx';
import { IconoAtras, IconoTienda } from '../components/Iconos.jsx';
import { pesos } from '../lib/formato.js';
import { rutaInicio } from '../lib/tablet.js';

/**
 * Vidriera de la tienda. SOLO INFORMATIVA: se ve la foto, la descripción, los
 * macros y el precio de cada producto, y se compra en el mostrador -no hay
 * carrito ni pago aquí-. Por eso no exige sesión ni dispositivo: es la misma
 * vista para cualquiera.
 */
export default function Tienda() {
  const [abierto, setAbierto] = useState(null);

  const { data: productos, isLoading, error } = useQuery({
    queryKey: ['productos'],
    queryFn: api.productos,
    staleTime: 60_000,
  });

  return (
    <div className="min-h-dvh pb-10">
      <header className="px-5 pt-6 pb-4 flex items-center gap-3">
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

      <main className="px-5">
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
          <div className="grid grid-cols-2 gap-3">
            {productos.map((p) => (
              <TarjetaProducto key={p.id} producto={p} onAbrir={() => setAbierto(p)} />
            ))}
          </div>
        )}
      </main>

      {abierto && <FichaProducto producto={abierto} onCerrar={() => setAbierto(null)} />}
    </div>
  );
}

function TarjetaProducto({ producto, onAbrir }) {
  return (
    <button
      onClick={onAbrir}
      className="text-left rounded-3xl overflow-hidden border border-carbon-600 bg-carbon-800 active:scale-[.98] transition-transform"
    >
      <div className="aspect-square bg-carbon-700 flex items-center justify-center">
        {producto.foto ? (
          <img src={producto.foto} alt="" className="w-full h-full object-cover" />
        ) : (
          <IconoTienda className="w-8 h-8 text-humo-500" />
        )}
      </div>
      <div className="p-3">
        <p className="font-bold tracking-tight text-sm truncate">{producto.nombre}</p>
        <p className="mt-0.5 text-sm font-extrabold text-volt-500">{pesos(producto.precioCop)}</p>
      </div>
    </button>
  );
}

function FichaProducto({ producto, onCerrar }) {
  return (
    <Hoja abierta onCerrar={onCerrar} titulo={producto.nombre}>
      <div className="space-y-4">
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

        {producto.macros?.length > 0 && (
          <div>
            <p className="etiqueta mb-2">Información nutricional</p>
            <ul className="rounded-2xl border border-carbon-600 divide-y divide-carbon-700 overflow-hidden">
              {producto.macros.map((m, i) => (
                <li key={i} className="flex items-center justify-between px-4 py-2.5 text-sm">
                  <span className="text-humo-300">{m.nombre}</span>
                  <span className="font-bold">{m.valor}</span>
                </li>
              ))}
            </ul>
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
