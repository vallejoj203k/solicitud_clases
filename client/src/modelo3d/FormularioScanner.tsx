import { useMemo, useState, type KeyboardEvent, type ReactNode } from 'react';
import {
  CAMPO_VISCERAL,
  CAMPOS_COMPOSICION,
  CAMPOS_CONTROL,
  CAMPOS_ENCABEZADO,
  CAMPOS_MEDIDAS,
  CAMPOS_MUSCULO_GRASA,
  CAMPOS_SOBREPESO,
  DIAGNOSTICOS,
  EVALUACIONES,
  NOMBRE_SEGMENTO,
  campoSegmento,
  revisarCoherencia,
  validar,
  type Aviso,
  type ClaveEvaluacion,
  type DefCampo,
  type Evaluacion,
  type SegmentoInforme,
} from './cliente';
import { CLIENTES_EJEMPLO } from './clientesEjemplo';
import { useCliente } from './estadoCliente';
import { useVisor } from './estado';

/**
 * Formulario con los datos del informe del bodyscanner, en el mismo orden que
 * el papel: el entrenador los copia escribiendo con el teclado (Enter pasa al
 * campo siguiente) y marca las casillas de evaluación y el diagnóstico.
 */

/* ------------------------------------------------------------ Validación */

/** Valida lo escrito y junta errores y avisos para pintar cada campo. */
function usarValidacion() {
  const sexo = useVisor((s) => s.sexo);
  const { nombre, valores, evaluacion, diagnostico } = useCliente();
  return useMemo(() => {
    const borrador = { nombre, sexo, valores, evaluacion, diagnostico };
    const r = validar(borrador);
    const avisos = r.ok ? revisarCoherencia(r.cliente, borrador) : [];
    const conAviso = new Set(avisos.flatMap((a) => a.campos));
    return { ...r, avisos, conAviso };
  }, [nombre, sexo, valores, evaluacion, diagnostico]);
}

/** Enter en un campo pasa al siguiente campo del formulario (como Tab). */
function alEnter(e: KeyboardEvent<HTMLInputElement>) {
  if (e.key !== 'Enter') return;
  e.preventDefault();
  const campos = Array.from(document.querySelectorAll<HTMLInputElement>('input[data-campo]'));
  const i = campos.indexOf(e.currentTarget);
  campos[i + 1]?.focus();
  campos[i + 1]?.select();
}

/* ---------------------------------------------------------- Piezas de UI */

function Seccion({ numero, titulo, children }: { numero?: number; titulo: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="flex items-center gap-2 text-sm font-bold text-humo-100">
        {numero !== undefined && (
          <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[#8CC63F] text-xs font-extrabold text-carbon-900">
            {numero}
          </span>
        )}
        {titulo}
      </h2>
      {children}
    </section>
  );
}

function CampoNumero({
  def,
  tocado,
  onTocar,
  error,
  aviso,
}: {
  def: DefCampo;
  tocado: boolean;
  onTocar: () => void;
  error?: string;
  aviso: boolean;
}) {
  const texto = useCliente((s) => s.valores[def.clave] ?? '');
  const setValor = useCliente((s) => s.setValor);
  // "Obligatorio" solo después de pasar por el campo; lo demás (formato,
  // rango) apenas se escribe.
  const mostrarError = error && (texto.trim() !== '' || tocado);
  const id = `campo-${def.clave}`;
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="block truncate text-[11px] text-humo-300" title={def.etiqueta}>
        {def.etiqueta}
        {def.requerido && <span className="text-[#8CC63F]"> *</span>}
      </label>
      <div
        className={`mt-1 flex items-center rounded-lg border bg-carbon-900 focus-within:border-[#8CC63F] ${
          mostrarError ? 'border-alerta' : aviso ? 'border-amber-400' : 'border-carbon-600'
        }`}
      >
        <input
          id={id}
          data-campo={def.clave}
          type="text"
          // Teclado numérico en el móvil; con negativos hace falta el signo menos.
          inputMode={def.min < 0 ? 'text' : def.entero ? 'numeric' : 'decimal'}
          autoComplete="off"
          value={texto}
          onChange={(e) => setValor(def.clave, e.target.value)}
          onBlur={onTocar}
          onKeyDown={alEnter}
          onFocus={(e) => e.target.select()}
          aria-invalid={mostrarError ? true : undefined}
          aria-describedby={mostrarError ? `${id}-error` : undefined}
          className="w-full min-w-0 bg-transparent px-2.5 py-2 text-sm font-semibold tabular-nums text-humo-100 outline-none placeholder:text-carbon-500"
          placeholder="—"
        />
        {def.unidad && <span className="pr-2.5 text-[11px] text-humo-500">{def.unidad}</span>}
      </div>
      {mostrarError && (
        <p id={`${id}-error`} className="mt-1 text-[11px] text-alerta">
          {error}
        </p>
      )}
      {def.ayuda && !mostrarError && <p className="mt-1 text-[10px] text-humo-500">{def.ayuda}</p>}
    </div>
  );
}

