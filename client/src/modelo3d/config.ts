/**
 * Constantes configurables del modelo 3D. Los rangos y constantes de
 * composición corporal (fases 3 y 4) también van a vivir aquí.
 */

/**
 * Mezcla de etnia por defecto. Los GLB traen las tres etnias de MakeHuman como
 * morphs separados, así que cambiar esta mezcla no exige regenerar nada.
 * PENDIENTE: confirmar con el gimnasio la mezcla que quiere (fase 1).
 */
export const ETNIA_POR_DEFECTO = { asiatica: 1 / 3, caucasica: 1 / 3, africana: 1 / 3 };

/** Colores del modo "segmentos" del visor (tronco, cabeza, brazos, piernas). */
export const COLOR_SEGMENTO: Record<string, string> = {
  tronco: '#8CC63F',
  cabeza: '#B7BDC9',
  brazo_izq: '#4CE0E0',
  brazo_der: '#2BB8B8',
  pierna_izq: '#F5A524',
  pierna_der: '#D9822B',
};
