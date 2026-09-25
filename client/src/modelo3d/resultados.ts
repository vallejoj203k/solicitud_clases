import { leerNumero, SEGMENTOS_INFORME, type Borrador, type ClienteInput, type SegmentoInforme } from './cliente';
import {
  ESCALA_CINTURA_CADERA,
  ESCALA_GRASA,
  ESCALA_IMC,
  ESCALA_VISCERAL,
  MAPA_CALOR,
  type Tramo,
} from './config';

/**
 * Fase 5: lo que se le muestra al cliente además del cuerpo: tarjetas de
 * resultado, el estado de cada segmento (mapa de calor) y los datos del cuerpo
 * objetivo (para "Comparar").
 */

export function tramoDe(escala: Tramo[], valor: number): Tramo {
  let t = escala[0];
  for (const x of escala) if (valor >= x.min) t = x;
  return t;
}

const num = (x: number, d = 1) => x.toFixed(d).replace('.', ',');

/* ------------------------------------------------------------- Tarjetas */

export interface Tarjeta {
  clave: string;
  titulo: string;
  /** Título corto (imagen PNG). */
  corto: string;
  valor: string;
  unidad?: string;
  detalle?: string;
  tramo?: Tramo;
  /** Barra de colores con la posición del valor. */
  escala?: { tramos: Tramo[]; min: number; max: number; valor: number };
}

export function tarjetasDe(c: ClienteInput): Tarjeta[] {
  const out: Tarjeta[] = [];
  out.push({
    clave: 'imc',
    titulo: 'Índice de masa corporal',
    corto: 'IMC',
    valor: num(c.imc),
    tramo: tramoDe(ESCALA_IMC, c.imc),
    escala: { tramos: ESCALA_IMC, min: 15, max: 45, valor: c.imc },
  });
  const escalaGrasa = ESCALA_GRASA[c.sexo];
  out.push({
    clave: 'grasa',
    titulo: 'Porcentaje de grasa',
    corto: 'Grasa corporal',
    valor: num(c.pctGrasa),
    unidad: '%',
    detalle: `Rango fitness: ${escalaGrasa[2].min}–${escalaGrasa[3].min} %`,
    tramo: tramoDe(escalaGrasa, c.pctGrasa),
    escala: { tramos: escalaGrasa, min: 0, max: 45, valor: c.pctGrasa },
  });
  if (c.visceral !== undefined) {
    out.push({
      clave: 'visceral',
      titulo: 'Grasa visceral',
      corto: 'Grasa visceral',
      valor: num(c.visceral, Number.isInteger(c.visceral) ? 0 : 1),
      detalle: 'Normal: 1 a 9',
      tramo: tramoDe(ESCALA_VISCERAL, c.visceral),
      escala: { tramos: ESCALA_VISCERAL, min: 1, max: 20, valor: c.visceral },
    });
  }
  // Cintura-cadera: la cinta manda sobre el índice del informe.
  const cc =
    c.medidas.cintura !== undefined && c.medidas.cadera !== undefined ? c.medidas.cintura / c.medidas.cadera : c.cinturaCadera;
  if (cc !== undefined) {
    const escala = ESCALA_CINTURA_CADERA[c.sexo];
    out.push({
      clave: 'cc',
      titulo: 'Índice cintura-cadera',
      corto: 'Cintura-cadera',
      valor: num(cc, 2),
      detalle: `${c.medidas.cintura !== undefined && c.medidas.cadera !== undefined ? 'Con la cinta. ' : ''}Riesgo desde ${num(escala[1].min, 2)}`,
      tramo: tramoDe(escala, cc),
      escala: { tramos: escala, min: 0.6, max: 1.2, valor: cc },
    });
  }
  out.push({
    clave: 'masas',
    titulo: 'Masa grasa · libre de grasa',
    corto: 'Grasa · sin grasa',
    valor: `${num(c.grasa)} · ${num(c.plg)}`,
    unidad: 'kg',
    detalle: c.masaMuscular !== undefined ? `Masa muscular: ${num(c.masaMuscular)} kg` : undefined,
  });
  if (c.edadCorporal !== undefined) {
    const dif = c.edad !== undefined ? c.edadCorporal - c.edad : undefined;
    out.push({
      clave: 'edad',
      titulo: 'Edad corporal',
      corto: 'Edad corporal',
      valor: num(c.edadCorporal, 0),
      unidad: 'años',
      detalle:
        dif === undefined ? undefined : dif === 0 ? 'Igual a la edad real' : `${Math.abs(dif)} años ${dif < 0 ? 'menos' : 'más'} que la edad real`,
    });
  }
  return out;
}

