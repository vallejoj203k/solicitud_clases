import type { EntradaAjuste, Objetivo } from './ajuste';
import { leerNumero, TODOS_LOS_CAMPOS, type Borrador } from './cliente';
import { LAMBDA_BARRIGA_CON_VISCERAL, PCT_GRASA_POR_DEFECTO, TOLERANCIAS, barrigaPorVisceral } from './config';
import { MACRO_INICIAL } from './controles';

/**
 * Fase 3: objetivos geométricos directos a partir de lo escrito en el
 * formulario. No hace falta que el formulario esté completo: con estatura y
 * peso ya se puede ajustar, y cada medida con cinta que se agregue suma un
 * objetivo. (La fase 4 agrega los volúmenes por segmento del scanner.)
 */

/** Densidad corporal de Siri (kg/L) para un % de grasa. */
export const densidadSiri = (pctGrasa: number) => 495 / (pctGrasa + 450);

/** Valor escrito en un campo, solo si es un número dentro de su rango. */
function numero(b: Borrador, clave: string): number | undefined {
  const n = leerNumero(b.valores[clave]);
  const def = TODOS_LOS_CAMPOS.find((d) => d.clave === clave);
  if (n === undefined || Number.isNaN(n) || !def || n < def.min || n > def.max) return undefined;
  return n;
}

/** % de grasa escrito (o calculado con la grasa en kg y el peso); undefined si no hay. */
export function pctGrasaDe(b: Borrador): number | undefined {
  const pct = numero(b, 'pctGrasa');
  if (pct !== undefined) return pct;
  const grasa = numero(b, 'grasa');
  const peso = numero(b, 'peso');
  return grasa !== undefined && peso !== undefined ? (grasa / peso) * 100 : undefined;
}

/** Medidas con cinta -> medidas de la malla. Brazo, muslo y pantorrilla valen para los dos lados. */
const CINTA: [string, string[], string][] = [
  ['m_pecho', ['circ:pecho'], 'Pecho'],
  ['m_cintura', ['circ:cintura'], 'Cintura'],
  ['m_cadera', ['circ:cadera'], 'Cadera'],
  ['m_cuello', ['circ:cuello'], 'Cuello'],
  ['m_brazo', ['circ:brazo_izq', 'circ:brazo_der'], 'Brazo'],
  ['m_muslo', ['circ:muslo_izq', 'circ:muslo_der'], 'Muslo'],
  ['m_pantorrilla', ['circ:pantorrilla_izq', 'circ:pantorrilla_der'], 'Pantorrilla'],
  ['m_entrepierna', ['entrepierna'], 'Entrepierna'],
  ['m_hombros', ['hombros'], 'Ancho de hombros'],
];

/** null si todavía no hay estatura y peso válidos. */
export function entradaAjusteDe(b: Borrador): EntradaAjuste | null {
  const estatura = numero(b, 'estatura');
  const peso = numero(b, 'peso');
  if (estatura === undefined || peso === undefined) return null;

  const pctEscrito = pctGrasaDe(b);
  const pct = pctEscrito ?? PCT_GRASA_POR_DEFECTO[b.sexo];
  const volumen = peso / densidadSiri(pct);

  const objetivos: Objetivo[] = [
    { clave: 'estatura', etiqueta: 'Estatura', valor: estatura, unidad: 'cm', fuente: 'scanner', ...TOLERANCIAS.estatura },
    {
      clave: 'volumen',
      etiqueta: 'Volumen (peso / densidad)',
      valor: volumen,
      unidad: 'L',
      fuente: pctEscrito === undefined ? 'estimado' : 'scanner',
      sigma: TOLERANCIAS.volumen.sigma * volumen,
      tolerancia: TOLERANCIAS.volumen.tolerancia * volumen,
    },
  ];
  for (const [campo, claves, etiqueta] of CINTA) {
    const v = numero(b, campo);
    if (v === undefined) continue;
    for (const clave of claves) {
      const lado = clave.endsWith('_izq') ? ' izq.' : clave.endsWith('_der') ? ' der.' : '';
      objetivos.push({ clave, etiqueta: etiqueta + lado, valor: v, unidad: 'cm', fuente: 'cinta', ...TOLERANCIAS.cinta });
    }
  }
  const edad = numero(b, 'edad');
  // Grasa visceral: no es una medida de la malla sino el punto de partida de la barriga.
  const visceral = numero(b, 'visceral');
  const priors: Record<string, number> = {};
  const lambdas: Record<string, number> = {};
  if (visceral !== undefined) {
    priors['local:barriga'] = barrigaPorVisceral(visceral);
    lambdas['local:barriga'] = LAMBDA_BARRIGA_CON_VISCERAL;
  }
  return { objetivos, fijos: { edad: Math.max(MACRO_INICIAL.edad, edad ?? MACRO_INICIAL.edad) }, priors, lambdas };
}