/** Rejilla de campos numéricos que comparten errores / avisos / "tocado". */
function Campos({
  defs,
  v,
  columnas = 2,
}: {
  defs: DefCampo[];
  v: ReturnType<typeof usarValidacion> & { tocados: Set<string>; tocar: (k: string) => void };
  columnas?: 1 | 2;
}) {
  return (
    <div className={`grid gap-x-3 gap-y-3 ${columnas === 2 ? 'grid-cols-2' : 'grid-cols-1'}`}>
      {defs.map((d) => (
        <CampoNumero
          key={d.clave}
          def={d}
          tocado={v.tocados.has(d.clave)}
          onTocar={() => v.tocar(d.clave)}
          error={v.errores[d.clave]}
          aviso={v.conAviso.has(d.clave)}
        />
      ))}
    </div>
  );
}

/** Casilla de evaluación (Normal / Bajo / Alto), como las del informe. */
function Casilla({ marcada, etiqueta, onClick }: { marcada: boolean; etiqueta: string; onClick: () => void }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={marcada}
      onClick={onClick}
      className="flex items-center gap-1.5 rounded-md py-1 text-[11px] text-humo-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#8CC63F]"
    >
      <span
        className={`grid h-5 w-5 shrink-0 place-items-center rounded border text-xs font-black ${
          marcada ? 'border-[#8CC63F] bg-[#8CC63F] text-carbon-900' : 'border-carbon-500 bg-carbon-900'
        }`}
        aria-hidden
      >
        {marcada ? '✓' : ''}
      </span>
      <span className={marcada ? 'font-bold text-humo-100' : ''}>{etiqueta}</span>
    </button>
  );
}

const OPCIONES: [Evaluacion, string][] = [
  ['normal', 'Normal'],
  ['bajo', 'Bajo'],
  ['alto', 'Alto'],
];