/* -------------------------------------------------------- Mapa de calor */

export type Estado = 'bajo' | 'normal' | 'alto';

export interface EstadoSegmento {
  grasa: { estado: Estado; pct: number };
  musculo: { estado: Estado; relativo: number };
}

/** Estado de grasa y de músculo de cada segmento del informe. */
export function estadoSegmentos(c: ClienteInput): Record<SegmentoInforme, EstadoSegmento> {
  const cfg = MAPA_CALOR;
  const [gMin, gMax] = cfg.grasaNormal[c.sexo];
  const [mMin, mMax] = cfg.musculoNormal;
  const est = c.estatura / 100;
  const pesoIdeal = cfg.imcIdeal * est * est;
  const plgIdeal = pesoIdeal * (1 - cfg.grasaIdeal[c.sexo] / 100);
  const out = {} as Record<SegmentoInforme, EstadoSegmento>;
  for (const s of SEGMENTOS_INFORME) {
    const magra = c.segmental.musculo[s];
    const grasa = c.segmental.grasa[s];
    const pct = (grasa / (grasa + magra)) * 100;
    const relativo = magra / (plgIdeal * cfg.fraccionMagra[c.sexo][s]);
    out[s] = {
      grasa: { estado: pct < gMin ? 'bajo' : pct > gMax ? 'alto' : 'normal', pct },
      musculo: { estado: relativo < mMin ? 'bajo' : relativo > mMax ? 'alto' : 'normal', relativo },
    };
  }
  return out;
}

/* ------------------------------------------------------- Cuerpo objetivo */

/**
 * Datos del cuerpo objetivo: los controles de grasa y músculo del informe
 * repartidos en proporción a cada segmento (si el cliente debe bajar el 60 % de
 * su grasa, cada brazo, pierna y el tronco bajan el 60 % de la suya). No se usa
 * el "peso objetivo" del informe: puede pedir menos que la masa libre de grasa.
 * null si no hay controles de grasa ni de músculo.
 */
export function borradorObjetivo(b: Borrador): Borrador | null {
  const v = (k: string) => {
    const n = leerNumero(b.valores[k]);
    return n === undefined || Number.isNaN(n) ? undefined : n;
  };
  const peso = v('peso');
  const cg = v('controlGrasa') ?? 0;
  const cm = v('controlMuscular') ?? 0;
  if (peso === undefined || (cg === 0 && cm === 0)) return null;
  const pct = v('pctGrasa');
  const grasa = v('grasa') ?? (pct !== undefined ? (pct / 100) * peso : undefined);
  if (grasa === undefined) return null;
  const plg = v('plg') ?? peso - grasa;

  const grasaObj = Math.max(0.05 * grasa, grasa + cg);
  const plgObj = plg + cm;
  const fGrasa = grasaObj / grasa;
  const fMagra = plgObj / plg;
  const pesoObj = grasaObj + plgObj;
  const f = (x: number, d = 2) => String(Math.round(x * 10 ** d) / 10 ** d);

  const valores: Record<string, string> = {};
  for (const k of ['edad', 'estatura']) if (b.valores[k]) valores[k] = b.valores[k];
  valores.peso = f(pesoObj, 1);
  valores.grasa = f(grasaObj, 1);
  valores.pctGrasa = f((grasaObj / pesoObj) * 100, 1);
  valores.plg = f(plgObj, 1);
  const mm = v('masaMuscular');
  if (mm !== undefined) valores.masaMuscular = f(mm + cm, 1);
  for (const s of SEGMENTOS_INFORME) {
    const m = v(`musculo_${s}`);
    const g = v(`grasa_${s}`);
    if (m !== undefined) valores[`musculo_${s}`] = f(m * fMagra);
    if (g !== undefined) valores[`grasa_${s}`] = f(g * fGrasa);
  }
  const visceral = v('visceral');
  if (visceral !== undefined) valores.visceral = f(Math.max(1, visceral * fGrasa), 1);
  return { nombre: b.nombre, sexo: b.sexo, valores, evaluacion: {} };
}
