import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { IconoAtras } from '../components/Iconos.jsx';
import type { ClienteInput, SegmentoInforme } from './cliente';
import { CIRCUNFERENCIAS, COLOR_GRASA_MUCHA, COLOR_GRASA_POCA, COLOR_MAGRO, COLOR_SEGMENTO, MAPA_CALOR } from './config';
import { controlesLocales, type ControlLocal } from './controles';
import { useVisor, type Vista } from './estado';
import { FormularioMedidas, FormularioScanner } from './FormularioScanner';
import type { ResultadoMotor } from './motor.worker';
import { ResumenAjuste } from './ResumenAjuste';
import type { EstadoSegmento, Tarjeta } from './resultados';
import { LeyendaCalor, TarjetasResultado } from './TarjetasResultado';
import type { CuerpoBase, Sexo } from './tipos';

/**
 * Panel lateral (abajo en el teléfono): sexo, modo de vista y sus opciones, y
 * las pestañas con el resultado, los datos del scanner, las medidas con cinta y
 * el ajuste manual de los controles.
 */

const TITULO_GRUPO: Record<string, string> = {
  segmento: 'Segmentos (grasa / músculo)',
  torso: 'Torso',
  medida: 'Medidas',
  musculo: 'Músculo',
  grasa: 'Grasa',
};

type Pestana = 'resultado' | 'scanner' | 'medidas' | 'manual';
const PESTANAS: [Pestana, string][] = [
  ['resultado', 'Resultado'],
  ['scanner', 'Datos del scanner'],
  ['medidas', 'Medidas'],
  ['manual', 'Ajuste manual'],
];

const VISTAS: [Vista, string][] = [
  ['grasa', 'Grasa y músculo'],
  ['realista', 'Realista'],
  ['calor', 'Mapa de calor'],
  ['comparar', 'Comparar'],
];

export interface DatosPanel {
  cuerpo: CuerpoBase | null;
  resultado: ResultadoMotor | null;
  cliente: ClienteInput | null;
  tarjetas: Tarjeta[];
  estados: Record<SegmentoInforme, EstadoSegmento> | null;
  /** Resumen del cuerpo objetivo (null si el informe no trae controles). */
  resumenObjetivo: string | null;
}

