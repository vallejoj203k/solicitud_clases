import { z } from 'zod';
import type { Sexo } from './tipos';

/**
 * Datos del informe del bodyscanner ("Informe de análisis de composición
 * corporal"), en el mismo orden y con los mismos nombres. El entrenador los
 * escribe con el teclado; aquí se validan (zod) y se revisa que sean coherentes
 * entre sí (un error de tipeo suele romper alguna suma).
 */

export const SEGMENTOS_INFORME = ['brazo_izq', 'brazo_der', 'tronco', 'pierna_izq', 'pierna_der'] as const;
export type SegmentoInforme = (typeof SEGMENTOS_INFORME)[number];

export const NOMBRE_SEGMENTO: Record<SegmentoInforme, string> = {
  brazo_izq: 'Brazo izquierdo',
  brazo_der: 'Brazo derecho',
  tronco: 'Tronco',
  pierna_izq: 'Pierna izquierda',
  pierna_der: 'Pierna derecha',
};

export type Evaluacion = 'normal' | 'bajo' | 'alto';

/** Filas de la sección 6 "Evaluación integral", agrupadas como en el informe. */
export const EVALUACIONES = [
  {
    grupo: 'Evaluación nutricional',
    filas: [
      ['nut_proteina', 'Proteína'],
      ['nut_minerales', 'Sales minerales'],
      ['nut_grasa', 'Grasa'],
    ],
  },
  {
    grupo: 'Evaluación de peso',
    filas: [
      ['peso_peso', 'Peso'],
      ['peso_musculo', 'Masa muscular'],
      ['peso_grasa', 'Grasa'],
    ],
  },
  {
    grupo: 'Evaluación de obesidad',
    filas: [
      ['obe_imc', 'Índice de masa corporal'],
      ['obe_pct_grasa', 'Porcentaje de grasa'],
    ],
  },
] as const;
export type ClaveEvaluacion = (typeof EVALUACIONES)[number]['filas'][number][0];

/** Sección 5 "Diagnóstico de obesidad", en el orden del informe. */
export const DIAGNOSTICOS = [
  'Tipo delgado',
  'Delgado muscular',
  'Muscular estándar',
  'Tipo estándar',
  'Tipo obeso',
  'Tipo musculoso',
  'Obesidad muscular',
  'Falta de ejercicio',
  'Graso muscular',
] as const;
export type Diagnostico = (typeof DIAGNOSTICOS)[number];

/* ------------------------------------------------------ Campos numéricos */

export interface DefCampo {
  clave: string;
  etiqueta: string;
  unidad?: string;
  min: number;
  max: number;
  requerido?: boolean;
  entero?: boolean;
  /** Texto de ayuda bajo el campo. */
  ayuda?: string;
}

const c = (
  clave: string,
  etiqueta: string,
  unidad: string | undefined,
  min: number,
  max: number,
  extra: Partial<DefCampo> = {},
): DefCampo => ({
  clave,
  etiqueta,
  unidad,
  min,
  max,
  ...extra,
});

/** Encabezado del informe. */
export const CAMPOS_ENCABEZADO = [
  c('edad', 'Edad', 'años', 5, 100, { entero: true }),
  c('estatura', 'Estatura', 'cm', 100, 230, { requerido: true }),
];

/** 1 Análisis de composición corporal. */
export const CAMPOS_COMPOSICION = [
  c('agua', 'Agua corporal', 'kg', 5, 120),
  c('proteina', 'Proteína', 'kg', 1, 40),
  c('minerales', 'Sales minerales', 'kg', 0.5, 15),
  c('grasa', 'Grasa corporal', 'kg', 1, 200, { ayuda: 'Grasa corporal o porcentaje de grasa: al menos uno.' }),
  c('plg', 'Peso libre de grasa', 'kg', 15, 150),
  c('peso', 'Peso', 'kg', 25, 300, { requerido: true }),
];

/** 2 Análisis músculo-grasa (peso y grasa ya están en la sección 1). */
export const CAMPOS_MUSCULO_GRASA = [c('masaMuscular', 'Masa muscular', 'kg', 5, 80)];

