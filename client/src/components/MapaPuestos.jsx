import { cx } from './ui.jsx';

/**
 * Mapa de puestos reutilizable.
 *
 * NO conoce nada de running ni de spinning: dibuja lo que le llega en `mapa`,
 * que el servidor arma expandiendo el `layoutPuestos` del tipo de clase. Un
 * salón nuevo con otra distribución funciona sin tocar este componente.
 *
 * mapa = {
 *   titulo, columnas, pasilloDespuesDeCol,
 *   filas: [{ label, nota, offset, puestos: [{ codigo, etiqueta, columna, estado }] }]
 * }
 * estado ∈ "libre" | "ocupado" | "bloqueado"
 *
 * `alTocarOcupado` habilita los puestos tomados: se usa en recepción para ver
 * quién reservó cada uno. Sin esa prop siguen deshabilitados, como en el flujo
 * del cliente.
 */
const ANCHO_MIN_PUESTO = 38; // px — suficiente para el dedo sin necesidad de zoom
// Tope de tamaño: en un salón angosto (pocas columnas) los puestos crecerían hasta
// ocupar toda la pantalla y las últimas filas quedarían fuera de vista. El valor
// sale de `--ancho-puesto` (index.css), que sube en tablet horizontal.
const ANCHO_MAX_PUESTO = 'var(--ancho-puesto, 60px)';
const ANCHO_PASILLO = 14;

// Semáforo del salón. El tinte va como capa sobre un fondo OPACO, no como color
// translúcido: detrás puede haber una foto y los números tienen que leerse igual.
const VERDE = '#33D67F';
const ROJO = '#FF5A4C';
const FONDO = '#1C2028';
const tinte = (color, alfa) => ({
  borderColor: `${color}${alfa}`,
  backgroundColor: FONDO,
  backgroundImage: `linear-gradient(0deg, ${color}2B, ${color}2B)`,
});

function Puesto({ puesto, seleccionado, onSeleccionar, alTocarOcupado }) {
  const disponible = puesto.estado === 'libre';
  const libre = disponible || puesto.estado === 'libreFijo';
  const ocupado = puesto.estado === 'ocupado';
  const ocupadoTocable = ocupado && Boolean(alTocarOcupado);
  const etiquetas = {
    libre: 'disponible',
    libreFijo: 'disponible',
    ocupado: ocupadoTocable ? 'ocupado, toca para ver quién reservó' : 'ocupado',
    bloqueado: 'fuera de servicio',
  };

  return (
    <button
      type="button"
      disabled={!disponible && !ocupadoTocable}
      aria-pressed={seleccionado}
      aria-label={`Puesto ${puesto.codigo}, ${etiquetas[puesto.estado]}`}
      onClick={() => {
        if (disponible) onSeleccionar(puesto.codigo);
        else if (ocupadoTocable) alTocarOcupado(puesto);
      }}
      style={{
        gridColumn: puesto.columnaGrid,
        // El elegido se pinta en verde sólido: mismo color que "libre" pero
        // relleno, para que se lea como "este puesto ya es tuyo".
        ...(seleccionado
          ? { backgroundColor: VERDE, borderColor: VERDE }
          : libre
            ? tinte(VERDE, '99')
            : ocupado
              ? tinte(ROJO, ocupadoTocable ? '99' : '66')
              : {}),
      }}
      className={cx(
        'relative aspect-square rounded-xl border text-[13px] font-bold tabular-nums',
        'flex items-center justify-center transition-all duration-150 select-none',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-carbon-800 focus-visible:ring-volt-500',
        seleccionado && 'text-carbon-900 scale-105 shadow-alzado animate-latido z-10 ring-2 ring-white/70',
        !seleccionado && libre && 'text-puesto-libre',
        !seleccionado && disponible && 'hover:brightness-125 active:scale-95',
        puesto.estado === 'libreFijo' && 'cursor-default',
        ocupado &&
          (ocupadoTocable
            ? 'text-puesto-ocupado cursor-pointer hover:brightness-125 active:scale-95'
            : 'text-puesto-ocupado/80 cursor-not-allowed'),
        puesto.estado === 'bloqueado' &&
          'bg-carbon-900 border-dashed border-carbon-600 text-carbon-500 cursor-not-allowed'
      )}
    >
      {puesto.estado === 'bloqueado' ? '×' : puesto.etiqueta}
    </button>
  );
}