export function Panel(props: DatosPanel) {
  const { cuerpo, resultado, cliente, tarjetas } = props;
  const { sexo, setSexo, vista, verAnillos, set } = useVisor();
  const [pestana, setPestana] = useState<Pestana>('scanner');

  return (
    <aside className="flex-1 md:landscape:flex-none md:landscape:w-[27rem] min-h-0 overflow-y-auto border-t md:landscape:border-t-0 md:landscape:border-l border-carbon-700 bg-carbon-800">
      <div className="p-5 space-y-5">
        <header className="flex items-center gap-3">
          <Link
            to="/composicion-corporal"
            aria-label="Volver a composición corporal"
            className="p-2 -ml-2 rounded-xl text-humo-300 hover:bg-carbon-700"
          >
            <IconoAtras />
          </Link>
          <div className="min-w-0">
            <h1 className="text-lg font-extrabold tracking-tightest">Resultado 3D</h1>
            <p className="truncate text-xs text-humo-500">{cliente?.nombre ?? 'Gimnasio Mega Vital'}</p>
          </div>
        </header>

        <div className="grid grid-cols-2 gap-2" role="group" aria-label="Sexo">
          {(['M', 'F'] as Sexo[]).map((s) => (
            <button
              key={s}
              onClick={() => setSexo(s)}
              aria-pressed={sexo === s}
              className={`rounded-xl py-2.5 text-sm font-semibold border ${
                sexo === s ? 'bg-volt-500 text-carbon-900 border-volt-500' : 'border-carbon-600 text-humo-300'
              }`}
            >
              {s === 'M' ? 'Hombre' : 'Mujer'}
            </button>
          ))}
        </div>

        <section className="space-y-3" aria-label="Vista del modelo">
          <div className="grid grid-cols-2 gap-1.5">
            {VISTAS.map(([clave, titulo]) => (
              <button
                key={clave}
                type="button"
                aria-pressed={vista === clave}
                onClick={() => set({ vista: clave })}
                className={`rounded-lg border px-2 py-2 text-xs font-semibold ${
                  vista === clave
                    ? 'border-[#8CC63F] bg-[#8CC63F]/15 text-[#B5E37A]'
                    : 'border-carbon-600 text-humo-300 hover:text-humo-100'
                }`}
              >
                {titulo}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-2 text-xs text-humo-300">
            <input type="checkbox" checked={verAnillos} onChange={(e) => set({ verAnillos: e.target.checked })} />
            Anillos de medida (con su valor en cm)
          </label>
          <OpcionesVista {...props} />
        </section>

        <div className="grid grid-cols-4 gap-1 rounded-xl bg-carbon-900 p-1" role="tablist" aria-label="Secciones del panel">
          {PESTANAS.map(([clave, titulo], i) => (
            <button
              key={clave}
              id={`pestana-${clave}`}
              role="tab"
              aria-selected={pestana === clave}
              aria-controls="panel-pestana"
              tabIndex={pestana === clave ? 0 : -1}
              onClick={() => setPestana(clave)}
              onKeyDown={(e) => {
                // Flechas / Inicio / Fin recorren las pestañas (patrón de pestañas de WAI-ARIA).
                const n = PESTANAS.length;
                const destino =
                  e.key === 'ArrowRight'
                    ? (i + 1) % n
                    : e.key === 'ArrowLeft'
                      ? (i + n - 1) % n
                      : e.key === 'Home'
                        ? 0
                        : e.key === 'End'
                          ? n - 1
                          : -1;
                if (destino < 0) return;
                e.preventDefault();
                setPestana(PESTANAS[destino][0]);
                document.getElementById(`pestana-${PESTANAS[destino][0]}`)?.focus();
              }}
              className={`rounded-lg px-1 py-2 text-[11px] font-semibold leading-tight ${
                pestana === clave ? 'bg-carbon-600 text-humo-100' : 'text-humo-500 hover:text-humo-300'
              }`}
            >
              {titulo}
            </button>
          ))}
        </div>

        <div id="panel-pestana" role="tabpanel" aria-labelledby={`pestana-${pestana}`} className="space-y-5">
          {pestana !== 'manual' && <ResumenAjuste />}
          {pestana === 'resultado' &&
            (cliente ? (
              <TarjetasResultado tarjetas={tarjetas} />
            ) : (
              <p className="rounded-xl border border-carbon-600 px-3 py-2.5 text-xs text-humo-300">
                Las tarjetas de resultado aparecen cuando están los datos obligatorios del scanner (estatura, peso, grasa y el
                músculo y la grasa de brazos y piernas).{' '}
                <button type="button" className="font-semibold text-[#B5E37A] underline" onClick={() => setPestana('scanner')}>
                  Ir a los datos
                </button>
              </p>
            ))}
          {pestana === 'scanner' && <FormularioScanner onVerResultado={() => setPestana('resultado')} />}
          {pestana === 'medidas' && (
            <>
              <ModoMedidas />
              <FormularioMedidas />
            </>
          )}
          {pestana === 'manual' && <AjusteManual cuerpo={cuerpo} resultado={resultado} />}
        </div>

        <p className="text-[11px] text-humo-500">Datos de referencia deportiva, no para fines médicos.</p>
        <p className="text-[11px] text-humo-500">Modelo del cuerpo esculpido: Floriane Legros-Collard (Sketchfab), adaptado a cada cliente.</p>
      </div>
    </aside>
  );
}

/* ------------------------------------------------------- Opciones de vista */

function OpcionesVista({ estados, resumenObjetivo }: DatosPanel) {
  const { vista, calorDe, comparar, mezcla, objetivo, set } = useVisor();

  if (vista === 'grasa') {
    return (
      <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-humo-300">
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-sm" style={{ background: COLOR_MAGRO }} />
          Músculo, hueso y órganos
        </span>
        <span className="flex items-center gap-1.5">
          <span className="text-humo-400">poca</span>
          <span className="h-3 w-12 rounded-sm" style={{ background: `linear-gradient(to right, ${COLOR_GRASA_POCA}, ${COLOR_GRASA_MUCHA})` }} />
          <span className="text-humo-400">mucha</span>
          Grasa: casi transparente donde es fina, más densa y oscura donde es gruesa
        </span>
      </p>
    );
  }

  if (vista === 'realista') {
    return <p className="text-[11px] text-humo-300">El modelo con sus colores originales.</p>;
  }

  if (vista === 'calor') {
    const col = MAPA_CALOR.colores;
    return (
      <div className="space-y-2.5">
        <Alternar
          opciones={[
            ['grasa', 'Grasa'],
            ['musculo', 'Músculo'],
          ]}
          valor={calorDe}
          onChange={(v) => set({ calorDe: v as 'grasa' | 'musculo' })}
          etiqueta="Mapa de calor de"
        />
        {estados ? (
          <LeyendaCalor estados={estados} de={calorDe} />
        ) : (
          <p className="text-[11px] text-humo-500">Completa los datos del scanner para colorear cada segmento.</p>
        )}
        <p className="flex gap-3 text-[11px] text-humo-500">
          {(['bajo', 'normal', 'alto'] as const).map((e) => (
            <span key={e} className="flex items-center gap-1">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: col[e] }} />
              {e[0].toUpperCase() + e.slice(1)}
            </span>
          ))}
        </p>
      </div>
    );
  }

  // Comparar
  if (!resumenObjetivo) {
    return (
      <p className="text-[11px] text-humo-500">
        Para comparar hace falta el control de grasa o el control muscular del informe (sección 7), además del peso.
      </p>
    );
  }
  return (
    <div className="space-y-2.5">
      <Alternar
        opciones={[
          ['lado', 'Lado a lado'],
          ['fantasma', 'Superpuesto'],
        ]}
        valor={comparar}
        onChange={(v) => set({ comparar: v as 'lado' | 'fantasma' })}
        etiqueta="Comparar"
      />
      <p className="text-[11px] text-humo-300">{resumenObjetivo}</p>
      {!objetivo && <p className="text-[11px] text-humo-500">Armando el cuerpo objetivo…</p>}
      {comparar === 'fantasma' && objetivo && (
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 text-[11px] text-humo-300">
            <span>Actual</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={mezcla}
              aria-label="De actual a objetivo"
              onChange={(e) => set({ mezcla: Number(e.target.value) })}
              className="flex-1 accent-[#8CC63F]"
            />
            <span>Objetivo</span>
          </div>
          <BotonTransicion />
          <p className="text-[11px] text-humo-500">El fantasma blanco es el cuerpo actual.</p>
        </div>
      )}
    </div>
  );
}

/** Anima la mezcla actual -> objetivo en 1,6 s. */
function BotonTransicion() {
  const set = useVisor((s) => s.set);
  const animar = () => {
    // Con "reducir movimiento" en el sistema, se salta directo al objetivo.
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      set({ mezcla: 1 });
      return;
    }
    const t0 = performance.now();
    const paso = (t: number) => {
      const x = Math.min(1, (t - t0) / 1600);
      // ease-in-out
      set({ mezcla: x < 0.5 ? 2 * x * x : 1 - (-2 * x + 2) ** 2 / 2 });
      if (x < 1) requestAnimationFrame(paso);
    };
    set({ mezcla: 0 });
    requestAnimationFrame(paso);
  };
  return (
    <button
      type="button"
      onClick={animar}
      className="w-full rounded-lg border border-carbon-600 py-2 text-xs font-semibold text-humo-100 hover:border-[#8CC63F]"
    >
      ▶ Ver la transición al objetivo
    </button>
  );
}