/** 3 Análisis de sobrepeso. */
export const CAMPOS_SOBREPESO = [
  c('imc', 'Índice de masa corporal', undefined, 8, 80),
  c('pctGrasa', 'Porcentaje de grasa', '%', 2, 75),
  c('cinturaCadera', 'Índice cintura-cadera', undefined, 0.5, 1.5),
  c('grasaSubcutanea', 'Grasa subcutánea', '%', 1, 70),
];

/** 4 Músculo y grasa segmental (kg) + índice de grasa visceral. */
export const campoSegmento = (tipo: 'musculo' | 'grasa', s: SegmentoInforme) =>
  c(
    `${tipo}_${s}`,
    `${tipo === 'musculo' ? 'Músculo' : 'Grasa'} ${NOMBRE_SEGMENTO[s].toLowerCase()}`,
    'kg',
    tipo === 'musculo' ? 0.3 : 0.05,
    s === 'tronco' ? 80 : 30,
    {
      // Los brazos y piernas son obligatorios (dan el volumen de cada segmento);
      // el tronco también sale como resto si falta.
      requerido: s !== 'tronco',
    },
  );
export const CAMPO_VISCERAL = c('visceral', 'Índice grasa visceral', undefined, 1, 30);

/** 7 Control de peso. */
export const CAMPOS_CONTROL = [
  c('pesoObjetivo', 'Peso objetivo', 'kg', 25, 300),
  c('controlPeso', 'Control de peso', 'kg', -150, 150),
  c('controlGrasa', 'Control de grasa', 'kg', -150, 150),
  c('controlMuscular', 'Control muscular', 'kg', -50, 50),
  c('metabolismoBasal', 'Metabolismo basal', 'kcal', 500, 5000, { entero: true }),
  c('evaluacionSalud', 'Evaluación de salud', undefined, 0, 100),
  c('edadCorporal', 'Edad corporal', 'años', 5, 100),
];

/** Medidas con cinta (opcionales; si están, pesan más que las estimaciones). */
export const CAMPOS_MEDIDAS = [
  c('m_pecho', 'Pecho', 'cm', 50, 200),
  c('m_cintura', 'Cintura (a la altura del ombligo)', 'cm', 40, 220),
  c('m_cadera', 'Cadera', 'cm', 50, 220),
  c('m_cuello', 'Cuello', 'cm', 20, 70),
  c('m_brazo', 'Brazo relajado', 'cm', 15, 70),
  c('m_muslo', 'Muslo', 'cm', 25, 110),
  c('m_pantorrilla', 'Pantorrilla', 'cm', 20, 70),
  c('m_entrepierna', 'Entrepierna', 'cm', 50, 110),
];

export const TODOS_LOS_CAMPOS: DefCampo[] = [
  ...CAMPOS_ENCABEZADO,
  ...CAMPOS_COMPOSICION,
  ...CAMPOS_MUSCULO_GRASA,
  ...CAMPOS_SOBREPESO,
  ...SEGMENTOS_INFORME.flatMap((s) => [campoSegmento('musculo', s), campoSegmento('grasa', s)]),
  CAMPO_VISCERAL,
  ...CAMPOS_CONTROL,
  ...CAMPOS_MEDIDAS,
];

/* ------------------------------------------------------------ Validación */

/** "51,0" o "51.0" -> 51. Vacío -> undefined. Otra cosa -> NaN (lo marca zod). */
export function leerNumero(texto: string | undefined): number | undefined {
  const t = (texto ?? '').trim().replace(/\s/g, '').replace(',', '.');
  if (t === '') return undefined;
  return /^[-+]?\d*\.?\d+$/.test(t) ? Number(t) : NaN;
}

const fmt = (x: number) => String(x).replace('.', ',');

