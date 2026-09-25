/**
 * Constantes configurables del modelo 3D. Los rangos y constantes de
 * composición corporal (fases 3 y 4) también van a vivir aquí.
 */

/** Colores del modo "segmentos" del visor (tronco, cabeza, brazos, piernas). */
export const COLOR_SEGMENTO: Record<string, string> = {
  tronco: '#8CC63F',
  cabeza: '#B7BDC9',
  brazo_izq: '#4CE0E0',
  brazo_der: '#2BB8B8',
  pierna_izq: '#F5A524',
  pierna_der: '#D9822B',
};

/**
 * Vista "grasa sobre músculo": el cuerpo sin grasa (músculo, hueso, órganos) en
 * rojo músculo y la grasa en amarillo, la convención de los diagramas de
 * composición corporal.
 */
export const COLOR_MAGRO = '#B04A42';
export const COLOR_GRASA = '#F5B323';

/**
 * Circunferencias que mide el motor (fase 2).
 *
 * landmark: banda de vértices del JSON (sale de los targets de medida de
 *   MakeHuman); el plano pasa por su centroide.
 * plano: 'horizontal' como una cinta alrededor del torso, o 'eje' perpendicular
 *   al hueso entre dos articulaciones (brazos y piernas en pose A no son
 *   verticales: un corte horizontal los mediría en diagonal).
 * segmentos: solo se cortan triángulos de esos segmentos (así la mano que cuelga
 *   junto a la cadera no entra en la cinta de la cadera).
 * holgura: el corte se limita a (radio de la banda × holgura); descarta otras
 *   partes que el plano infinito alcance a tocar.
 *
 * Cintura: se mide a la altura del ombligo, que es donde se toma con cinta en el
 * gimnasio y donde sobresale la barriga. Para medirla en la cintura natural (la
 * parte más angosta, la banda de MakeHuman), quitar `alturaDe`.
 */
export interface DefCircunferencia {
  etiqueta: string;
  landmark: string;
  /** Si se da, el plano pasa a la altura de este otro landmark (la banda sigue dando centro y radio). */
  alturaDe?: string;
  plano: 'horizontal' | 'eje';
  eje?: [string, string];
  segmentos: string[];
  holgura: number;
}

export const CIRCUNFERENCIAS: Record<string, DefCircunferencia> = {
  cuello: { etiqueta: 'Cuello', landmark: 'cuello', plano: 'eje', eje: ['joint-neck', 'joint-head'], segmentos: ['cabeza', 'tronco'], holgura: 1.3 },
  pecho: { etiqueta: 'Pecho', landmark: 'pecho', plano: 'horizontal', segmentos: ['tronco'], holgura: 1.4 },
  bajo_busto: { etiqueta: 'Bajo busto', landmark: 'bajo_busto', plano: 'horizontal', segmentos: ['tronco'], holgura: 1.4 },
  cintura: { etiqueta: 'Cintura (ombligo)', landmark: 'cintura', alturaDe: 'ombligo', plano: 'horizontal', segmentos: ['tronco'], holgura: 1.4 },
  cadera: { etiqueta: 'Cadera', landmark: 'cadera', plano: 'horizontal', segmentos: ['tronco', 'pierna_izq', 'pierna_der'], holgura: 1.4 },
  brazo_izq: { etiqueta: 'Brazo izq.', landmark: 'brazo_izq', plano: 'eje', eje: ['joint-l-shoulder', 'joint-l-elbow'], segmentos: ['brazo_izq'], holgura: 1.5 },
  brazo_der: { etiqueta: 'Brazo der.', landmark: 'brazo_der', plano: 'eje', eje: ['joint-r-shoulder', 'joint-r-elbow'], segmentos: ['brazo_der'], holgura: 1.5 },
  muslo_izq: { etiqueta: 'Muslo izq.', landmark: 'muslo_izq', plano: 'eje', eje: ['joint-l-upper-leg', 'joint-l-knee'], segmentos: ['pierna_izq'], holgura: 1.5 },
  muslo_der: { etiqueta: 'Muslo der.', landmark: 'muslo_der', plano: 'eje', eje: ['joint-r-upper-leg', 'joint-r-knee'], segmentos: ['pierna_der'], holgura: 1.5 },
  pantorrilla_izq: { etiqueta: 'Pantorrilla izq.', landmark: 'pantorrilla_izq', plano: 'eje', eje: ['joint-l-knee', 'joint-l-ankle'], segmentos: ['pierna_izq'], holgura: 1.5 },
  pantorrilla_der: { etiqueta: 'Pantorrilla der.', landmark: 'pantorrilla_der', plano: 'eje', eje: ['joint-r-knee', 'joint-r-ankle'], segmentos: ['pierna_der'], holgura: 1.5 },
};

