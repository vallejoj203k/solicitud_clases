import { BarraDisponibilidad, Insignia, cx } from './ui.jsx';
import { hora12 } from '../lib/formato.js';

/**
 * Un horario dentro de la lista del día. Muestra de un vistazo qué tan llena
 * está la clase: número de cupos + barra de color.
 */
export default function TarjetaHorario({ clase, onSeleccionar, seleccionada = false, compacta = false }) {
  const acento = clase.tipoClase.color;
  const deshabilitada = clase.agotada;

  return (
    <button
      type="button"
      disabled={deshabilitada}
      onClick={() => onSeleccionar?.(clase)}
      style={seleccionada ? { borderColor: acento } : undefined}
      className={cx(
        'w-full text-left rounded-2xl border p-4 transition-all duration-150',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-volt-500',
        seleccionada
          ? 'bg-carbon-600 shadow-alzado'
          : 'bg-carbon-700 border-carbon-600 hover:border-carbon-500 active:scale-[.99]',
        deshabilitada && 'opacity-50 cursor-not-allowed hover:border-carbon-600 active:scale-100'
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-baseline gap-2">
            <span className="text-xl font-extrabold tracking-tightest tabular-nums">
              {hora12(clase.hora)}
            </span>
            {!compacta && (
              <span className="text-xs text-humo-500">{clase.duracionMin} min</span>
            )}
          </div>
          <p className="mt-0.5 text-sm text-humo-500 truncate">
            {clase.instructor?.nombre ?? 'Por asignar'}
            {compacta && ` · ${clase.tipoClase.nombre}`}
          </p>
        </div>

        <div className="shrink-0 text-right">
          {deshabilitada ? (
            <Insignia tono="peligro">Agotada</Insignia>
          ) : clase.casiLlena ? (
            <Insignia tono="aviso">
              Quedan {clase.disponibles}
            </Insignia>
          ) : (
            <span className="text-sm font-semibold tabular-nums" style={{ color: acento }}>
              {clase.disponibles}
              <span className="text-humo-500 font-normal"> libres</span>
            </span>
          )}
        </div>
      </div>

      <BarraDisponibilidad
        porcentaje={clase.porcentajeOcupacion}
        agotada={clase.agotada}
        className="mt-3"
      />
    </button>
  );
}