function Alternar({
  opciones,
  valor,
  onChange,
  etiqueta,
}: {
  opciones: [string, string][];
  valor: string;
  onChange: (v: string) => void;
  etiqueta: string;
}) {
  return (
    <div className="flex items-center gap-2" role="group" aria-label={etiqueta}>
      <span className="text-xs text-humo-300">{etiqueta}</span>
      <div className="flex rounded-lg bg-carbon-900 p-0.5">
        {opciones.map(([v, t]) => (
          <button
            key={v}
            type="button"
            aria-pressed={valor === v}
            onClick={() => onChange(v)}
            className={`rounded-md px-2.5 py-1 text-xs font-semibold ${valor === v ? 'bg-carbon-600 text-humo-100' : 'text-humo-500'}`}
          >
            {t}
          </button>
        ))}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------- Medidas */

function ModoMedidas() {
  const { modoMedidas, set } = useVisor();
  return (
    <div className="space-y-1.5">
      <Alternar
        opciones={[
          ['autoequilibrio', 'Autoequilibrio'],
          ['editar', 'Editar un valor'],
        ]}
        valor={modoMedidas}
        onChange={(v) => set({ modoMedidas: v as 'autoequilibrio' | 'editar' })}
        etiqueta="Al cambiar una medida"
      />
      <p className="text-[11px] text-humo-500">
        {modoMedidas === 'autoequilibrio'
          ? 'Las medidas que no escribiste se acomodan solas y de forma coherente (si sube el peso, suben las circunferencias).'
          : 'Solo cambia la medida que escribes: las demás se mantienen como estaban en el modelo.'}
      </p>
    </div>
  );
}

/* --------------------------------------------------------- Ajuste manual */

function AjusteManual({ cuerpo, resultado }: { cuerpo: CuerpoBase | null; resultado: ResultadoMotor | null }) {
  const { sexo, macro, locales, verSegmentos, setMacro, setLocal, set, reiniciar } = useVisor();
  const controles = useMemo(() => (cuerpo ? controlesLocales(cuerpo.meta) : []), [cuerpo]);
  const grupos = useMemo(() => {
    const g: Record<string, ControlLocal[]> = {};
    for (const c of controles) (g[c.grupo] ??= []).push(c);
    return g;
  }, [controles]);
  return (
    <>
      <p className="text-[11px] text-humo-500">
        Para revisar el modelo: mover un control cambia el cuerpo a mano (deja de ser el ajustado a los datos).
      </p>
      {cuerpo && resultado && <PanelMedidas cuerpo={cuerpo} resultado={resultado} />}
      <label className="flex items-center gap-2 text-xs text-humo-300">
        <input type="checkbox" checked={verSegmentos} onChange={(e) => set({ verSegmentos: e.target.checked })} />
        Ver segmentos de la malla
      </label>
      {verSegmentos && cuerpo && (
        <ul className="grid grid-cols-3 gap-1 text-[11px] text-humo-300">
          {cuerpo.meta.segmentos.nombres.map((n) => (
            <li key={n} className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-sm" style={{ background: COLOR_SEGMENTO[n] }} />
              {n.replace('_', ' ')}
            </li>
          ))}
        </ul>
      )}
      <Seccion titulo="Macro (MakeHuman)">
        <Deslizador
          etiqueta="Músculo"
          min={0}
          max={1}
          paso={0.01}
          valor={macro.musculo}
          onChange={(v) => setMacro('musculo', v)}
        />
        <Deslizador etiqueta="Peso" min={0} max={1} paso={0.01} valor={macro.peso} onChange={(v) => setMacro('peso', v)} />
        <Deslizador etiqueta="Edad (años)" min={25} max={90} paso={1} valor={macro.edad} onChange={(v) => setMacro('edad', v)} />
        <Deslizador etiqueta="Altura" min={0} max={1} paso={0.01} valor={macro.altura} onChange={(v) => setMacro('altura', v)} />
        <Deslizador
          etiqueta="Proporciones ideales"
          min={0}
          max={1}
          paso={0.01}
          valor={macro.proporciones}
          onChange={(v) => setMacro('proporciones', v)}
        />
        {sexo === 'F' && (
          <Deslizador etiqueta="Copa" min={0} max={1} paso={0.01} valor={macro.copa} onChange={(v) => setMacro('copa', v)} />
        )}
      </Seccion>
      {Object.entries(grupos).map(([grupo, lista]) => (
        <Seccion key={grupo} titulo={TITULO_GRUPO[grupo] ?? grupo}>
          {lista.map((c) => (
            <Deslizador
              key={c.clave}
              etiqueta={c.etiqueta}
              min={c.bipolar ? -1 : 0}
              max={1}
              paso={0.01}
              valor={locales[c.clave] ?? 0}
              onChange={(v) => setLocal(c.clave, v)}
            />
          ))}
        </Seccion>
      ))}
      <button
        onClick={reiniciar}
        className="w-full rounded-xl py-2.5 text-sm font-semibold border border-carbon-600 text-humo-300 hover:text-humo-100"
      >
        Reiniciar valores
      </button>
    </>
  );
}

/** Lo que mide el motor, en vivo. */
function PanelMedidas({ cuerpo, resultado }: { cuerpo: CuerpoBase; resultado: ResultadoMotor }) {
  const m = resultado.medidas;
  const fila = (etiqueta: string, valor: string) => (
    <div key={etiqueta} className="flex justify-between gap-2 py-0.5">
      <dt className="text-humo-300">{etiqueta}</dt>
      <dd className="tabular-nums font-semibold">{valor}</dd>
    </div>
  );
  return (
    <div className="space-y-3">
      <dl className="grid grid-cols-3 gap-2 text-center">
        <Dato titulo="Estatura" valor={`${m.estaturaCm.toFixed(1)} cm`} />
        <Dato titulo="Volumen" valor={`${m.volumenL.toFixed(2)} L`} />
        <Dato titulo="Cálculo" valor={`${resultado.ms.toFixed(1)} ms`} />
      </dl>
      <details className="rounded-xl bg-carbon-700/60 px-3 py-2 text-xs" open>
        <summary className="cursor-pointer font-semibold text-humo-100">Circunferencias y entrepierna</summary>
        <dl className="mt-2" data-medidas="circunferencias">
          {Object.entries(m.circunferenciasCm).map(([n, cm]) => fila(CIRCUNFERENCIAS[n]?.etiqueta ?? n, `${cm.toFixed(1)} cm`))}
          {fila('Entrepierna', `${m.entrepiernaCm.toFixed(1)} cm`)}
        </dl>
      </details>
      <details className="rounded-xl bg-carbon-700/60 px-3 py-2 text-xs">
        <summary className="cursor-pointer font-semibold text-humo-100">Volumen por segmento</summary>
        <dl className="mt-2" data-medidas="segmentos">
          {Object.entries(m.volumenSegmentoL).map(([n, l]) => fila(n.replace('_', ' '), `${l.toFixed(2)} L`))}
          {fila(
            'Suma',
            `${Object.values(m.volumenSegmentoL)
              .reduce((a, b) => a + b, 0)
              .toFixed(2)} L`,
          )}
        </dl>
      </details>
      <p className="text-[11px] text-humo-500">
        {cuerpo.morphs.length} morphs · morphs {resultado.msMorphs.toFixed(1)} ms · cálculo total en el Worker{' '}
        {resultado.ms.toFixed(1)} ms
      </p>
    </div>
  );
}

function Seccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="etiqueta">{titulo}</h2>
      {children}
    </section>
  );
}