/** Entrepierna: el vértice más bajo de la línea media (|x| < esto, en m) por encima del 30 % de la estatura. */
export const ENTREPIERNA_TOLERANCIA_X = 0.004;

/* ------------------------------------------------------------ Solver (fase 3) */

/**
 * Parámetros que ajusta el solver. clave: 'macro:<control>' o 'local:<control>'.
 * prior: valor al que tiende si ningún objetivo lo pide; escala y lambda: cuánto
 * cuesta alejarse de él (costo = (lambda · (x − prior) / escala)²). Un objetivo
 * errado en un sigma cuesta 1: con lambda 0,5, llevar un control local de 0 a 1
 * cuesta 0,25, así que los datos mandan, pero entre dos formas de cumplirlos
 * gana la que menos deforma.
 */
export interface DefParametro {
  clave: string;
  min: number;
  max: number;
  prior: number;
  escala: number;
  lambda: number;
  /** Solo para un sexo. */
  solo?: 'M' | 'F';
}

const local = (clave: string, lambda: number, min = -1, max = 1): DefParametro => ({ clave: `local:${clave}`, min, max, prior: 0, escala: 1, lambda });

export const PARAMETROS_AJUSTE: DefParametro[] = [
  // El volumen lo resuelven sobre todo el peso y el músculo de MakeHuman.
  { clave: 'macro:musculo', min: 0, max: 1, prior: 0.5, escala: 0.5, lambda: 0.4 },
  { clave: 'macro:peso', min: 0, max: 1, prior: 0.5, escala: 0.5, lambda: 0.1 },
  // La estatura la resuelve la altura, casi sin costo.
  { clave: 'macro:altura', min: 0, max: 1, prior: 0.5, escala: 0.5, lambda: 0.02 },
  // Grasa y músculo por segmento.
  ...['brazo_izq', 'brazo_der', 'pierna_izq', 'pierna_der'].flatMap((s) => [local(`${s}_grasa`, 0.6), local(`${s}_musculo`, 0.8)]),
  // Torso y medidas.
  local('barriga', 0.5),
  local('cintura', 0.5),
  local('cadera', 0.5),
  local('pecho', 0.5),
  local('cuello', 0.6),
  local('hombros', 0.5),
  local('entrepierna', 0.4),
  local('torso_ancho', 0.7),
  local('gluteos', 0.7),
  local('pectoral', 0.8),
  local('espalda_v', 0.8),
  // Sin un objetivo propio: caros, para que no se usen solo para sumar volumen.
  local('cara_grasa', 1.5),
  local('papada', 1.5, 0, 1),
  { ...local('pecho_graso', 1.2, 0, 1), solo: 'M' },
];

/** Semillas de músculo x peso: se arranca desde la que mejor cumple los objetivos. */
export const SEMILLAS_AJUSTE: [number, number][] = [
  [0.5, 0.5],
  [0.5, 0.8],
  [0.3, 0.9],
  [0.1, 0.9],
  [0.8, 0.8],
  [0.8, 0.4],
  [0.3, 0.3],
];

