import type { EntradaAjuste, Objetivo, ResultadoAjuste } from './ajuste';
import { leerNumero, TODOS_LOS_CAMPOS, type Borrador } from './cliente';
import {
  CONTROLES_DE_ESQUELETO,
  CONTROLES_DE_GRASA,
  DENSIDAD_GRASA_SEGMENTO,
  DENSIDAD_MAGRA_SEGMENTO,
  DENSIDAD_MAGRA_TOTAL,
  LAMBDA_BARRIGA_CON_VISCERAL,
  LAMBDA_MUSCULO_CON_DATO,
  MUSCULO_REFERENCIA,
  MUSCULO_SENSIBILIDAD,
  PCT_GRASA_POR_DEFECTO,
  TOLERANCIAS,
  barrigaPorVisceral,
} from './config';
import { MACRO_INICIAL } from './controles';

/**
 * Fase 3: objetivos geométricos directos a partir de lo escrito en el
 * formulario. No hace falta que el formulario esté completo: con estatura y
 * peso ya se puede ajustar, y cada medida con cinta que se agregue suma un
 * objetivo.
 *
 * Fase 4: los datos de composición del scanner. Cada brazo y cada pierna debe
 * tener el volumen de su masa magra más su grasa (magra/1,06 + grasa/0,90); el
 * tronco queda como resto del volumen total. La masa muscular fija el punto de
 * partida del músculo. Y se arma un segundo cuerpo, el sin grasa (lo rojo de la
 * vista "grasa sobre músculo"), con la masa libre de grasa total y la masa
 * magra de cada brazo y pierna.
 */

/** Qué tanto se sostienen las medidas previas en "Editar un valor" (cm): más que la regularización, menos que la cinta. */
const SIGMA_MANTENER = 1;

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

/**
 * null si todavía no hay estatura y peso válidos.
 * `mantener`: medidas del modelo antes del cambio (modo "Editar un valor"); las
 * que no se escribieron con cinta se piden suaves para que no se muevan.
 */