function esquemaCampo(d: DefCampo) {
  // z.number() ya rechaza NaN (lo que deja leerNumero con texto que no es número).
  const rango = `Debe estar entre ${fmt(d.min)} y ${fmt(d.max)}`;
  let n = z
    .number({ required_error: 'Obligatorio', invalid_type_error: 'Escribe un número' })
    .min(d.min, rango)
    .max(d.max, rango);
  if (d.entero) n = n.int('Debe ser un número entero');
  return d.requerido ? n : n.optional();
}

const formas: Record<string, z.ZodTypeAny> = {};
for (const d of TODOS_LOS_CAMPOS) {
  formas[d.clave] = z.preprocess((v) => (typeof v === 'string' ? leerNumero(v) : v), esquemaCampo(d));
}

const esquemaNumeros = z.object(formas).superRefine((v, ctx) => {
  if (v.grasa === undefined && v.pctGrasa === undefined) {
    ctx.addIssue({ code: 'custom', path: ['grasa'], message: 'Escribe la grasa corporal (kg) o el porcentaje de grasa' });
  }
});

/** Lo que devuelve el formulario ya validado. */
export interface ClienteInput {
  nombre?: string;
  sexo: Sexo;
  edad?: number;
  estatura: number;
  agua?: number;
  proteina?: number;
  minerales?: number;
  /** kg (si no se escribió, sale del porcentaje). */
  grasa: number;
  pctGrasa: number;
  /** Peso libre de grasa (kg). */
  plg: number;
  peso: number;
  masaMuscular?: number;
  imc: number;
  cinturaCadera?: number;
  grasaSubcutanea?: number;
  segmental: {
    musculo: Record<SegmentoInforme, number>;
    grasa: Record<SegmentoInforme, number>;
    /** true si el tronco no venía y se calculó como resto. */
    troncoCalculado: boolean;
  };
  visceral?: number;
  diagnostico?: Diagnostico;
  evaluacion: Partial<Record<ClaveEvaluacion, Evaluacion>>;
  control: {
    pesoObjetivo?: number;
    peso?: number;
    grasa?: number;
    musculo?: number;
  };
  metabolismoBasal?: number;
  evaluacionSalud?: number;
  edadCorporal?: number;
  medidas: Partial<Record<'pecho' | 'cintura' | 'cadera' | 'cuello' | 'brazo' | 'muslo' | 'pantorrilla' | 'entrepierna', number>>;
}

/** Lo que el formulario guarda tal cual lo escribió el entrenador. */
export interface Borrador {
  nombre: string;
  sexo: Sexo;
  /** Texto de cada campo numérico, por clave. */
  valores: Record<string, string>;
  evaluacion: Partial<Record<ClaveEvaluacion, Evaluacion>>;
  diagnostico?: Diagnostico;
}

/** Fracción de la masa magra y de la grasa que no está en brazos, piernas ni tronco (cabeza y cuello). */
export const FRACCION_CABEZA = { magra: 0.07, grasa: 0.02 };

export type ResultadoValidacion =
  | { ok: true; cliente: ClienteInput; errores: Record<string, string> }
  | { ok: false; cliente: null; errores: Record<string, string> };

