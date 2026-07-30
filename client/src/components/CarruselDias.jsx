import { useEffect, useRef } from 'react';
import { cx } from './ui.jsx';

/**
 * Carrusel horizontal de fechas (los próximos 7 días).
 * Cada chip es un objetivo táctil de 64x76 px y hace snap al centro.
 */
export default function CarruselDias({ dias, seleccionado, onSeleccionar, conteoPorDia = {} }) {
  const contenedor = useRef(null);

  // Al cambiar de día (por ejemplo al llegar desde la pantalla principal) se
  // desplaza el carrusel para que el día activo quede visible.
  useEffect(() => {
    const activo = contenedor.current?.querySelector('[data-activo="true"]');
    activo?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
  }, [seleccionado]);

  return (
    <div ref={contenedor} className="fila-scroll -mx-5 px-5 py-1">
      {dias.map((dia, indice) => {
        const activo = dia.fecha === seleccionado;
        const cantidad = conteoPorDia[dia.fecha] ?? 0;
        return (
          <button
            key={dia.fecha}
            data-activo={activo}
            onClick={() => onSeleccionar(dia.fecha)}
            className={cx(
              'snap-center shrink-0 w-[64px] py-3 rounded-2xl border transition-all duration-200',
              'flex flex-col items-center gap-0.5',
              activo
                ? 'bg-volt-500 border-volt-500 text-carbon-900'
                : 'bg-carbon-700 border-carbon-600 text-humo-300 hover:border-carbon-500',
              cantidad === 0 && !activo && 'opacity-45'
            )}
          >
            <span className="text-[10px] font-bold uppercase tracking-wider">
              {indice === 0 ? 'Hoy' : dia.diaSemana}
            </span>
            <span className="text-xl font-extrabold tracking-tightest tabular-nums leading-none">
              {dia.diaNumero}
            </span>
            <span
              className={cx(
                'text-[10px] font-medium',
                activo ? 'text-carbon-900/70' : 'text-humo-500'
              )}
            >
              {cantidad > 0 ? `${cantidad} clase${cantidad > 1 ? 's' : ''}` : '—'}
            </span>
          </button>
        );
      })}
    </div>
  );
}
