import type { Sexo } from './tipos';

/**
 * Campos del informe del bodyscanner y los tipos del cliente, sin la
 * validación (que usa zod y vive en cliente.ts): así el Worker, que solo
 * necesita leer números, no carga zod.
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
  c('m_hombros', 'Ancho de hombros', 'cm', 25, 60, { ayuda: 'En línea recta, de la punta de un hombro a la otra (acromion), por la espalda.' }),
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

/** "51,0" o "51.0" -> 51. Vacío -> undefined. Otra cosa -> NaN (lo marca zod). */
export function leerNumero(texto: string | undefined): number | undefined {
  const t = (texto ?? '').trim().replace(/\s/g, '').replace(',', '.');
  if (t === '') return undefined;
  return /^[-+]?\d*\.?\d+$/.test(t) ? Number(t) : NaN;
}

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
  medidas: Partial<Record<'pecho' | 'cintura' | 'cadera' | 'cuello' | 'brazo' | 'muslo' | 'pantorrilla' | 'entrepierna' | 'hombros', number>>;
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