/** Objetivos: desvío normal (sigma) y criterio de aceptación de cada tipo. */
export const TOLERANCIAS = {
  estatura: { sigma: 0.15, tolerancia: 0.5 }, // cm
  volumen: { sigma: 0.005, tolerancia: 0.02 }, // fracción del volumen
  segmento: { sigma: 0.02, tolerancia: 0.05 }, // fracción del volumen del segmento
  cinta: { sigma: 0.4, tolerancia: 1.5 }, // cm
};

/** % de grasa que se supone si no hay dato (para la densidad y la vista de grasa). */
export const PCT_GRASA_POR_DEFECTO = { M: 20, F: 28 };

/**
 * Grasa visceral -> valor inicial del morph de barriga (curva lineal por tramos,
 * [nivel visceral, barriga]). Los niveles 1 a 9 casi no la mueven; desde 10
 * crece de forma notable. El solver parte de este valor y lo mueve solo si las
 * medidas lo piden.
 */
export const CURVA_VISCERAL: [number, number][] = [
  [1, 0],
  [9, 0.1],
  [10, 0.25],
  [13, 0.55],
  [16, 0.85],
  [20, 1],
];

/** Con dato de grasa visceral, la barriga se aleja menos de la curva (más que el 0,5 por defecto). */
export const LAMBDA_BARRIGA_CON_VISCERAL = 3;

export function barrigaPorVisceral(nivel: number): number {
  const c = CURVA_VISCERAL;
  if (nivel <= c[0][0]) return c[0][1];
  for (let i = 1; i < c.length; i++) {
    const [x0, y0] = c[i - 1];
    const [x1, y1] = c[i];
    if (nivel <= x1) return y0 + ((nivel - x0) / (x1 - x0)) * (y1 - y0);
  }
  return c[c.length - 1][1];
}

/* ------------------------------------------------ Composición (fase 4) */

/** Densidades por segmento (kg/L): masa magra y grasa. Volumen = magra/1,06 + grasa/0,90. */
export const DENSIDAD_MAGRA_SEGMENTO = 1.06;
export const DENSIDAD_GRASA_SEGMENTO = 0.9;
/** Densidad de toda la masa libre de grasa (Siri): volumen del cuerpo sin grasa = PLG / 1,1. */
export const DENSIDAD_MAGRA_TOTAL = 1.1;

/**
 * Prior del músculo de MakeHuman: masa muscular / peso libre de grasa comparado
 * con un valor típico por sexo. Cada `sensibilidad` por encima de la referencia
 * sube el prior 0,5 (de 0,5 a 1).
 */
export const MUSCULO_REFERENCIA = { M: 0.555, F: 0.52 };
export const MUSCULO_SENSIBILIDAD = 0.1;
export const LAMBDA_MUSCULO_CON_DATO = 0.8;

/** Controles que agregan grasa: el cuerpo sin grasa no los usa para crecer. */
export const CONTROLES_DE_GRASA = [
  'brazo_izq_grasa',
  'brazo_der_grasa',
  'pierna_izq_grasa',
  'pierna_der_grasa',
  'barriga',
  'cintura',
  'cadera',
  'pecho',
  'cuello',
  'torso_ancho',
  'gluteos',
  'cara_grasa',
  'papada',
  'pecho_graso',
];

/** Controles del esqueleto: el cuerpo sin grasa los copia del cuerpo completo. */
export const CONTROLES_DE_ESQUELETO = ['macro:altura', 'local:hombros', 'local:entrepierna'];

/* ------------------------------------------------- Resultados (fase 5) */

/** Tramo de una escala: desde `min` (incluido) hasta el siguiente tramo. */
export interface Tramo {
  min: number;
  etiqueta: string;
  color: string;
}

/** IMC, clasificación de la OMS. */
export const ESCALA_IMC: Tramo[] = [
  { min: 0, etiqueta: 'Bajo peso', color: '#4CE0E0' },
  { min: 18.5, etiqueta: 'Normal', color: '#8CC63F' },
  { min: 25, etiqueta: 'Sobrepeso', color: '#F5C542' },
  { min: 30, etiqueta: 'Obesidad I', color: '#F5A524' },
  { min: 35, etiqueta: 'Obesidad II', color: '#FF7F45' },
  { min: 40, etiqueta: 'Obesidad III', color: '#FF5A4C' },
];

