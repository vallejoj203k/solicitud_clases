import { NavLink, Navigate, Outlet, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client.js';
import { borrarToken, leerToken } from '../../lib/sesion.js';
import { Cargando, cx } from '../../components/ui.jsx';
import {
  IconoPanel,
  IconoCalendario,
  IconoDinero,
  IconoUsuario,
  IconoRayo,
} from '../../components/Iconos.jsx';

const SECCIONES = [
  { a: '/admin', texto: 'Resumen', Icono: IconoPanel, exacto: true },
  { a: '/admin/clases', texto: 'Clases', Icono: IconoCalendario },
  { a: '/admin/pagos', texto: 'Pagos', Icono: IconoDinero },
  { a: '/admin/clientes', texto: 'Clientes', Icono: IconoUsuario },
];

/**
 * Envoltura de las rutas /admin. Verifica el token contra la API antes de
 * mostrar nada: si caducó, devuelve al login en vez de dejar pantallas vacías.
 */
export default function AdminLayout() {
  const navegar = useNavigate();
  const hayToken = Boolean(leerToken('admin'));

  const { data: yo, isLoading, isError } = useQuery({
    queryKey: ['adminYo'],
    queryFn: api.admin.yo,
    enabled: hayToken,
    retry: false,
  });

  if (!hayToken) return <Navigate to="/admin/login" replace />;
  if (isLoading) return <Cargando texto="Verificando sesión…" />;
  if (isError || yo?.rol !== 'ADMIN') {
    borrarToken('admin');
    return <Navigate to="/admin/login" replace />;
  }

  const salir = () => {
    borrarToken('admin');
    navegar('/admin/login', { replace: true });
  };

  return (
    <div className="min-h-dvh md:flex">
      {/* Barra lateral en escritorio */}
      <aside className="hidden md:flex md:w-60 md:flex-col border-r border-carbon-700 bg-carbon-800 p-4">
        <div className="flex items-center gap-2 px-2 py-3">
          <span className="p-2 rounded-xl bg-volt-500 text-carbon-900">
            <IconoRayo className="w-4 h-4" />
          </span>
          <span className="font-extrabold tracking-tightest">Panel</span>
        </div>
        <nav className="mt-4 space-y-1">
          {SECCIONES.map(({ a, texto, Icono, exacto }) => (
            <NavLink
              key={a}
              to={a}
              end={exacto}
              className={({ isActive }) =>
                cx(
                  'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-colors',
                  isActive ? 'bg-carbon-600 text-humo-100' : 'text-humo-500 hover:text-humo-100 hover:bg-carbon-700'
                )
              }
            >
              <Icono className="w-5 h-5" />
              {texto}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto px-3 py-3 border-t border-carbon-700">
          <p className="text-xs text-humo-500 truncate">{yo.nombre}</p>
          <button onClick={salir} className="mt-1 text-xs font-semibold text-alerta hover:underline">
            Cerrar sesión
          </button>
        </div>
      </aside>

      <div className="flex-1 min-w-0 pb-24 md:pb-0">
        <Outlet context={{ yo, salir }} />
      </div>

      {/* Barra inferior en móvil: navegación al alcance del pulgar. */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-carbon-800/95 backdrop-blur border-t border-carbon-700 pb-segura">
        <div className="grid grid-cols-4">
          {SECCIONES.map(({ a, texto, Icono, exacto }) => (
            <NavLink
              key={a}
              to={a}
              end={exacto}
              className={({ isActive }) =>
                cx(
                  'flex flex-col items-center gap-1 py-2.5 text-[11px] font-semibold transition-colors',
                  isActive ? 'text-volt-500' : 'text-humo-500'
                )
              }
            >
              <Icono className="w-5 h-5" />
              {texto}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}

/** Cabecera reutilizable de las pantallas del panel. */
export function CabeceraAdmin({ titulo, descripcion, acciones }) {
  return (
    <header className="px-5 md:px-8 pt-6 pb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tightest">{titulo}</h1>
        {descripcion && <p className="mt-1 text-sm text-humo-500">{descripcion}</p>}
      </div>
      {acciones && <div className="flex flex-wrap gap-2">{acciones}</div>}
    </header>
  );
}
