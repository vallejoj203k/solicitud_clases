import type { Residuo } from './ajuste';
import { useVisor } from './estado';

/**
 * Qué tan bien quedó el cuerpo respecto de los datos: cada objetivo con su valor
 * buscado, lo que mide la malla y, si no se alcanzó, en palabras ("la cadera
 * quedó 3,0 cm por debajo de lo medido").
 */

const num = (x: number, d = 1) => x.toFixed(d).replace('.', ',');

function explicar(r: Residuo): string {
  const cuanto = `${num(Math.abs(r.diferencia))} ${r.unidad}`;
  const lado = r.diferencia < 0 ? 'por debajo' : 'por encima';
  const de = r.fuente === 'cinta' ? 'de lo medido' : r.fuente === 'estimado' ? 'de lo estimado' : 'del dato del scanner';
  return `${r.etiqueta} quedó ${cuanto} ${lado} ${de}.`;
}

export function ResumenAjuste() {
  const ajuste = useVisor((s) => s.ajuste);
  const ajustando = useVisor((s) => s.ajustando);
  const origen = useVisor((s) => s.origen);
  const aplicarAjuste = useVisor((s) => s.aplicarAjuste);

  if (!ajuste) {
    return (
      <p className="rounded-xl border border-carbon-600 px-3 py-2.5 text-xs text-humo-300" role="status">
        {ajustando ? 'Armando el cuerpo…' : 'Escribe la estatura y el peso: con eso ya se arma el cuerpo 3D. Cada medida con cinta lo acerca más.'}
      </p>
    );
  }

  const visibles = (rs: Residuo[]) => rs.filter((r) => r.fuente !== 'anterior');
  const grupos: [string, Residuo[]][] = [['Cuerpo completo', visibles(ajuste.exterior.residuos)]];
  if (ajuste.magro) grupos.push(['Cuerpo sin grasa (músculo, hueso, órganos)', visibles(ajuste.magro.residuos)]);
  const todos = grupos.flatMap(([, rs]) => rs);
  const fallan = todos.filter((r) => !r.cumple);
  return (
    <div
      className={`space-y-2 rounded-xl border px-3 py-2.5 text-xs ${fallan.length ? 'border-amber-400/50 bg-amber-400/10' : 'border-[#8CC63F]/50 bg-[#8CC63F]/10'}`}
      role="status"
      aria-live="polite"
    >
      <p className="font-semibold text-humo-100">
        {fallan.length
          ? `⚠ El cuerpo no alcanzó ${fallan.length} de ${todos.length} objetivos`
          : `✓ El cuerpo cumple los ${todos.length} objetivos`}
        <span className="font-normal text-humo-500"> · {ajustando ? 'ajustando…' : `${Math.round(ajuste.ms)} ms`}</span>
      </p>
      {fallan.map((r) => (
        <p key={r.etiqueta} className="text-amber-100">
          {explicar(r)}
        </p>
      ))}
      <details>
        <summary className="cursor-pointer text-humo-300">Ver cada objetivo</summary>
        <table className="mt-1.5 w-full tabular-nums">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-wider text-humo-500">
              <th className="font-semibold">Objetivo</th>
              <th className="text-right font-semibold">Dato</th>
              <th className="text-right font-semibold">Modelo</th>
              <th />
            </tr>
          </thead>
          {grupos.map(([titulo, rs]) => (
            <tbody key={titulo}>
              <tr>
                <td colSpan={4} className="pt-2 text-[10px] font-semibold uppercase tracking-wider text-humo-500">
                  {titulo}
                </td>
              </tr>
              {rs.map((r) => (
                <tr key={r.clave} className="border-t border-carbon-600/60">
                  <td className="py-1 pr-2 text-humo-300">
                    {r.etiqueta}
                    {r.fuente === 'estimado' && <span className="text-humo-500"> (estimado)</span>}
                  </td>
                  <td className="py-1 text-right">
                    {num(r.objetivo)} {r.unidad}
                  </td>
                  <td className="py-1 text-right">
                    {num(r.medido)} {r.unidad}
                  </td>
                  <td className="py-1 pl-2 text-right">{r.cumple ? '✓' : '⚠'}</td>
                </tr>
              ))}
            </tbody>
          ))}
        </table>
      </details>
      {origen === 'manual' && (
        <p className="text-humo-300">
          Moviste controles a mano: el cuerpo ya no es el ajustado.{' '}
          <button type="button" onClick={() => aplicarAjuste(ajuste)} className="font-semibold text-[#B5E37A] underline">
            Volver al ajuste
          </button>
        </p>
      )}
    </div>
  );
}
