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
export const LAMBDA_BARRIGA_CON_VISCERAL = 1.2;

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
