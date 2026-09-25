import { z } from 'zod';

/**
 * Datos del informe del bodyscanner ("Informe de análisis de composición
 * corporal"), en el mismo orden y con los mismos nombres. El entrenador los
 * escribe con el teclado; aquí se validan (zod) y se revisa que sean coherentes
 * entre sí (un error de tipeo suele romper alguna suma).
 */

export * from './campos';
import {
  NOMBRE_SEGMENTO,
  SEGMENTOS_INFORME,
  TODOS_LOS_CAMPOS,
  leerNumero,
  type Borrador,
  type ClienteInput,
  type DefCampo,
  type SegmentoInforme,
} from './campos';

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
      hombros: v.m_hombros,
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
