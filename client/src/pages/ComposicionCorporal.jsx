import { Link } from 'react-router-dom';
import { IconoAtras, IconoComposicion } from '../components/Iconos.jsx';
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
 */
export default function ComposicionCorporal() {
  return (
    <div className="min-h-dvh pb-16">
      <header className="px-5 pt-6 pb-4 flex items-center gap-3">
        <Link
          to={rutaInicio()}
          aria-label="Volver"
          className="p-2 -ml-2 rounded-xl text-humo-300 hover:bg-carbon-700 active:scale-95"
        >
          <IconoAtras />
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-extrabold tracking-tightest">Composición corporal</h1>
          <p className="text-xs text-humo-500">Analiza tu cuerpo con tecnología profesional.</p>
        </div>
      </header>

      <main className="px-5 max-w-2xl mx-auto space-y-6">
        {/* Precio: lo primero que alguien quiere saber antes de decidir
            hacérselo. Dos tarjetas en vez de una tabla: el primer análisis es
            la puerta de entrada -precio bajo para probarlo-, los siguientes ya
            son seguimiento de progreso. */}
        <div className="grid grid-cols-2 gap-3">
          <div className="tarjeta p-4 border-volt-500/40">
            <p className="etiqueta text-volt-500">Primer análisis</p>
            <p className="mt-1 text-2xl font-extrabold tracking-tightest">{pesos(20000)}</p>
            <p className="mt-1 text-xs text-humo-500">Para conocer tu punto de partida.</p>
          </div>
          <div className="tarjeta p-4">
            <p className="etiqueta">Desde el segundo</p>
            <p className="mt-1 text-2xl font-extrabold tracking-tightest">{pesos(50000)}</p>
            <p className="mt-1 text-xs text-humo-500">Para medir tu progreso en el tiempo.</p>
          </div>
        </div>

        <div className="tarjeta p-4 bg-white flex items-center justify-center">
          <img
            src="/images/bodyanalyse.png"
            alt="Báscula de composición corporal BodyAnalyse"
            className="max-h-64 w-auto object-contain"
          />
        </div>

        <div className="tarjeta p-5">
          <div className="flex items-center gap-3 mb-2">
            <span className="inline-flex w-9 h-9 rounded-xl items-center justify-center bg-volt-500/20 text-volt-500">
              <IconoComposicion className="w-5 h-5" />
            </span>
            <h2 className="font-bold tracking-tight text-humo-100">Qué es</h2>
          </div>
          <p className="text-sm text-humo-300 leading-relaxed">
            Un análisis de bioimpedancia, de pie y descalzo sobre la báscula, que toma menos de
            un minuto. Al terminar te entregan un reporte impreso con todos tus resultados, para
            que lo guardes y lo compares con el de la próxima vez.
          </p>
        </div>

        <Seccion titulo="Composición corporal">
          <ListaDatos items={['Agua corporal', 'Proteínas', 'Sales minerales', 'Grasa corporal']} />
        </Seccion>

        <Seccion titulo="Músculo y grasa">
          <ListaDatos items={['Peso', 'Músculo esquelético', 'Grasa corporal']} />
          <p className="mt-2 text-xs text-humo-500">
            Cada uno con su rango normal, para saber si estás por debajo, dentro o por encima.
          </p>
        </Seccion>

        <Seccion titulo="Análisis de sobrepeso">
          <ListaDatos
            items={[
              'Índice de masa corporal',
              'Porcentaje de grasa corporal',
              'Índice cintura-cadera',
              'Grasa subcutánea',
            ]}
          />
        </Seccion>

        <Seccion titulo="Músculos segmentales">
          <p className="text-sm text-humo-300 leading-relaxed mb-2">
            Músculo y grasa medidos por separado en cada brazo y cada pierna, más el índice de
            grasa visceral -la que rodea los órganos, no la que se ve-.
          </p>
          <ListaDatos
            items={[
              'Brazo izquierdo y derecho',
              'Pierna izquierda y derecha',
              'Índice de grasa visceral',
            ]}
          />
        </Seccion>

        <Seccion titulo="Diagnóstico de tipo corporal">
          <p className="text-sm text-humo-300 leading-relaxed mb-3">
            Con el músculo y la grasa medidos, el reporte ubica tu cuerpo en uno de estos tipos:
          </p>
          <div className="flex flex-wrap gap-1.5">
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
                className="px-2.5 py-1 rounded-full bg-carbon-700 text-humo-300 text-xs font-semibold"
              >
                {tipo}
              </span>
            ))}
          </div>
        </Seccion>

        <Seccion titulo="Evaluación integral">
          <p className="text-sm text-humo-300 leading-relaxed">
            Un resumen de "normal, insuficiente o excesivo" para lo nutricional (proteínas,
            sales minerales, grasa), el peso (peso, músculo esquelético, grasa) y la obesidad
            (masa corporal, porcentaje de grasa).
          </p>
        </Seccion>

        <Seccion titulo="Control de peso">
          <ListaDatos
            items={[
              'Peso objetivo',
              'Cuánto peso, grasa o músculo controlar',
              'Metabolismo basal',
              'Edad corporal',
            ]}
          />
        </Seccion>

        <div className="tarjeta p-4 text-center">
          <p className="text-sm text-humo-300">
            Se hace en el gimnasio, en la báscula del mostrador. Pregunta en recepción.
          </p>
        </div>
      </main>
    </div>
  );
}

function Seccion({ titulo, children }) {
  return (
    <section className="tarjeta p-5">
      <h2 className="font-bold tracking-tight text-humo-100 mb-2">{titulo}</h2>
      {children}
    </section>
  );
}

function ListaDatos({ items }) {
  return (
    <ul className="space-y-1.5">
      {items.map((item) => (
        <li key={item} className="flex items-center gap-2 text-sm text-humo-300">
          <span className="w-1.5 h-1.5 rounded-full bg-volt-500 shrink-0" />
          {item}
        </li>
      ))}
    </ul>
  );
}
