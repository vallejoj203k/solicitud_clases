import type { EntradaAjuste, Objetivo, ResultadoAjuste } from './ajuste';
import { leerNumero, TODOS_LOS_CAMPOS, type Borrador } from './campos';
import {
  CONTROLES_DE_GRASA,
  CURVA_MUSCULO_POR_GRASA,
  DENSIDAD_GRASA_SEGMENTO,
  DENSIDAD_MAGRA_SEGMENTO,
  DENSIDAD_MAGRA_TOTAL,
  FORMA_GRASA_CORRECCION_MAX,
  FORMA_GRASA_POR_PUNTO_DE_INDICE,
  GRASA_REFERENCIA,
  INDICE_MAGRO_PROMEDIO,
  INDICE_MAGRO_REAL,
  LAMBDA_BARRIGA_CON_VISCERAL,
  LAMBDA_FORMA_GRASA,
  LAMBDA_MUSCULO_CON_DATO,
  MUSCULO_CORRECCION_INDICE_MAX,
  MUSCULO_CORRECCION_MAX,
  MUSCULO_POR_PUNTO_DE_INDICE,
  MUSCULO_REFERENCIA,
  MUSCULO_SENSIBILIDAD,
  MUSCULO_SIN_GRASA_PROMEDIO,
  PARAMETROS_AJUSTE,
  PCT_GRASA_POR_DEFECTO,
  TOLERANCIAS,
  barrigaPorVisceral,
  interpolar,
} from './config';
import { MACRO_INICIAL } from './controles';

/**
 * Objetivos del ajuste a partir de lo escrito en el formulario. Se arman dos
 * cuerpos, en este orden, y el músculo NO depende de la grasa:
 *
 * 1. Músculo (cuerpo sin grasa, lo rojo): estatura, masa libre de grasa (su
 *    volumen, PLG / 1,1), masa magra de cada brazo y pierna, y las medidas de
 *    esqueleto (hombros, entrepierna). Nada de grasa: ni % ni kg ni cinta de
 *    contornos (la cinta mide músculo + grasa).
 * 2. Grasa (el cuerpo completo, lo amarillo): parte del músculo, con su
 *    esqueleto y su músculo fijos, y suma grasa hasta el volumen total (peso /
 *    densidad de Siri), el volumen de cada brazo y pierna (magra/1,06 +
 *    grasa/0,90) y los contornos medidos con cinta. La grasa visceral decide la
 *    barriga. El "peso" de MakeHuman no puede quedar por debajo del músculo.
 *
 * No hace falta que el formulario esté completo: con estatura y peso ya se
 * puede ajustar, y cada medida que se agregue suma un objetivo.
 */