function Dato({ titulo, valor }: { titulo: string; valor: string }) {
  return (
    <div className="rounded-xl bg-carbon-700 px-2 py-2">
      <dt className="text-[10px] uppercase tracking-wider text-humo-500">{titulo}</dt>
      <dd className="text-sm font-bold tabular-nums">{valor}</dd>
    </div>
  );
}

function Deslizador(props: {
  etiqueta: string;
  min: number;
  max: number;
  paso: number;
  valor: number;
  onChange: (v: number) => void;
}) {
  const { etiqueta, min, max, paso, valor, onChange } = props;
  const decimales = Number.isInteger(paso) ? 0 : 2;
  const mostrado = valor.toFixed(decimales).replace('.', ',');
  const [texto, setTexto] = useState<string | null>(null);
  // Se escribe con el teclado; se aplica al salir del campo o con Enter.
  const aplicar = () => {
    if (texto === null) return;
    const n = Number(texto.replace(',', '.'));
    if (texto.trim() !== '' && Number.isFinite(n)) onChange(Math.min(max, Math.max(min, n)));
    setTexto(null);
  };
  return (
    <div data-deslizador className="block">
      <span className="flex items-center justify-between gap-2 text-xs text-humo-300">
        <span className="truncate pr-2">{etiqueta}</span>
        <input
          type="text"
          inputMode={min < 0 ? 'text' : 'decimal'}
          aria-label={`${etiqueta}: valor`}
          value={texto ?? mostrado}
          onFocus={(e) => {
            setTexto(mostrado);
            e.target.select();
          }}
          onChange={(e) => setTexto(e.target.value)}
          onBlur={aplicar}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            if (e.key === 'Escape') setTexto(null);
          }}
          className="w-16 rounded-md border border-carbon-600 bg-carbon-900 px-1.5 py-0.5 text-right tabular-nums text-humo-100 outline-none focus:border-[#8CC63F]"
        />
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={paso}
        value={valor}
        aria-label={etiqueta}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-[#8CC63F]"
      />
    </div>
  );
}