export function validar(b: Borrador): ResultadoValidacion {
  const r = esquemaNumeros.safeParse(b.valores);
  if (!r.success) {
    const errores: Record<string, string> = {};
    for (const i of r.error.issues) {
      const k = String(i.path[0]);
      errores[k] ??= i.message;
    }
    return { ok: false, cliente: null, errores };
  }
  const v = r.data as Record<string, number | undefined>;
  const peso = v.peso!;
  const grasa = v.grasa ?? (v.pctGrasa! / 100) * peso;
  const pctGrasa = v.pctGrasa ?? (grasa / peso) * 100;
  const plg = v.plg ?? peso - grasa;

  const musculo = {} as Record<SegmentoInforme, number>;
  const grasaSeg = {} as Record<SegmentoInforme, number>;
  for (const s of SEGMENTOS_INFORME) {
    musculo[s] = v[`musculo_${s}`] ?? NaN;
    grasaSeg[s] = v[`grasa_${s}`] ?? NaN;
  }
  // Tronco = total - extremidades - cabeza, si el informe no lo trae.
  const troncoCalculado = Number.isNaN(musculo.tronco) || Number.isNaN(grasaSeg.tronco);
  if (Number.isNaN(musculo.tronco)) {
    const ext = musculo.brazo_izq + musculo.brazo_der + musculo.pierna_izq + musculo.pierna_der;
    musculo.tronco = plg * (1 - FRACCION_CABEZA.magra) - ext;
  }
  if (Number.isNaN(grasaSeg.tronco)) {
    const ext = grasaSeg.brazo_izq + grasaSeg.brazo_der + grasaSeg.pierna_izq + grasaSeg.pierna_der;
    grasaSeg.tronco = grasa * (1 - FRACCION_CABEZA.grasa) - ext;
  }

  const est = v.estatura! / 100;
  const cliente: ClienteInput = {
    nombre: b.nombre.trim() || undefined,
    sexo: b.sexo,
    edad: v.edad,
    estatura: v.estatura!,
    agua: v.agua,
    proteina: v.proteina,
    minerales: v.minerales,
    grasa,
    pctGrasa,
    plg,
    peso,
    masaMuscular: v.masaMuscular,
    imc: v.imc ?? peso / (est * est),
    cinturaCadera: v.cinturaCadera,
    grasaSubcutanea: v.grasaSubcutanea,
    segmental: { musculo, grasa: grasaSeg, troncoCalculado },
    visceral: v.visceral,
    diagnostico: b.diagnostico,
    evaluacion: b.evaluacion,
    control: { pesoObjetivo: v.pesoObjetivo, peso: v.controlPeso, grasa: v.controlGrasa, musculo: v.controlMuscular },
    metabolismoBasal: v.metabolismoBasal,
    evaluacionSalud: v.evaluacionSalud,
    edadCorporal: v.edadCorporal,
    medidas: {
      pecho: v.m_pecho,
      cintura: v.m_cintura,
      cadera: v.m_cadera,
      cuello: v.m_cuello,
      brazo: v.m_brazo,
      muslo: v.m_muslo,
      pantorrilla: v.m_pantorrilla,
      entrepierna: v.m_entrepierna,
    },
  };
  return { ok: true, cliente, errores: {} };
}

/* ------------------------------------------------------------ Coherencia */

export interface Aviso {
  /** Campos a resaltar. */
  campos: string[];
  texto: string;
}

const kg = (x: number) => `${x.toFixed(1).replace('.', ',')} kg`;

/**
 * Revisa que los valores cuadren entre sí como en el informe. No bloquea nada:
 * solo avisa, porque casi siempre es un número mal tipeado.
 */