export default function MapaPuestos({
  mapa,
  seleccionado = null,
  onSeleccionar = () => {},
  // En el panel de admin el mapa es solo una vista del salón: no se elige nada.
  soloLectura = false,
  // Si se pasa, los puestos ocupados se pueden tocar (recepción).
  alTocarOcupado = null,
}) {
  if (!mapa) return null;

  const { columnas, pasilloDespuesDeCol } = mapa;
  const hayPasillo = Boolean(pasilloDespuesDeCol) && pasilloDespuesDeCol < columnas;

  // El pasillo se implementa como una columna extra y estrecha del grid: así el
  // layout sigue siendo una sola cuadrícula y las columnas quedan alineadas
  // entre filas aunque tengan distinta cantidad de puestos.
  const anchos = [];
  for (let c = 1; c <= columnas; c += 1) {
    anchos.push(`minmax(${ANCHO_MIN_PUESTO}px, ${ANCHO_MAX_PUESTO})`);
    if (hayPasillo && c === pasilloDespuesDeCol) anchos.push(`${ANCHO_PASILLO}px`);
  }
  const gridTemplateColumns = anchos.join(' ');

  const posicionGrid = (columna) =>
    hayPasillo && columna > pasilloDespuesDeCol ? columna + 1 : columna;

  return (
    <div className="animate-aparecer">
      {mapa.titulo && (
        <div className="mb-5">
          <div className="mx-auto max-w-[70%] rounded-b-3xl bg-gradient-to-b from-carbon-600 to-carbon-700 border-x border-b border-carbon-600 py-2 text-center">
            <span className="etiqueta text-humo-300">{mapa.titulo}</span>
          </div>
        </div>
      )}

      {/* Scroll horizontal solo si el salón es muy ancho para la pantalla. */}
      <div className="-mx-1 overflow-x-auto px-1 pb-1">
        <div className="min-w-fit space-y-2">
          {mapa.filas.map((fila) => (
            <div key={fila.label} className="flex items-center justify-center gap-2">
              <span className="w-6 shrink-0 text-center text-[11px] font-bold text-carbon-500 tabular-nums">
                {fila.label}
              </span>
              <div className="grid gap-2" style={{ gridTemplateColumns }}>
                {fila.puestos.map((puesto) => (
                  <Puesto
                    key={puesto.codigo}
                    puesto={{
                      ...puesto,
                      columnaGrid: posicionGrid(puesto.columna),
                      estado: soloLectura && puesto.estado === 'libre' ? 'libreFijo' : puesto.estado,
                    }}
                    seleccionado={seleccionado === puesto.codigo}
                    onSeleccionar={onSeleccionar}
                    alTocarOcupado={alTocarOcupado}
                  />
                ))}
              </div>
              {/* Contrapeso de la etiqueta de fila: sin él la cuadrícula queda
                  descentrada respecto al rótulo del salón. */}
              <span className="w-6 shrink-0" aria-hidden="true" />
            </div>
          ))}
        </div>
      </div>

      <Leyenda soloLectura={soloLectura} />
    </div>
  );
}

function Leyenda({ soloLectura }) {
  const items = [
    { texto: 'Disponible', estilo: tinte(VERDE, '99') },
    ...(soloLectura ? [] : [{ texto: 'Tu puesto', estilo: { backgroundColor: VERDE, borderColor: VERDE } }]),
    { texto: 'Ocupado', estilo: tinte(ROJO, '66') },
    { texto: 'Fuera de servicio', clase: 'bg-carbon-900 border-dashed border-carbon-600' },
  ];
  return (
    <div className="mt-6 flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
      {items.map((item) => (
        <span key={item.texto} className="flex items-center gap-1.5 text-[11px] text-humo-500">
          <span
            className={cx('w-3.5 h-3.5 rounded-[5px] border', item.clase)}
            style={item.estilo}
          />
          {item.texto}
        </span>
      ))}
    </div>
  );
}