function EvaluacionIntegral() {
  const evaluacion = useCliente((s) => s.evaluacion);
  const alternar = useCliente((s) => s.alternarEvaluacion);
  return (
    <div className="overflow-hidden rounded-xl border border-[#8CC63F]/60">
      {EVALUACIONES.map((g) => (
        <div key={g.grupo}>
          <p className="bg-[#8CC63F] px-3 py-1.5 text-xs font-bold text-carbon-900">{g.grupo}</p>
          {g.filas.map(([clave, etiqueta]) => (
            <div
              key={clave}
              role="group"
              aria-label={etiqueta}
              className="grid grid-cols-[1fr_auto] items-center gap-2 border-t border-carbon-600 px-3 py-1.5 first:border-t-0"
            >
              <span className="text-xs font-semibold text-humo-100">{etiqueta}</span>
              <div className="flex gap-2.5">
                {OPCIONES.map(([v, t]) => (
                  <Casilla
                    key={v}
                    etiqueta={t}
                    marcada={evaluacion[clave as ClaveEvaluacion] === v}
                    onClick={() => alternar(clave as ClaveEvaluacion, v)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

/** Colores de la barra del informe: de verde muy claro a verde oscuro. */
const COLOR_DIAGNOSTICO = ['#F4F7EE', '#E7F1DA', '#DCEBC8', '#D0E6B2', '#BFDD93', '#9ACD32', '#5E9A2C', '#4A7A22', '#34521A'];

function DiagnosticoObesidad() {
  const diagnostico = useCliente((s) => s.diagnostico);
  const alternar = useCliente((s) => s.alternarDiagnostico);
  return (
    <div className="grid grid-cols-3 gap-1.5" role="group" aria-label="Diagnóstico de obesidad">
      {DIAGNOSTICOS.map((d, i) => {
        const marcado = diagnostico === d;
        return (
          <button
            key={d}
            type="button"
            role="checkbox"
            aria-checked={marcado}
            onClick={() => alternar(d)}
            style={{ background: COLOR_DIAGNOSTICO[i] }}
            className={`relative min-h-[3.25rem] rounded-md px-1.5 py-2 text-center text-[11px] font-semibold leading-tight ${
              i >= 6 ? 'text-white' : 'text-carbon-900'
            } ${marcado ? 'outline outline-[3px] outline-offset-1 outline-white' : 'opacity-80 hover:opacity-100'}`}
          >
            {d}
            {marcado && <span className="block text-sm font-black">✓</span>}
          </button>
        );
      })}
    </div>
  );
}

/** Sección 4: músculo y grasa de cada segmento, dispuestos como la figura del informe. */
function Segmental({ v }: { v: Parameters<typeof Campos>[0]['v'] }) {
  const bloque = (s: SegmentoInforme, alinear: 'izq' | 'der' | 'centro') => (
    <div className={`rounded-xl bg-carbon-700/60 p-2.5 ${alinear === 'centro' ? 'col-span-2 mx-auto w-2/3' : ''}`}>
      <p
        className={`mb-1.5 text-xs font-semibold text-humo-100 ${alinear === 'der' ? 'text-right' : alinear === 'centro' ? 'text-center' : ''}`}
      >
        {NOMBRE_SEGMENTO[s]}
      </p>
      <Campos
        defs={[campoSegmento('musculo', s), campoSegmento('grasa', s)].map((d) => ({ ...d, etiqueta: d.etiqueta.split(' ')[0] }))}
        v={v}
        columnas={1}
      />
    </div>
  );
  return (
    <div className="grid grid-cols-2 gap-2">
      {bloque('brazo_izq', 'izq')}
      {bloque('brazo_der', 'der')}
      {bloque('tronco', 'centro')}
      {bloque('pierna_izq', 'izq')}
      {bloque('pierna_der', 'der')}
    </div>
  );
}

function ListaAvisos({ avisos }: { avisos: Aviso[] }) {
  if (!avisos.length) return null;
  return (
    <ul
      className="space-y-1.5 rounded-xl border border-amber-400/50 bg-amber-400/10 p-3 text-[11px] text-amber-100"
      aria-live="polite"
    >
      {avisos.map((a) => (
        <li key={a.texto}>⚠ {a.texto}</li>
      ))}
    </ul>
  );
}

/* ------------------------------------------------------------ Formularios */

function usarTocados() {
  const [tocados, setTocados] = useState<Set<string>>(new Set());
  return {
    tocados,
    tocar: (k: string) => setTocados((t) => (t.has(k) ? t : new Set(t).add(k))),
    tocarTodos: (ks: string[]) => setTocados(new Set(ks)),
    reiniciar: () => setTocados(new Set()),
  };
}

export function FormularioScanner() {
  const val = usarValidacion();
  const t = usarTocados();
  const v = { ...val, tocados: t.tocados, tocar: t.tocar };
  const { nombre, setNombre, cargar, limpiar } = useCliente();
  const setSexo = useVisor((s) => s.setSexo);
  const faltan = Object.values(val.errores).length;

  return (
    <div className="space-y-7">
      <div className="flex gap-2">
        <select
          aria-label="Cargar un cliente de ejemplo"
          className="min-w-0 flex-1 rounded-xl border border-carbon-600 bg-carbon-900 px-3 py-2 text-xs text-humo-300"
          value=""
          onChange={(e) => {
            const ej = CLIENTES_EJEMPLO[Number(e.target.value)];
            if (!ej) return;
            const { sexo, ...datos } = ej.borrador;
            setSexo(sexo);
            cargar(datos);
            t.reiniciar();
          }}
        >
          <option value="">Cargar un ejemplo…</option>
          {CLIENTES_EJEMPLO.map((c, i) => (
            <option key={c.titulo} value={i}>
              {c.titulo}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => {
            limpiar();
            t.reiniciar();
          }}
          className="rounded-xl border border-carbon-600 px-3 py-2 text-xs font-semibold text-humo-300 hover:text-humo-100"
        >
          Limpiar
        </button>
      </div>

      <Seccion titulo="Datos del cliente">
        <label className="block">
          <span className="text-[11px] text-humo-300">Nombre (opcional)</span>
          <input
            data-campo="nombre"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            onKeyDown={alEnter}
            autoComplete="off"
            className="mt-1 w-full rounded-lg border border-carbon-600 bg-carbon-900 px-2.5 py-2 text-sm text-humo-100 outline-none focus:border-[#8CC63F]"
          />
        </label>
        <p className="text-[11px] text-humo-500">El sexo se elige con los botones de arriba.</p>
        <Campos defs={CAMPOS_ENCABEZADO} v={v} />
      </Seccion>

      <Seccion numero={1} titulo="Análisis de composición corporal">
        <Campos defs={CAMPOS_COMPOSICION} v={v} />
      </Seccion>

      <Seccion numero={2} titulo="Análisis músculo-grasa">
        <Campos defs={CAMPOS_MUSCULO_GRASA} v={v} />
      </Seccion>

      <Seccion numero={3} titulo="Análisis de sobrepeso">
        <Campos defs={CAMPOS_SOBREPESO} v={v} />
      </Seccion>

      <Seccion numero={4} titulo="Músculo y grasa segmental">
        <Segmental v={v} />
        <Campos defs={[CAMPO_VISCERAL]} v={v} />
      </Seccion>

      <Seccion numero={5} titulo="Diagnóstico de obesidad">
        <DiagnosticoObesidad />
      </Seccion>

      <Seccion numero={6} titulo="Evaluación integral">
        <EvaluacionIntegral />
      </Seccion>

      <Seccion numero={7} titulo="Control de peso">
        <Campos defs={CAMPOS_CONTROL} v={v} />
      </Seccion>

      <div className="space-y-3">
        <ListaAvisos avisos={val.avisos} />
        {val.ok ? (
          <p className="rounded-xl bg-[#8CC63F]/15 px-3 py-2 text-xs font-semibold text-[#B5E37A]" role="status">
            ✓ Datos completos. IMC {val.cliente.imc.toFixed(1).replace('.', ',')} · grasa{' '}
            {val.cliente.pctGrasa.toFixed(1).replace('.', ',')} %
            {val.cliente.segmental.troncoCalculado ? ' · tronco calculado como resto' : ''}
          </p>
        ) : (
          <button
            type="button"
            onClick={() => {
              t.tocarTodos(Object.keys(val.errores));
              const primero = document.querySelector<HTMLInputElement>(`input[data-campo="${Object.keys(val.errores)[0]}"]`);
              primero?.focus();
            }}
            className="w-full rounded-xl border border-alerta/60 px-3 py-2 text-xs font-semibold text-alerta"
          >
            Revisar datos ({faltan} {faltan === 1 ? 'campo' : 'campos'} por corregir)
          </button>
        )}
        <p className="text-[11px] text-humo-500">
          El cuerpo 3D se arma solo con la estatura, el peso, el % de grasa y la grasa visceral, más las medidas con cinta de la
          pestaña “Medidas”. Los valores por segmento se suman en la fase 4.
        </p>
      </div>
    </div>
  );
}

export function FormularioMedidas() {
  const val = usarValidacion();
  const t = usarTocados();
  const v = { ...val, tocados: t.tocados, tocar: t.tocar };
  return (
    <div className="space-y-4">
      <p className="text-xs text-humo-300">
        Medidas con cinta métrica, todas opcionales. Si se escriben, pesan más que lo que se estima con el scanner.
      </p>
      <Campos defs={CAMPOS_MEDIDAS} v={v} />
      <ListaAvisos avisos={val.avisos.filter((a) => a.campos.some((c) => c.startsWith('m_')))} />
    </div>
  );
}