export function revisarCoherencia(cl: ClienteInput, b: Borrador): Aviso[] {
  const avisos: Aviso[] = [];
  const escrito = (k: string) => leerNumero(b.valores[k]);
  const tol = 0.35; // el informe redondea a 0,1 kg

  const agua = cl.agua,
    prot = cl.proteina,
    min = cl.minerales;
  if (agua !== undefined && prot !== undefined && min !== undefined && escrito('plg') !== undefined) {
    const suma = agua + prot + min;
    if (Math.abs(suma - cl.plg) > tol) {
      avisos.push({
        campos: ['agua', 'proteina', 'minerales', 'plg'],
        texto: `Agua + proteína + sales minerales = ${kg(suma)}, pero el peso libre de grasa dice ${kg(cl.plg)}.`,
      });
    }
  }
  if (escrito('grasa') !== undefined && escrito('plg') !== undefined && Math.abs(cl.grasa + cl.plg - cl.peso) > tol) {
    avisos.push({
      campos: ['grasa', 'plg', 'peso'],
      texto: `Grasa + peso libre de grasa = ${kg(cl.grasa + cl.plg)}, pero el peso dice ${kg(cl.peso)}.`,
    });
  }
  if (escrito('grasa') !== undefined && escrito('pctGrasa') !== undefined) {
    const pct = (cl.grasa / cl.peso) * 100;
    if (Math.abs(pct - cl.pctGrasa) > 0.6) {
      avisos.push({
        campos: ['grasa', 'peso', 'pctGrasa'],
        texto: `Grasa / peso = ${pct.toFixed(1).replace('.', ',')} %, pero el porcentaje de grasa dice ${cl.pctGrasa.toFixed(1).replace('.', ',')} %.`,
      });
    }
  }
  if (escrito('imc') !== undefined) {
    const imc = cl.peso / (cl.estatura / 100) ** 2;
    if (Math.abs(imc - cl.imc) > 0.35) {
      avisos.push({
        campos: ['imc', 'peso', 'estatura'],
        texto: `Con ese peso y estatura el IMC da ${imc.toFixed(1).replace('.', ',')}, pero el informe dice ${cl.imc.toFixed(1).replace('.', ',')}.`,
      });
    }
  }

  const s = cl.segmental;
  const sumaMusculo = SEGMENTOS_INFORME.reduce((a, k) => a + s.musculo[k], 0);
  const sumaGrasa = SEGMENTOS_INFORME.reduce((a, k) => a + s.grasa[k], 0);
  if (!s.troncoCalculado) {
    if (sumaMusculo > cl.plg + tol) {
      avisos.push({
        campos: SEGMENTOS_INFORME.map((k) => `musculo_${k}`),
        texto: `El músculo segmental suma ${kg(sumaMusculo)}, más que el peso libre de grasa (${kg(cl.plg)}).`,
      });
    }
    if (sumaGrasa > cl.grasa + tol) {
      avisos.push({
        campos: SEGMENTOS_INFORME.map((k) => `grasa_${k}`),
        texto: `La grasa segmental suma ${kg(sumaGrasa)}, más que la grasa corporal (${kg(cl.grasa)}).`,
      });
    }
  } else if (s.musculo.tronco <= 0 || s.grasa.tronco <= 0) {
    avisos.push({
      campos: ['musculo_tronco', 'grasa_tronco'],
      texto: 'Las extremidades suman más que el total: revisa los valores segmentales o escribe los del tronco.',
    });
  }
  for (const [a, b2] of [
    ['brazo_izq', 'brazo_der'],
    ['pierna_izq', 'pierna_der'],
  ] as const) {
    if (Math.abs(s.musculo[a] / s.musculo[b2] - 1) > 0.25) {
      avisos.push({
        campos: [`musculo_${a}`, `musculo_${b2}`],
        texto: `${NOMBRE_SEGMENTO[a]} y ${NOMBRE_SEGMENTO[b2].toLowerCase()} difieren más de un 25 % en músculo.`,
      });
    }
  }

  const c2 = cl.control;
  if (c2.pesoObjetivo !== undefined && c2.pesoObjetivo < cl.plg) {
    avisos.push({
      campos: ['pesoObjetivo'],
      texto: `El peso objetivo (${kg(c2.pesoObjetivo)}) es menor que el peso libre de grasa (${kg(cl.plg)}): no se llega solo bajando grasa. Para el cuerpo objetivo se usan los controles de grasa y músculo.`,
    });
  }
  if (
    c2.peso !== undefined &&
    c2.grasa !== undefined &&
    c2.musculo !== undefined &&
    Math.abs(c2.grasa + c2.musculo - c2.peso) > tol
  ) {
    avisos.push({
      campos: ['controlPeso', 'controlGrasa', 'controlMuscular'],
      texto: `Control de grasa + control muscular = ${kg(c2.grasa + c2.musculo)}, pero el control de peso dice ${kg(c2.peso)}.`,
    });
  }
  if (cl.medidas.cintura !== undefined && cl.medidas.cadera !== undefined && cl.cinturaCadera !== undefined) {
    const r = cl.medidas.cintura / cl.medidas.cadera;
    if (Math.abs(r - cl.cinturaCadera) > 0.06) {
      avisos.push({
        campos: ['m_cintura', 'm_cadera', 'cinturaCadera'],
        texto: `Con la cinta, cintura / cadera = ${r.toFixed(2).replace('.', ',')}; el informe dice ${String(cl.cinturaCadera).replace('.', ',')}.`,
      });
    }
  }
  return avisos;
}