/** % de grasa por sexo (rangos de referencia del American Council on Exercise). */
export const ESCALA_GRASA: Record<'M' | 'F', Tramo[]> = {
  M: [
    { min: 0, etiqueta: 'Esencial', color: '#4CE0E0' },
    { min: 6, etiqueta: 'Atleta', color: '#6FD0A0' },
    { min: 14, etiqueta: 'Fitness', color: '#8CC63F' },
    { min: 18, etiqueta: 'Promedio', color: '#F5C542' },
    { min: 25, etiqueta: 'Alto', color: '#FF5A4C' },
  ],
  F: [
    { min: 0, etiqueta: 'Esencial', color: '#4CE0E0' },
    { min: 14, etiqueta: 'Atleta', color: '#6FD0A0' },
    { min: 21, etiqueta: 'Fitness', color: '#8CC63F' },
    { min: 25, etiqueta: 'Promedio', color: '#F5C542' },
    { min: 32, etiqueta: 'Alto', color: '#FF5A4C' },
  ],
};

/** Índice de grasa visceral (escala del bodyscanner: normal 1 a 9). */
export const ESCALA_VISCERAL: Tramo[] = [
  { min: 0, etiqueta: 'Normal', color: '#8CC63F' },
  { min: 10, etiqueta: 'Alto', color: '#F5A524' },
  { min: 15, etiqueta: 'Muy alto', color: '#FF5A4C' },
];

/** Índice cintura-cadera: riesgo según la OMS (sustancialmente aumentado desde 0,90 en hombres y 0,85 en mujeres). */
export const ESCALA_CINTURA_CADERA: Record<'M' | 'F', Tramo[]> = {
  M: [
    { min: 0, etiqueta: 'Normal', color: '#8CC63F' },
    { min: 0.9, etiqueta: 'Riesgo alto', color: '#FF5A4C' },
  ],
  F: [
    { min: 0, etiqueta: 'Normal', color: '#8CC63F' },
    { min: 0.85, etiqueta: 'Riesgo alto', color: '#FF5A4C' },
  ],
};

/**
 * Mapa de calor por segmento.
 * Grasa: % de grasa del segmento (grasa / (grasa + magra)) con el rango "normal"
 * de % de grasa del sexo.
 * Músculo: masa magra del segmento frente a la de una persona de la misma
 * estatura y sexo con IMC 22 y % de grasa típico, repartida con las fracciones
 * típicas de los informes de bioimpedancia. Normal entre 90 % y 110 %, como los
 * informes del bodyscanner.
 */
export const MAPA_CALOR = {
  grasaNormal: { M: [10, 20], F: [18, 28] } as Record<'M' | 'F', [number, number]>,
  imcIdeal: 22,
  grasaIdeal: { M: 15, F: 23 } as Record<'M' | 'F', number>,
  /** Fracción de la masa libre de grasa en cada segmento. */
  fraccionMagra: {
    M: { brazo_izq: 0.053, brazo_der: 0.053, tronco: 0.46, pierna_izq: 0.155, pierna_der: 0.155 },
    F: { brazo_izq: 0.045, brazo_der: 0.045, tronco: 0.47, pierna_izq: 0.16, pierna_der: 0.16 },
  } as Record<'M' | 'F', Record<string, number>>,
  musculoNormal: [0.9, 1.1] as [number, number],
  colores: { bajo: '#4CE0E0', normal: '#8CC63F', alto: '#F5A524', sinDato: '#8A93A3' },
};

/** Tonos del cuerpo en la vista realista (el primero es el maniquí gris). */
export const COLORES_CUERPO = ['#B9B9B9', '#F1D3C0', '#D9A77F', '#B07A52', '#7A4B2E', '#4A2E1E'];
