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

/** Vista "grasa sobre músculo" (como la silueta negra con borde amarillo). */
export const COLOR_MAGRO = '#A9AEB6';
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
