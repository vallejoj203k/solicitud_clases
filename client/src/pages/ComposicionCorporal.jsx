import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { cx } from '../components/ui.jsx';
import { IconoAtras, IconoFlecha, IconoCheck } from '../components/Iconos.jsx';
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
 *
 * PENSADA PARA LA TABLET, EN HORIZONTAL: cada diapositiva (`Diapo`) es una
 * columna en un teléfono angosto -ícono/foto arriba, texto abajo-, pero pasa
 * a dos columnas lado a lado (`md:landscape:`) en una pantalla ancha, igual
 * que la ficha de producto de la Tienda: así la tablet aprovecha el ancho en
 * vez de dejar una columna angosta y centrada con medio salón de margen a
 * cada lado.
 */
export default function ComposicionCorporal() {
  const [indice, setIndice] = useState(0);
  // Hacia dónde se navegó la última vez, para que la diapositiva que entra
  // lo haga desde el lado que corresponde: de la derecha al avanzar, de la
  // izquierda al retroceder -no siempre el mismo lado, como sería con una
  // sola animación fija-.
  const [direccion, setDireccion] = useState(1);
  const inicioX = useRef(null);

  const total = DIAPOSITIVAS.length;
  const esUltima = indice === total - 1;

  const irA = (destino) => {
    const acotado = Math.max(0, Math.min(total - 1, destino));
    setDireccion(acotado >= indice ? 1 : -1);
    setIndice(acotado);
  };

  const siguiente = () => irA(indice + 1);
  const anterior = () => irA(indice - 1);
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
      <header className="shrink-0 px-5 md:landscape:px-8 pt-6 pb-3 flex items-center gap-3">
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
              onClick={() => irA(i)}
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
        className={cx(
          'flex-1 min-h-0 px-6 md:landscape:px-14 pb-4 flex flex-col items-center justify-center',
          direccion === 1 ? 'animate-entrarDesdeDerecha' : 'animate-entrarDesdeIzquierda'
        )}
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
            className="w-14 h-14 md:landscape:w-16 md:landscape:h-16 rounded-full bg-volt-500 text-carbon-900 flex items-center justify-center shadow-volt active:scale-95 transition-transform animate-latido"
          >
            <IconoFlecha className="w-6 h-6 md:landscape:w-7 md:landscape:h-7" />
          </button>
        )}
      </footer>
    </div>
  );
}

/* ------------------------------------------------------------ Contenido */

/**
 * Esqueleto de cada diapositiva: visual (ícono o foto) de un lado, título +
 * bajada + contenido del otro. En un teléfono, uno debajo del otro; en la
 * tablet horizontal, lado a lado -ver el comentario grande arriba-.
 */
function Diapo({ visual, titulo, bajada, children }) {
  const visualFinal = visual ?? (
    <img
      src="/images/logo-megavital.jpg"
      alt="Gimnasio Mega Vital"
      className="w-32 md:landscape:w-56 h-auto object-contain rounded-2xl"
    />
  );

  return (
    <div className="w-full max-w-5xl md:landscape:max-w-6xl mx-auto flex flex-col md:landscape:flex-row md:landscape:items-center gap-5 md:landscape:gap-16 text-center md:landscape:text-left">
      <div className="flex items-center justify-center shrink-0 md:landscape:w-[34%]">{visualFinal}</div>

      <div className="flex flex-col items-center md:landscape:items-start w-full md:landscape:flex-1 md:landscape:min-w-0">
        <h1 className="text-[26px] md:landscape:text-[42px] leading-tight font-extrabold tracking-tightest">
          {titulo}
        </h1>
        {bajada && (
          <p className="mt-1.5 text-sm md:landscape:text-lg text-humo-500 max-w-xs md:landscape:max-w-lg">
            {bajada}
          </p>
        )}
        {children && (
          <div className="mt-4 md:landscape:mt-7 w-full flex flex-col items-center md:landscape:items-start">
            {children}
          </div>
        )}
      </div>
    </div>
  );
}

function ListaDatos({ items }) {
  return (
    <ul className="grid grid-cols-1 md:landscape:grid-cols-2 gap-x-10 gap-y-2.5 md:landscape:gap-y-3 text-left w-full max-w-md md:landscape:max-w-2xl">
      {items.map((item) => (
        <li key={item} className="flex items-center gap-2.5 text-[15px] md:landscape:text-lg text-humo-100">
          <span className="w-1.5 h-1.5 md:landscape:w-2 md:landscape:h-2 rounded-full bg-volt-500 shrink-0" />
          {item}
        </li>
      ))}
    </ul>
  );
}

/** Las dos tarjetas de precio: se repiten en la portada de precios y en el
 *  cierre, así que van en un solo lugar. */
