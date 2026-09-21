import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { cx } from '../components/ui.jsx';
import { IconoAtras, IconoComposicion, IconoFlecha, IconoCheck } from '../components/Iconos.jsx';
import { pesos } from '../lib/formato.js';
import { rutaInicio } from '../lib/tablet.js';

/**
 * Página informativa del análisis de composición corporal. SOLO INFORMATIVA,
 * igual que la Tienda: aquí se explica qué mide el equipo y qué trae el
 * reporte, pero el análisis se hace en persona, en la báscula del gimnasio, y
 * se paga en recepción -no hay reserva ni pago desde la app-.
 *
 * El contenido -las secciones y lo que mide cada una- sale directo del
 * formato del reporte que imprime el equipo (BodyAnalyse), no es un listado
 * inventado: así el cliente sabe exactamente qué se va a llevar impreso.
 *
 * SE MUESTRA COMO DIAPOSITIVAS, una por pantalla completa, en vez de una
 * página larga: es la misma regla de "sin desplazarse" que el inicio, pero
 * aquí hay demasiado contenido para una sola pantalla, así que en vez de
 * romper la regla se reparte en varias pantallas completas y una flecha
 * avanza de una a la siguiente.
 */
export default function ComposicionCorporal() {
  const [indice, setIndice] = useState(0);
  const inicioX = useRef(null);

  const total = DIAPOSITIVAS.length;
  const esUltima = indice === total - 1;

  const siguiente = () => setIndice((i) => Math.min(i + 1, total - 1));
  const anterior = () => setIndice((i) => Math.max(i - 1, 0));
  const alPresionarAtras = () => (indice > 0 ? anterior() : null);

  const onTouchStart = (e) => {
    inicioX.current = e.touches[0].clientX;
  };
  const onTouchEnd = (e) => {
    if (inicioX.current == null) return;
    const delta = e.changedTouches[0].clientX - inicioX.current;
    if (delta < -45) siguiente();
    else if (delta > 45) anterior();
    inicioX.current = null;
  };

  const Diapositiva = DIAPOSITIVAS[indice];

  return (
    <div className="h-dvh flex flex-col overflow-hidden">
      <header className="shrink-0 px-5 pt-6 pb-3 flex items-center gap-3">
        {indice > 0 ? (
          <button
            onClick={alPresionarAtras}
            aria-label="Anterior"
            className="p-2 -ml-2 rounded-xl text-humo-300 hover:bg-carbon-700 active:scale-95"
          >
            <IconoAtras />
          </button>
        ) : (
          <Link
            to={rutaInicio()}
            aria-label="Volver al inicio"
            className="p-2 -ml-2 rounded-xl text-humo-300 hover:bg-carbon-700 active:scale-95"
          >
            <IconoAtras />
          </Link>
        )}

        {/* Puntos de progreso: cuántas pantallas hay y en cuál se está. Cada
            uno también salta directo a su pantalla -no hace falta ir tocando
            "siguiente" una por una para volver a ver algo de atrás-. */}
        <div className="flex-1 flex items-center justify-center gap-1.5">
          {DIAPOSITIVAS.map((_, i) => (
            <button
              key={i}
              onClick={() => setIndice(i)}
              aria-label={`Ir a la pantalla ${i + 1} de ${total}`}
              className="p-1.5 -m-1.5"
            >
              <span
                className={cx(
                  'block h-1.5 rounded-full transition-all',
                  i === indice ? 'w-5 bg-volt-500' : 'w-1.5 bg-carbon-600'
                )}
              />
            </button>
          ))}
        </div>

        <span className="text-xs font-semibold text-humo-500 tabular-nums w-10 text-right">
          {indice + 1}/{total}
        </span>
      </header>

      <main
        key={indice}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        className="flex-1 min-h-0 px-6 pb-4 flex flex-col items-center justify-center text-center animate-aparecer"
      >
        <Diapositiva />
      </main>

      <footer className="shrink-0 pb-6 pt-2 flex items-center justify-center">
        {esUltima ? (
          <Link
            to={rutaInicio()}
            className="inline-flex items-center gap-2 rounded-2xl px-6 min-h-[52px] bg-volt-500 text-carbon-900 font-semibold tracking-tight active:scale-[.98] transition-all"
          >
            <IconoCheck className="w-5 h-5" />
            Listo, volver al inicio
          </Link>
        ) : (
          <button
            key={indice}
            onClick={siguiente}
            aria-label="Ver más"
            className="w-14 h-14 rounded-full bg-volt-500 text-carbon-900 flex items-center justify-center shadow-volt active:scale-95 transition-transform animate-latido"
          >
            <IconoFlecha className="w-6 h-6" />
          </button>
        )}
      </footer>
    </div>
  );
}

