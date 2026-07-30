/**
 * Catálogo mínimo con el que la app es utilizable: las dos disciplinas y la
 * distribución de sus salones.
 *
 * Lo comparten el seed (datos de prueba) y el bootstrap de arranque, para que
 * los layouts estén definidos en un solo lugar.
 */

export const LAYOUT_SPINNING = {
  titulo: 'TARIMA · INSTRUCTOR',
  numeracion: 'porFila',
  pasilloDespuesDeCol: 3, // pasillo central entre la columna 3 y la 4
  filas: [
    { label: 'A', puestos: 6, nota: 'Primera fila' },
    { label: 'B', puestos: 6 },
    { label: 'C', puestos: 6 },
    { label: 'D', puestos: 6 },
  ],
};

export const LAYOUT_RUNNING = {
  titulo: 'PANTALLAS · FRENTE',
  numeracion: 'continua', // trotadoras numeradas 1..12
  filas: [
    { label: 'F1', puestos: 4, nota: 'Frente' },
    { label: 'F2', puestos: 4 },
    { label: 'F3', puestos: 4 },
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
