/**
 * Catálogo mínimo con el que la app es utilizable: las dos disciplinas y la
 * distribución de sus salones.
 *
 * Lo comparten el seed (datos de prueba) y el bootstrap de arranque, para que
 * los layouts estén definidos en un solo lugar.
 */

// Salón real: 18 bicicletas en 3 columnas x 6 filas.
export const LAYOUT_SPINNING = {
  titulo: 'TARIMA · INSTRUCTOR',
  numeracion: 'porFila', // A1..A3, B1..B3, ... F1..F3
  filas: [
    { label: 'A', puestos: 3, nota: 'Primera fila' },
    { label: 'B', puestos: 3 },
    { label: 'C', puestos: 3 },
    { label: 'D', puestos: 3 },
    { label: 'E', puestos: 3 },
    { label: 'F', puestos: 3 },
  ],
};

// Salón real: 6 trotadoras en 2 columnas x 3 filas.
export const LAYOUT_RUNNING = {
  titulo: 'PANTALLAS · FRENTE',
  numeracion: 'continua', // trotadoras numeradas 1..6
  filas: [
    { label: 'F1', puestos: 2, nota: 'Frente' },
    { label: 'F2', puestos: 2 },
    { label: 'F3', puestos: 2 },
  ],
};

export const TIPOS_CLASE = [
  {
    slug: 'running',
    nombre: 'Running',
    descripcion: 'Series, cuestas y trote continuo guiado por un coach.',
    color: '#C8F751',
    icono: 'run',
    precioCop: 22000,
    orden: 0,
    layoutPuestos: LAYOUT_RUNNING,
  },
  {
    slug: 'spinning',
    nombre: 'Spinning',
    descripcion: 'Ritmo, música alta y 45 minutos que se sienten como 10.',
    color: '#4CE0E0',
    icono: 'bike',
    precioCop: 25000,
    orden: 1,
    layoutPuestos: LAYOUT_SPINNING,
  },
];