/* ------------------------------------------------------------ Contenido */

function EncabezadoDiapositiva({ titulo, bajada }) {
  return (
    <div className="mb-5">
      <span className="inline-flex w-12 h-12 rounded-2xl items-center justify-center mb-3 bg-volt-500/15 text-volt-500">
        <IconoComposicion className="w-6 h-6" />
      </span>
      <h1 className="text-[26px] leading-tight font-extrabold tracking-tightest">{titulo}</h1>
      {bajada && <p className="mt-1.5 text-sm text-humo-500 max-w-xs mx-auto">{bajada}</p>}
    </div>
  );
}

function ListaDatos({ items }) {
  return (
    <ul className="space-y-2 text-left inline-block">
      {items.map((item) => (
        <li key={item} className="flex items-center gap-2.5 text-[15px] text-humo-100">
          <span className="w-1.5 h-1.5 rounded-full bg-volt-500 shrink-0" />
          {item}
        </li>
      ))}
    </ul>
  );
}

function Portada() {
  return (
    <>
      <div className="mb-6 rounded-3xl bg-white p-4 max-w-[280px]">
        <img
          src="/images/bodyanalyse.png"
          alt="Báscula de composición corporal BodyAnalyse"
          className="w-full h-auto object-contain"
        />
      </div>
      <h1 className="text-[28px] leading-tight font-extrabold tracking-tightest">
        Composición <span className="text-volt-500">corporal</span>
      </h1>
      <p className="mt-2 text-sm text-humo-500 max-w-xs">
        Un análisis completo de tu cuerpo, hecho en un minuto, en la báscula del gimnasio.
      </p>
    </>
  );
}

function QueEsYPrecio() {
  return (
    <>
      <EncabezadoDiapositiva
        titulo="¿Qué es?"
        bajada="Bioimpedancia: de pie y descalzo sobre la báscula, en menos de un minuto."
      />
      <p className="text-sm text-humo-300 leading-relaxed max-w-xs mx-auto mb-6">
        Al terminar te entregan un reporte impreso con todos tus resultados, para que lo
        guardes y lo compares con el de la próxima vez.
      </p>
      <div className="grid grid-cols-2 gap-3 w-full max-w-xs">
        <div className="tarjeta p-4 border-volt-500/40">
          <p className="etiqueta text-volt-500">1.º análisis</p>
          <p className="mt-1 text-xl font-extrabold tracking-tightest">{pesos(20000)}</p>
        </div>
        <div className="tarjeta p-4">
          <p className="etiqueta">Desde el 2.º</p>
          <p className="mt-1 text-xl font-extrabold tracking-tightest">{pesos(50000)}</p>
        </div>
      </div>
    </>
  );
}

function ComposicionCorporalDiapositiva() {
  return (
    <>
      <EncabezadoDiapositiva titulo="Composición corporal" />
      <ListaDatos items={['Agua corporal', 'Proteínas', 'Sales minerales', 'Grasa corporal']} />
    </>
  );
}

function MusculoYGrasa() {
  return (
    <>
      <EncabezadoDiapositiva titulo="Músculo y grasa" />
      <ListaDatos items={['Peso', 'Músculo esquelético', 'Grasa corporal']} />
      <p className="mt-4 text-xs text-humo-500 max-w-xs">
        Cada uno con su rango normal, para saber si estás por debajo, dentro o por encima.
      </p>
    </>
  );
}