/** "Peso" de MakeHuman al que tiende el cuerpo sin grasa. */
const PESO_SIN_GRASA = 0.2;

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
 * Objetivos del cuerpo completo (músculo + grasa). null si todavía no hay
 * estatura y peso válidos. `mantener`: medidas del modelo antes del cambio (modo
 * "Editar un valor"); las que no se escribieron con cinta se piden suaves.
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
  // La forma de la grasa (ver config): con el mismo volumen, el % de grasa
  // decide si el cuerpo pesado se ve musculoso o gordo.
  if (pctEscrito !== undefined) {
    const ajustarA = (x: number, max: number) => Math.max(-max, Math.min(max, x));
    let musculo = interpolar(CURVA_MUSCULO_POR_GRASA[b.sexo], pctEscrito);
    const plg = pesoLibreDeGrasa(b);
    if (plg !== undefined) {
      const indice = plg / (estatura / 100) ** 2;
      musculo += ajustarA((indice - INDICE_MAGRO_REAL[b.sexo]) * FORMA_GRASA_POR_PUNTO_DE_INDICE, FORMA_GRASA_CORRECCION_MAX);
      const masaMuscular = numero(b, 'masaMuscular');
      if (masaMuscular !== undefined) {
        musculo += ajustarA(((masaMuscular / plg - MUSCULO_REFERENCIA[b.sexo]) / MUSCULO_SENSIBILIDAD) * MUSCULO_CORRECCION_MAX, MUSCULO_CORRECCION_MAX);
      }
    }
    priors['macro:musculo'] = Math.min(1, Math.max(0, musculo));
    lambdas['macro:musculo'] = LAMBDA_FORMA_GRASA;

    // Con poca grasa, los controles de grasa son caros: el volumen lo ponen el
    // peso y el músculo, no la barriga ni los flancos.
    const falta = (GRASA_REFERENCIA[b.sexo] - pctEscrito) / 10;
    if (falta > 0) {
      for (const def of PARAMETROS_AJUSTE) {
        const [tipo, clave] = def.clave.split(':');
        if (tipo !== 'local' || !CONTROLES_DE_GRASA.includes(clave)) continue;
        if (def.clave === 'local:barriga' && visceral !== undefined) continue; // la decide la grasa visceral
        lambdas[def.clave] = def.lambda * (1 + falta * 1.5);
      }
    }
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
 * 1. El músculo (cuerpo sin grasa): solo con datos magros. null si no hay
 * estatura y peso (o masa libre de grasa).
 */
export function entradaMusculoDe(b: Borrador): EntradaAjuste | null {
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
  // Hombros y entrepierna quedan en el promedio: sus medidas con cinta son del
  // cuerpo completo (la entrepierna depende de lo gruesos que sean los muslos)
  // y las ajusta la grasa; el Worker se las pasa después a este cuerpo.
  const fijar: Record<string, number> = { 'local:hombros': 0, 'local:entrepierna': 0 };
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

  // Cuánto músculo: por el índice de masa libre de grasa y la masa muscular
  // (no por la grasa). El "peso" de MakeHuman parte bajo (da forma de grasa).
  const ajustarA = (x: number, max: number) => Math.max(-max, Math.min(max, x));
  const indice = plg / (estatura / 100) ** 2;
  let musculo = MUSCULO_SIN_GRASA_PROMEDIO + ajustarA((indice - INDICE_MAGRO_PROMEDIO[b.sexo]) * MUSCULO_POR_PUNTO_DE_INDICE, MUSCULO_CORRECCION_INDICE_MAX);
  const masaMuscular = numero(b, 'masaMuscular');
  if (masaMuscular !== undefined) {
    musculo += ajustarA(((masaMuscular / plg - MUSCULO_REFERENCIA[b.sexo]) / MUSCULO_SENSIBILIDAD) * MUSCULO_CORRECCION_MAX, MUSCULO_CORRECCION_MAX);
  }
  musculo = Math.min(1, Math.max(0, musculo));

  // Sin grasa: los controles de grasa en 0 (también el busto: copa mínima).
  for (const k of CONTROLES_DE_GRASA) fijar[`local:${k}`] = 0;
  return {
    objetivos,
    fijos: { edad: Math.max(MACRO_INICIAL.edad, numero(b, 'edad') ?? MACRO_INICIAL.edad), copa: b.sexo === 'F' ? 0 : MACRO_INICIAL.copa },
    fijar,
    priors: { 'macro:musculo': musculo, 'macro:peso': PESO_SIN_GRASA },
    lambdas: { 'macro:musculo': LAMBDA_MUSCULO_CON_DATO, 'macro:peso': 0.4 },
    inicial: { 'macro:musculo': musculo, 'macro:peso': PESO_SIN_GRASA },
    maxIteraciones: 20,
  };
}

/**
 * 2. La grasa (cuerpo completo) sobre ese músculo: los objetivos del cuerpo
 * completo, partiendo de la altura del cuerpo sin grasa. Lo demás queda libre porque solo da la forma de la capa amarilla: el
 * cuerpo sin grasa (lo rojo) ya está decidido y no cambia.
 */
export function entradaGrasaDe(completo: EntradaAjuste, musculo: ResultadoAjuste): EntradaAjuste {
  // Hombros y entrepierna solo se mueven si se midieron con cinta: si no, no
  // sirven para sumar volumen.
  const fijar: Record<string, number> = {};
  const medidas = new Set(completo.objetivos.map((o) => o.clave));
  for (const k of ['hombros', 'entrepierna']) if (!medidas.has(k)) fijar[`local:${k}`] = 0;
  // La altura parte de la del músculo (la corrige apenas si hace falta por la
  // entrepierna medida).
  const priors = { ...completo.priors, 'macro:altura': musculo.macro.altura };
  // La grasa no puede dejar el cuerpo más chico que el músculo: el Worker corre
  // hacia afuera la capa donde lo tocaría (motor.contenerFuera).
  return { ...completo, fijar, priors, maxIteraciones: 20 };
}

/**
 * El esqueleto que el músculo toma del cuerpo completo: hombros y entrepierna
 * (los ajusta la cinta, que se mide sobre la grasa). Así los dos cuerpos tienen
 * el mismo esqueleto.
 */
export function conEsqueletoDe(musculo: ResultadoAjuste, completo: ResultadoAjuste): ResultadoAjuste {
  return { ...musculo, locales: { ...musculo.locales, hombros: completo.locales.hombros ?? 0, entrepierna: completo.locales.entrepierna ?? 0 } };
}
