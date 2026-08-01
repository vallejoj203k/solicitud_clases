import { useEffect } from 'react';
import { IconoCerrar } from './Iconos.jsx';

export const cx = (...clases) => clases.filter(Boolean).join(' ');

/**
 * Botón principal. `min-h-[52px]` no es decorativo: es el tamaño mínimo cómodo
 * para el pulgar, que es como se va a usar el 90% del tiempo.
 */
export function Boton({
  children,
  variante = 'principal',
  className = '',
  cargando = false,
  disabled,
  ...props
}) {
  const variantes = {
    principal:
      'bg-volt-500 text-carbon-900 hover:bg-volt-400 active:scale-[.98] disabled:bg-carbon-600 disabled:text-humo-500',
    secundario:
      'bg-carbon-600 text-humo-100 hover:bg-carbon-500 active:scale-[.98] disabled:text-humo-500',
    contorno:
      'border border-carbon-500 text-humo-100 hover:border-humo-500 active:scale-[.98] disabled:text-humo-500',
    peligro: 'bg-alerta/15 text-alerta border border-alerta/40 hover:bg-alerta/25 active:scale-[.98]',
    fantasma: 'text-humo-300 hover:text-humo-100 hover:bg-carbon-700',
  };

  return (
    <button
      {...props}
      disabled={disabled || cargando}
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-2xl px-5 min-h-[52px]',
        'font-semibold tracking-tight transition-all duration-150',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-volt-500 focus-visible:ring-offset-2 focus-visible:ring-offset-carbon-900',
        'disabled:cursor-not-allowed disabled:active:scale-100',
        variantes[variante],
        className
      )}
    >
      {cargando && (
        <span className="w-4 h-4 rounded-full border-2 border-current border-t-transparent animate-spin" />
      )}
      {children}
    </button>
  );
}

export function Chip({ activo, children, className = '', ...props }) {
  return (
    <button
      {...props}
      className={cx(
        'px-4 min-h-[44px] rounded-full text-sm font-semibold whitespace-nowrap transition-all',
        activo
          ? 'bg-volt-500 text-carbon-900'
          : 'bg-carbon-700 text-humo-300 hover:bg-carbon-600 border border-carbon-600',
        className
      )}
    >
      {children}
    </button>
  );
}

export function Insignia({ tono = 'neutro', children, className = '' }) {
  const tonos = {
    neutro: 'bg-carbon-600 text-humo-300',
    exito: 'bg-volt-500/15 text-volt-500 border border-volt-500/30',
    aviso: 'bg-amber-400/15 text-amber-300 border border-amber-400/30',
    peligro: 'bg-alerta/15 text-alerta border border-alerta/30',
    info: 'bg-aqua-500/15 text-aqua-500 border border-aqua-500/30',
  };
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold',
        tonos[tono],
        className
      )}
    >
      {children}
    </span>
  );
}

/**
 * Barra de ocupación: se llena a medida que se llena la clase y cambia de color
 * al acercarse al tope (lima → ámbar → rojo). El largo y el color dicen lo
 * mismo, para que no haya que interpretar dos señales distintas.
 */
export function BarraDisponibilidad({ porcentaje, agotada, className = '' }) {
  const color = agotada ? 'bg-alerta' : porcentaje >= 80 ? 'bg-amber-400' : 'bg-volt-500';

  return (
    <div className={cx('h-1.5 rounded-full bg-carbon-600 overflow-hidden', className)}>
      <div
        className={cx('h-full rounded-full transition-all duration-500', color)}
        style={{ width: `${Math.min(100, Math.max(3, porcentaje))}%` }}
      />
    </div>
  );
}

export function Cargando({ texto = 'Cargando…', className = '' }) {
  return (
    <div className={cx('flex flex-col items-center justify-center gap-3 py-16 text-humo-500', className)}>
      <span className="w-7 h-7 rounded-full border-2 border-carbon-500 border-t-volt-500 animate-spin" />
      <p className="text-sm">{texto}</p>
    </div>
  );
}