function Sobrepeso() {
  return (
    <>
      <EncabezadoDiapositiva titulo="Análisis de sobrepeso" />
      <ListaDatos
        items={[
          'Índice de masa corporal',
          'Porcentaje de grasa corporal',
          'Índice cintura-cadera',
          'Grasa subcutánea',
        ]}
      />
    </>
  );
}

function Segmentales() {
  return (
    <>
      <EncabezadoDiapositiva titulo="Músculos segmentales" />
      <ListaDatos
        items={['Brazo izquierdo y derecho', 'Pierna izquierda y derecha', 'Índice de grasa visceral']}
      />
      <p className="mt-4 text-xs text-humo-500 max-w-xs">
        Músculo y grasa medidos por separado en cada extremidad, más la grasa que rodea los
        órganos -la visceral-, no solo la que se ve.
      </p>
    </>
  );
}

function Diagnostico() {
  return (
    <>
      <EncabezadoDiapositiva
        titulo="Diagnóstico de tipo corporal"
        bajada="Con el músculo y la grasa medidos, tu cuerpo queda en uno de estos tipos:"
      />
      <div className="flex flex-wrap justify-center gap-1.5 max-w-sm">
        {[
          'Delgado',
          'Musculoso delgado',
          'Muscular estándar',
          'Estándar',
          'Obeso',
          'Musculoso',
          'Obesidad muscular',
          'Baja actividad física',
          'Músculo-grasa',
        ].map((tipo) => (
          <span
            key={tipo}
            className="px-2.5 py-1.5 rounded-full bg-carbon-700 text-humo-300 text-xs font-semibold"
          >
            {tipo}
          </span>
        ))}
      </div>
    </>
  );
}

function EvaluacionIntegral() {
  return (
    <>
      <EncabezadoDiapositiva titulo="Evaluación integral" />
      <p className="text-sm text-humo-300 leading-relaxed max-w-xs mx-auto">
        Un resumen de "normal, insuficiente o excesivo" para lo nutricional (proteínas, sales
        minerales, grasa), el peso (peso, músculo esquelético, grasa) y la obesidad (masa
        corporal, porcentaje de grasa).
      </p>
    </>
  );
}

function ControlDePeso() {
  return (
    <>
      <EncabezadoDiapositiva titulo="Control de peso" />
      <ListaDatos
        items={['Peso objetivo', 'Cuánto peso, grasa o músculo controlar', 'Metabolismo basal', 'Edad corporal']}
      />
    </>
  );
}

function Cierre() {
  return (
    <>
      <span className="inline-flex w-14 h-14 rounded-2xl items-center justify-center mb-4 bg-volt-500/15 text-volt-500">
        <IconoCheck className="w-7 h-7" />
      </span>
      <h1 className="text-[26px] leading-tight font-extrabold tracking-tightest">Eso es todo</h1>
      <p className="mt-2 text-sm text-humo-300 max-w-xs">
        Se hace en el gimnasio, en la báscula del mostrador. Pregunta en recepción.
      </p>
      <div className="mt-5 grid grid-cols-2 gap-3 w-full max-w-xs">
        <div className="tarjeta p-4 border-volt-500/40">
          <p className="etiqueta text-volt-500">1.º análisis</p>
          <p className="mt-1 text-xl font-extrabold tracking-tightest">{pesos(20000)}</p>
        </div>
        <div className="tarjeta p-4">
          <p className="etiqueta">Desde el 2.º</p>
          <p className="mt-1 text-xl font-extrabold tracking-tightest">{pesos(50000)}</p>
        </div>
      </div>
    </>
  );
}

const DIAPOSITIVAS = [
  Portada,
  QueEsYPrecio,
  ComposicionCorporalDiapositiva,
  MusculoYGrasa,
  Sobrepeso,
  Segmentales,
  Diagnostico,
  EvaluacionIntegral,
  ControlDePeso,
  Cierre,
];
