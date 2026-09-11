import { useEffect, useRef, useState } from 'react';
import { NavLink, Navigate, Outlet, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client.js';
import { borrarToken, leerToken } from '../../lib/sesion.js';
import { Cargando, cx } from '../../components/ui.jsx';
import { pesos, hora12, fechaLarga } from '../../lib/formato.js';
import {
  IconoPanel,
  IconoCalendario,
  IconoDinero,
  IconoUsuario,
  IconoRayo,
  IconoBuscar,
  IconoMusica,
  IconoCerrar,
  IconoTienda,
} from '../../components/Iconos.jsx';

/**
 * Timbre corto para el aviso de pago, con la API de audio del navegador.
 *
 * SIN ARCHIVO DE SONIDO A PROPOSITO: dos tonos generados son suficientes para
 * un timbre de mostrador y evitan cargar un audio de más. Si el navegador
 * bloquea el audio -sin gesto previo del usuario, o uno muy viejo- el aviso
 * visual sigue apareciendo igual; el sonido es un extra, no la única señal.
 */
function reproducirTimbre() {
  try {
    const Contexto = window.AudioContext || window.webkitAudioContext;
    const ctx = new Contexto();
    const ahora = ctx.currentTime;
    [0, 0.16].forEach((retraso, i) => {
      const osc = ctx.createOscillator();
      const ganancia = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = i === 0 ? 880 : 1046.5; // La5, luego Do6: un "ding-ding".
      ganancia.gain.setValueAtTime(0, ahora + retraso);
      ganancia.gain.linearRampToValueAtTime(0.2, ahora + retraso + 0.02);
      ganancia.gain.exponentialRampToValueAtTime(0.0001, ahora + retraso + 0.16);
      osc.connect(ganancia).connect(ctx.destination);
      osc.start(ahora + retraso);
      osc.stop(ahora + retraso + 0.17);
    });
    setTimeout(() => ctx.close().catch(() => {}), 500);
  } catch {
    // Sin Web Audio: el aviso visual basta.
  }
}

/** Cuánto se queda un aviso de pago en pantalla antes de irse solo. */
const MS_AVISO_PAGO = 12_000;

const SECCIONES = [
  { a: '/admin', texto: 'Resumen', Icono: IconoPanel, exacto: true },
  // `avisa: true` -> lleva el contador de pagos por confirmar.
  { a: '/admin/recepcion', texto: 'Recepción', Icono: IconoBuscar, avisa: true },
  { a: '/admin/clases', texto: 'Clases', Icono: IconoCalendario },
  { a: '/admin/musica', texto: 'Música', Icono: IconoMusica },
  { a: '/admin/tienda', texto: 'Tienda', Icono: IconoTienda },
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

  // Pagos por confirmar, consultados desde el layout para que el aviso se vea
  // en CUALQUIER pantalla del panel, no solo en Recepción. Comparte clave de
  // caché con esa pantalla, así que abrirla no dispara una segunda consulta.
  const { data: porConfirmar } = useQuery({
    queryKey: ['adminPagosPorConfirmar'],
    queryFn: api.admin.pagosPorConfirmar,
    enabled: hayToken,
    retry: false,
    refetchInterval: 10_000,
    // Sigue contando aunque la pestaña esté en segundo plano: la tablet del
    // mostrador pasa el día con esta app abierta y sin tocar.
    refetchIntervalInBackground: true,
  });

  // Cuentan los que ya avisaron -tienen a alguien esperando- y los que quedaron
  // en conflicto, que necesitan una decisión: devolver o reubicar.
  const avisos = (porConfirmar ?? []).filter((p) => p.avisoPagoEn || p.notasPago).length;

  // Timbre y aviso flotante cuando alguien toca "Ya transferí".
  //
  // SE DISPARA POR TRANSICIÓN, no por presencia: `porConfirmar` trae TODAS las
  // reservas pendientes de pago desde que se crean, hayan avisado o no, así
  // que un id nuevo en la lista no significa que acaben de pagar. Lo que
  // importa es que `avisoPagoEn` pase de vacío a puesto entre una consulta y
  // la siguiente -eso es exactamente el instante del botón-.
  //
  // La primera carga NO suena nada: es la base de comparación, no hay "nuevo"
  // todavía. Si sonara ahí, cada vez que el admin abre el panel con gente ya
  // esperando desde antes, oiría un timbre por cada una.
  const vistos = useRef(null);
  const [avisosFlotantes, setAvisosFlotantes] = useState([]);

  useEffect(() => {
    if (!porConfirmar) return;
    const anteriores = vistos.current;
    if (anteriores) {
      for (const p of porConfirmar) {
        if (p.avisoPagoEn && !anteriores.get(p.id)) {
          reproducirTimbre();
          setAvisosFlotantes((lista) => [...lista, p]);
          setTimeout(() => {
            setAvisosFlotantes((lista) => lista.filter((x) => x.id !== p.id));
          }, MS_AVISO_PAGO);
        }
      }
    }
    vistos.current = new Map(porConfirmar.map((p) => [p.id, p.avisoPagoEn]));
  }, [porConfirmar]);

  const cerrarAvisoFlotante = (id) =>
    setAvisosFlotantes((lista) => lista.filter((x) => x.id !== id));

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
          {SECCIONES.map((seccion) => (
            <NavLink
              key={seccion.a}
              to={seccion.a}
              end={seccion.exacto}
              className={({ isActive }) =>
                cx(
                  'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-colors',
                  isActive ? 'bg-carbon-600 text-humo-100' : 'text-humo-500 hover:text-humo-100 hover:bg-carbon-700'
                )
              }
            >
              <seccion.Icono className="w-5 h-5" />
              {seccion.texto}
              {seccion.avisa && avisos > 0 && <Contador n={avisos} className="ml-auto" />}
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
        <div className="grid grid-cols-7">
          {SECCIONES.map((seccion) => (
            <NavLink
              key={seccion.a}
              to={seccion.a}
              end={seccion.exacto}
              className={({ isActive }) =>
                cx(
                  'relative flex flex-col items-center gap-1 py-2.5 text-[11px] font-semibold transition-colors',
                  isActive ? 'text-volt-500' : 'text-humo-500'
                )
              }
            >
              <span className="relative">
                <seccion.Icono className="w-5 h-5" />
                {seccion.avisa && avisos > 0 && (
                  <Contador n={avisos} className="absolute -top-2 -right-3" />
                )}
              </span>
              {seccion.texto}
            </NavLink>
          ))}
        </div>
      </nav>

      {/* Avisos de pago, flotando sobre CUALQUIER pantalla del panel.
          Arriba a la derecha: no choca con la barra lateral ni con la barra
          inferior del móvil, y es donde se mira primero en un panel de admin. */}
      {avisosFlotantes.length > 0 && (
        <div className="fixed top-4 right-4 z-50 w-[min(92vw,360px)] space-y-2">
          {avisosFlotantes.map((p) => (
            <AvisoPagoFlotante key={p.id} pago={p} onCerrar={() => cerrarAvisoFlotante(p.id)} />
          ))}
        </div>
      )}
    </div>
  );
}

/** Un pago recién avisado, flotando encima del panel hasta que se cierre solo. */
function AvisoPagoFlotante({ pago, onCerrar }) {
  return (
    <div className="tarjeta p-4 border-volt-500/50 bg-carbon-800 shadow-2xl animate-aparecer">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="etiqueta text-volt-500">Alguien acaba de pagar</p>
          <p className="mt-1 font-bold tracking-tight truncate">{pago.usuario.nombre}</p>
          <p className="mt-1 text-sm text-humo-300">
            <span
              className="inline-block w-2 h-2 rounded-full mr-1.5 align-middle"
              style={{ backgroundColor: pago.clase.color }}
            />
            {pago.clase.tipoClase} · {fechaLarga(pago.clase.fecha)} · {hora12(pago.clase.hora)}
          </p>
          <p className="text-xs text-humo-500">Puesto {pago.puestoCodigo}</p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-lg font-extrabold tabular-nums leading-none">{pesos(pago.montoCop)}</p>
          <button
            onClick={onCerrar}
            aria-label="Cerrar aviso"
            className="mt-2 p-1 rounded-lg text-humo-500 hover:text-humo-100 hover:bg-carbon-700"
          >
            <IconoCerrar className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Contador de avisos. Late al aparecer para que se note desde el otro lado del
 * mostrador sin quedarse animando para siempre.
 */
function Contador({ n, className = '' }) {
  return (
    <span
      aria-label={`${n} pago${n === 1 ? '' : 's'} por confirmar`}
      className={cx(
        'inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full',
        'bg-volt-500 text-carbon-900 text-[11px] font-extrabold tabular-nums animate-latido',
        className
      )}
    >
      {n > 9 ? '9+' : n}
    </span>
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