function PrecioTarjetas() {
  return (
    <div className="grid grid-cols-2 gap-3 md:landscape:gap-4 w-full max-w-xs md:landscape:max-w-md">
      <div className="tarjeta p-4 md:landscape:p-6 border-volt-500/40">
        <p className="etiqueta md:landscape:text-sm text-volt-500">1.º análisis</p>
        <p className="mt-1 text-xl md:landscape:text-3xl font-extrabold tracking-tightest">{pesos(20000)}</p>
      </div>
      <div className="tarjeta p-4 md:landscape:p-6">
        <p className="etiqueta md:landscape:text-sm">Control</p>
        <p className="mt-1 text-xl md:landscape:text-3xl font-extrabold tracking-tightest">{pesos(50000)}</p>
      </div>
    </div>
  );
}

function Portada() {
  return (
    <Diapo
      visual={
        <div className="rounded-3xl bg-white p-4 w-full max-w-[280px] md:landscape:max-w-none">
          <img
            src="/images/bodyanalyse.jpg"
            alt="Báscula de composición corporal BodyAnalyse"
            className="w-full h-auto object-contain md:landscape:max-h-[50vh]"
          />
        </div>
      }
      titulo={
        <>
          Composición <span className="text-volt-500">corporal</span>
        </>
      }
      bajada="Un análisis completo de tu cuerpo, hecho en un minuto, en la báscula del gimnasio."
    />
  );
}

function QueEsYPrecio() {
  return (
    <Diapo
      titulo="¿Qué es?"
      bajada="Bioimpedancia: de pie y descalzo sobre la báscula, en menos de un minuto. Al terminar te entregan un reporte impreso con todos tus resultados, para que lo guardes y lo compares con el de la próxima vez."
    >
      <PrecioTarjetas />
    </Diapo>
  );
}

function ComposicionCorporalDiapositiva() {
  return (
    <Diapo titulo="Composición corporal">
      <ListaDatos items={['Agua corporal', 'Proteínas', 'Sales minerales', 'Grasa corporal']} />
    </Diapo>
  );
}

function MusculoYGrasa() {
  return (
    <Diapo
      titulo="Músculo y grasa"
      bajada="Cada uno con su rango normal, para saber si estás por debajo, dentro o por encima."
    >
      <ListaDatos items={['Peso', 'Músculo esquelético', 'Grasa corporal']} />
    </Diapo>
  );
}

function Sobrepeso() {
  return (
    <Diapo titulo="Análisis de sobrepeso">
      <ListaDatos
        items={[
          'Índice de masa corporal',
          'Porcentaje de grasa corporal',
          'Índice cintura-cadera',
          'Grasa subcutánea',
        ]}
      />
    </Diapo>
  );
}

function Segmentales() {
  return (
    <Diapo
      titulo="Músculos segmentales"
      bajada="Músculo y grasa medidos por separado en cada extremidad, más la grasa que rodea los órganos -la visceral-, no solo la que se ve."
    >
      <ListaDatos
        items={['Brazo izquierdo y derecho', 'Pierna izquierda y derecha', 'Índice de grasa visceral']}
      />
    </Diapo>
  );
}

function Diagnostico() {
  return (
    <Diapo
      titulo="Diagnóstico de tipo corporal"
      bajada="Con el músculo y la grasa medidos, tu cuerpo queda en uno de estos tipos:"
    >
      <div className="flex flex-wrap justify-center md:landscape:justify-start gap-1.5 md:landscape:gap-2 max-w-sm md:landscape:max-w-2xl">
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
            className="px-2.5 md:landscape:px-3.5 py-1.5 md:landscape:py-2 rounded-full bg-carbon-700 text-humo-300 text-xs md:landscape:text-base font-semibold"
          >
            {tipo}
          </span>
        ))}
      </div>
    </Diapo>
  );
}

function EvaluacionIntegral() {
  return (
    <Diapo titulo="Evaluación integral">
      <p className="text-sm md:landscape:text-lg text-humo-300 leading-relaxed max-w-xs md:landscape:max-w-xl">
        Un resumen de "normal, insuficiente o excesivo" para lo nutricional (proteínas, sales
        minerales, grasa), el peso (peso, músculo esquelético, grasa) y la obesidad (masa
        corporal, porcentaje de grasa).
      </p>
    </Diapo>
  );
}

function ControlDePeso() {
  return (
    <Diapo titulo="Control de peso">
      <ListaDatos
        items={['Peso objetivo', 'Cuánto peso, grasa o músculo controlar', 'Metabolismo basal', 'Edad corporal']}
      />
    </Diapo>
  );
}

function Cierre() {
  return (
    <Diapo
      visual={
        <span className="inline-flex w-14 h-14 md:landscape:w-24 md:landscape:h-24 rounded-2xl items-center justify-center bg-volt-500/15 text-volt-500">
          <IconoCheck className="w-7 h-7 md:landscape:w-12 md:landscape:h-12" />
        </span>
      }
      titulo="Eso es todo"
      bajada="Se hace en el gimnasio, en la báscula del mostrador. Pregunta en recepción."
    >
      <PrecioTarjetas />
    </Diapo>
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