export function entradaAjusteDe(b: Borrador, mantener?: Record<string, number>): EntradaAjuste | null {
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
  if (mantener) {
    const escritas = new Set(objetivos.map((o) => o.clave));
    for (const [clave, valor] of Object.entries(mantener)) {
      if (escritas.has(clave) || !Number.isFinite(valor)) continue;
      objetivos.push({ clave, etiqueta: clave, valor, unidad: 'cm', fuente: 'anterior', sigma: SIGMA_MANTENER, tolerancia: Infinity });
    }
  }

  // Fase 4: volumen de cada brazo y pierna (masa magra + grasa del segmento).
  for (const s of EXTREMIDADES) {
    const seg = segmentoDe(b, s);
    if (!seg) continue;
    const v = seg.magra / DENSIDAD_MAGRA_SEGMENTO + seg.grasa / DENSIDAD_GRASA_SEGMENTO;
    objetivos.push({
      clave: `vol:${s}`,
      etiqueta: `Volumen ${NOMBRE_EXTREMIDAD[s]}`,
      valor: v,
      unidad: 'L',
      fuente: 'scanner',
      sigma: TOLERANCIAS.segmento.sigma * v,
      tolerancia: TOLERANCIAS.segmento.tolerancia * v,
    });
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
  // Masa muscular / peso libre de grasa: cuán musculoso es respecto de lo típico.
  const masaMuscular = numero(b, 'masaMuscular');
  const plg = pesoLibreDeGrasa(b);
  if (masaMuscular !== undefined && plg !== undefined) {
    const ratio = masaMuscular / plg;
    priors['macro:musculo'] = Math.min(0.95, Math.max(0.05, 0.5 + (0.5 * (ratio - MUSCULO_REFERENCIA[b.sexo])) / MUSCULO_SENSIBILIDAD));
    lambdas['macro:musculo'] = LAMBDA_MUSCULO_CON_DATO;
  }
  return { objetivos, fijos: { edad: Math.max(MACRO_INICIAL.edad, edad ?? MACRO_INICIAL.edad) }, priors, lambdas };
}

/* ------------------------------------------------------------ Fase 4 */

const EXTREMIDADES = ['brazo_izq', 'brazo_der', 'pierna_izq', 'pierna_der'] as const;
const NOMBRE_EXTREMIDAD: Record<(typeof EXTREMIDADES)[number], string> = {
  brazo_izq: 'brazo izq.',
  brazo_der: 'brazo der.',
  pierna_izq: 'pierna izq.',
  pierna_der: 'pierna der.',
};

/** Masa magra y grasa (kg) de un segmento, si están las dos. */
function segmentoDe(b: Borrador, s: string): { magra: number; grasa: number } | undefined {
  const magra = numero(b, `musculo_${s}`);
  const grasa = numero(b, `grasa_${s}`);
  return magra !== undefined && grasa !== undefined ? { magra, grasa } : undefined;
}

/** Peso libre de grasa (kg): el escrito o peso × (1 − % de grasa). */
export function pesoLibreDeGrasa(b: Borrador): number | undefined {
  const plg = numero(b, 'plg');
  if (plg !== undefined) return plg;
  const peso = numero(b, 'peso');
  if (peso === undefined) return undefined;
  return peso * (1 - (pctGrasaDe(b) ?? PCT_GRASA_POR_DEFECTO[b.sexo]) / 100);
}

/**
 * Cuerpo sin grasa: misma estatura y mismo esqueleto que el cuerpo completo,
 * con el volumen de la masa libre de grasa y la masa magra de cada brazo y
 * pierna. Parte del cuerpo completo; los controles de grasa tienden a no sumar
 * (prior = mínimo entre su valor y 0) y los de músculo, a quedar como estaban.
 * En la mujer se usa la copa mínima: el busto es sobre todo grasa.
 */
export function entradaSinGrasaDe(b: Borrador, exterior: ResultadoAjuste, entradaExterior: EntradaAjuste): EntradaAjuste | null {
  const estatura = numero(b, 'estatura');
  const plg = pesoLibreDeGrasa(b);
  if (estatura === undefined || plg === undefined) return null;
  const volumen = plg / DENSIDAD_MAGRA_TOTAL;

  const objetivos: Objetivo[] = [
    { clave: 'estatura', etiqueta: 'Estatura', valor: estatura, unidad: 'cm', fuente: 'scanner', ...TOLERANCIAS.estatura },
    {
      clave: 'volumen',
      etiqueta: 'Volumen sin grasa (PLG / 1,1)',
      valor: volumen,
      unidad: 'L',
      fuente: numero(b, 'plg') !== undefined || pctGrasaDe(b) !== undefined ? 'scanner' : 'estimado',
      sigma: TOLERANCIAS.volumen.sigma * volumen,
      tolerancia: TOLERANCIAS.volumen.tolerancia * volumen,
    },
  ];
  for (const s of EXTREMIDADES) {
    const seg = segmentoDe(b, s);
    if (!seg) continue;
    const v = seg.magra / DENSIDAD_MAGRA_SEGMENTO;
    objetivos.push({
      clave: `vol:${s}`,
      etiqueta: `Músculo ${NOMBRE_EXTREMIDAD[s]}`,
      valor: v,
      unidad: 'L',
      fuente: 'scanner',
      sigma: TOLERANCIAS.segmento.sigma * v,
      tolerancia: TOLERANCIAS.segmento.tolerancia * v,
    });
  }

  const valorDe = (clave: string) => {
    const [tipo, k] = clave.split(':');
    return tipo === 'macro' ? (exterior.macro as unknown as Record<string, number>)[k] : exterior.locales[k] ?? 0;
  };
  const fijar: Record<string, number> = {};
  for (const k of CONTROLES_DE_ESQUELETO) fijar[k] = valorDe(k);
  const priors: Record<string, number> = {};
  const inicial: Record<string, number> = { 'macro:musculo': exterior.macro.musculo, 'macro:peso': exterior.macro.peso };
  for (const [k, v] of Object.entries(exterior.locales)) {
    const clave = `local:${k}`;
    inicial[clave] = v;
    priors[clave] = CONTROLES_DE_GRASA.includes(k) ? Math.min(v, 0) : v;
  }
  priors['macro:musculo'] = exterior.macro.musculo;
  priors['macro:peso'] = exterior.macro.peso;
  return {
    objetivos,
    fijos: { edad: entradaExterior.fijos.edad, copa: b.sexo === 'F' ? 0 : exterior.macro.copa },
    fijar,
    priors,
    // El peso de MakeHuman es lo que más baja al sacar la grasa: casi libre.
    lambdas: { 'macro:peso': 0.05 },
    inicial,
  };
}
