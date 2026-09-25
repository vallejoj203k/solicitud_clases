import { NOMBRE_SEGMENTO, SEGMENTOS_INFORME, type SegmentoInforme } from './cliente';
import { MAPA_CALOR } from './config';
import type { EstadoSegmento, Tarjeta } from './resultados';

/** Tarjetas de resultado: valor, tramo y, si tiene, la barra de colores con la marca del valor. */
export function TarjetasResultado({ tarjetas }: { tarjetas: Tarjeta[] }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {tarjetas.map((t) => (
        <article key={t.clave} className={`rounded-xl bg-carbon-700 p-3 ${t.escala ? 'col-span-2' : ''}`} data-tarjeta={t.clave}>
          <h3 className="text-[10px] font-semibold uppercase tracking-wider text-humo-500">{t.titulo}</h3>
          <p className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-extrabold tabular-nums" style={{ color: t.tramo?.color }}>
              {t.valor}
            </span>
            {t.unidad && <span className="text-xs text-humo-500">{t.unidad}</span>}
            {t.tramo && <span className="ml-auto text-xs font-semibold text-humo-100">{t.tramo.etiqueta}</span>}
          </p>
          {t.escala && <Escala {...t.escala} />}
          {t.detalle && <p className="mt-1.5 text-[11px] text-humo-500">{t.detalle}</p>}
        </article>
      ))}
    </div>
  );
}

function Escala({ tramos, min, max, valor }: NonNullable<Tarjeta['escala']>) {
  const pos = (x: number) => Math.min(100, Math.max(0, ((x - min) / (max - min)) * 100));
  return (
    <div className="relative mt-2" aria-hidden>
      <div className="flex h-2 overflow-hidden rounded-full">
        {tramos.map((t, i) => {
          const desde = pos(Math.max(min, t.min));
          const hasta = i + 1 < tramos.length ? pos(tramos[i + 1].min) : 100;
          return <span key={t.etiqueta} style={{ width: `${hasta - desde}%`, background: t.color }} />;
        })}
      </div>
      <span
        className="absolute -top-1 h-4 w-1 -translate-x-1/2 rounded-full bg-white shadow ring-2 ring-carbon-900"
        style={{ left: `${pos(valor)}%` }}
      />
    </div>
  );
}

const ESTADO: Record<string, string> = { bajo: 'Bajo', normal: 'Normal', alto: 'Alto' };

/** Leyenda del mapa de calor: cada segmento con su estado y el número que lo explica. */
export function LeyendaCalor({ estados, de }: { estados: Record<SegmentoInforme, EstadoSegmento>; de: 'grasa' | 'musculo' }) {
  const col = MAPA_CALOR.colores;
  return (
    <ul className="space-y-1 text-xs">
      {SEGMENTOS_INFORME.map((s) => {
        const e = estados[s];
        const estado = de === 'grasa' ? e.grasa.estado : e.musculo.estado;
        const dato =
          de === 'grasa'
            ? `${e.grasa.pct.toFixed(0)} % de grasa`
            : `${Math.round(e.musculo.relativo * 100)} % del músculo de referencia`;
        return (
          <li key={s} className="flex items-center gap-2">
            <span className="h-3 w-3 shrink-0 rounded-sm" style={{ background: col[estado] }} />
            <span className="w-28 shrink-0 text-humo-300">{NOMBRE_SEGMENTO[s]}</span>
            <span className="font-semibold text-humo-100">{ESTADO[estado]}</span>
            <span className="ml-auto text-humo-500 tabular-nums">{dato}</span>
          </li>
        );
      })}
    </ul>
  );
}