export function Vacio({ titulo, descripcion, accion }) {
  return (
    <div className="text-center py-14 px-6">
      <p className="text-lg font-semibold tracking-tight">{titulo}</p>
      {descripcion && <p className="mt-1.5 text-sm text-humo-500 max-w-xs mx-auto">{descripcion}</p>}
      {accion && <div className="mt-6 flex justify-center">{accion}</div>}
    </div>
  );
}

export function Aviso({ tono = 'peligro', children, className = '' }) {
  const tonos = {
    peligro: 'bg-alerta/10 border-alerta/30 text-alerta',
    info: 'bg-aqua-500/10 border-aqua-500/30 text-aqua-400',
    exito: 'bg-volt-500/10 border-volt-500/30 text-volt-500',
  };
  return (
    <div className={cx('rounded-2xl border px-4 py-3 text-sm animate-aparecer', tonos[tono], className)}>
      {children}
    </div>
  );
}

/**
 * Hoja inferior (bottom sheet). En móvil sube desde abajo, que es donde está el
 * pulgar; en pantallas grandes se comporta como un diálogo centrado.
 */
export function Hoja({ abierta, onCerrar, titulo, children, className = '' }) {
  useEffect(() => {
    if (!abierta) return undefined;
    const anterior = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const alPresionar = (e) => e.key === 'Escape' && onCerrar?.();
    window.addEventListener('keydown', alPresionar);
    return () => {
      document.body.style.overflow = anterior;
      window.removeEventListener('keydown', alPresionar);
    };
  }, [abierta, onCerrar]);

  if (!abierta) return null;

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
        aria-label={titulo}
        className={cx(
          'relative w-full sm:max-w-lg bg-carbon-800 border-t sm:border border-carbon-600',
          // En móvil sube desde abajo; en pantalla grande crece desde el centro.
          'rounded-t-4xl sm:rounded-3xl max-h-[92vh] overflow-y-auto',
          'animate-subirHoja sm:animate-surgir',
          className
        )}
      >
        <div className="sticky top-0 bg-carbon-800/95 backdrop-blur px-5 pt-4 pb-3 flex items-center justify-between border-b border-carbon-700">
          <div className="absolute left-1/2 -translate-x-1/2 top-1.5 w-10 h-1 rounded-full bg-carbon-600 sm:hidden" />
          <h2 className="text-lg font-bold tracking-tight mt-1">{titulo}</h2>
          <button
            onClick={onCerrar}
            aria-label="Cerrar"
            className="p-2 -mr-2 rounded-xl text-humo-500 hover:text-humo-100 hover:bg-carbon-700"
          >
            <IconoCerrar />
          </button>
        </div>
        <div className="px-5 py-4 pb-segura">{children}</div>
      </div>
    </div>
  );
}

export function Campo({ etiqueta, ayuda, error, children, className = '' }) {
  return (
    <label className={cx('block', className)}>
      <span className="etiqueta block mb-1.5">{etiqueta}</span>
      {children}
      {error ? (
        <span className="mt-1.5 block text-xs text-alerta">{error}</span>
      ) : (
        ayuda && <span className="mt-1.5 block text-xs text-humo-500">{ayuda}</span>
      )}
    </label>
  );
}

export const claseInput = cx(
  'w-full min-h-[52px] rounded-2xl bg-carbon-700 border border-carbon-600 px-4',
  'text-humo-100 placeholder:text-carbon-500 text-[16px]', // 16px evita el zoom automático en iOS
  'focus:outline-none focus:border-volt-500 focus:ring-1 focus:ring-volt-500 transition-colors'
);

export function Entrada({ className = '', ...props }) {
  return <input {...props} className={cx(claseInput, className)} />;
}

export function Seleccion({ className = '', children, ...props }) {
  return (
    <select {...props} className={cx(claseInput, 'appearance-none pr-10', className)}>
      {children}
    </select>
  );
}
