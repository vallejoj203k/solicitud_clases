import { cx } from './ui.jsx';
import { IconoAtras, IconoFlecha } from './Iconos.jsx';

/**
 * Calendario del mes para elegir el día de la reserva.
 *
 * Sustituye al carrusel de siete días: con la programación repartida en varias
 * semanas, el carrusel obligaba a arrastrar a ciegas para descubrir si había
 * clase el jueves siguiente. Aquí el mes entero se ve de un golpe y los días sin
 * clase no se pueden tocar.
 *
 * Las fechas son texto "YYYY-MM-DD" y la rejilla se arma con aritmética en UTC:
 * construirla con fechas locales corre un día en cuanto el navegador está en
 * otra zona horaria que el gimnasio.
 */

const DIAS_SEMANA = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

export function semanasDelMes(anio, mes) {
  const primero = new Date(Date.UTC(anio, mes, 1));
  // getUTCDay: 0 = domingo. Se corre para que la semana empiece en lunes.
  const desplazamiento = (primero.getUTCDay() + 6) % 7;
  const dias = [];
  for (let i = 0; i < 42; i += 1) {
    const fecha = new Date(Date.UTC(anio, mes, 1 - desplazamiento + i));
    dias.push({
      fecha: fecha.toISOString().slice(0, 10),
      dia: fecha.getUTCDate(),
      delMes: fecha.getUTCMonth() === mes,
    });
  }
  const semanas = [];
  for (let i = 0; i < dias.length; i += 7) semanas.push(dias.slice(i, i + 7));
  return semanas.filter((s) => s.some((d) => d.delMes));
}

export default function CalendarioDias({
  anio,
  mes,
  onMover,
  puedeRetroceder,
  conteoPorDia = {},
  seleccionado,
  onSeleccionar,
  hoy,
  acento = '#C8F751',
}) {
  const semanas = semanasDelMes(anio, mes);
  const nombreMes = new Intl.DateTimeFormat('es-CO', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(anio, mes, 1)));

  return (
    <div className="tarjeta overflow-hidden">
      <div className="flex items-center justify-between px-2 py-2 border-b border-carbon-600">
        <button
          onClick={() => onMover(-1)}
          disabled={!puedeRetroceder}
          aria-label="Mes anterior"
          className="p-2.5 rounded-xl text-humo-300 hover:bg-carbon-700 active:scale-95 disabled:opacity-30 disabled:hover:bg-transparent"
        >
          <IconoAtras className="w-5 h-5" />
        </button>
        <span className="text-sm font-bold tracking-tight first-letter:uppercase">{nombreMes}</span>
        <button
          onClick={() => onMover(1)}
          aria-label="Mes siguiente"
          className="p-2.5 rounded-xl text-humo-300 hover:bg-carbon-700 active:scale-95"
        >
          <IconoFlecha className="w-5 h-5" />
        </button>
      </div>

      <div className="grid grid-cols-7 px-1 pt-1.5">
        {DIAS_SEMANA.map((d) => (
          <span key={d} className="py-1 text-center text-[10px] font-bold text-humo-500">
            {d}
          </span>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-0.5 p-1 pt-0">
        {semanas.flat().map((celda) => {
          const cantidad = conteoPorDia[celda.fecha] ?? 0;
          const activo = celda.fecha === seleccionado;
          const disponible = cantidad > 0;
          return (
            <button
              key={celda.fecha}
              data-activo={activo}
              disabled={!disponible}
              onClick={() => onSeleccionar(celda.fecha)}
              aria-label={`${celda.fecha}${disponible ? `, ${cantidad} clases` : ', sin clases'}`}
              className={cx(
                // 44 px de alto: el mínimo cómodo para el dedo.
                'relative h-11 rounded-xl flex flex-col items-center justify-center transition-all',
                'text-sm font-bold tabular-nums',
                activo && 'text-carbon-900 scale-105',
                !activo && disponible && 'text-humo-100 bg-carbon-700 hover:bg-carbon-600 active:scale-95',
                !activo && !disponible && celda.delMes && 'text-carbon-500',
                !activo && !disponible && !celda.delMes && 'text-carbon-600/60',
                celda.fecha === hoy && !activo && 'ring-1 ring-inset ring-carbon-500'
              )}
              style={activo ? { backgroundColor: acento } : undefined}
            >
              {celda.dia}
              {/* Punto de "hay clases": el color dice disciplina, el punto dice
                  que ese día se puede reservar. */}
              {disponible && !activo && (
                <span
                  className="absolute bottom-1 w-1 h-1 rounded-full"
                  style={{ backgroundColor: acento }}
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
