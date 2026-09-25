import type { MetaCuerpo, PesosMorph, Sexo } from './tipos';

/**
 * Controles "humanos" del visor y su traducción a pesos de morph.
 *
 * Los macro de MakeHuman no son morphs sueltos: el músculo y el peso se
 * combinan en una rejilla de 3x3 (mín / prom / máx). El export guarda las 8
 * esquinas como el cuerpo real de MPFB en ese punto; aquí se interpola bilineal
 * por cuadrante, que es exactamente lo que hace MakeHuman entre esos puntos.
 */
export interface ControlesMacro {
  /** 0..1 (0,5 = promedio). */
  musculo: number;
  /** 0..1 (0,5 = promedio). */
  peso: number;
  /** Años (25 = base; MakeHuman llega a 90). */
  edad: number;
  /** 0..1 (0,5 = base). */
  altura: number;
  /** 0..1 (0 = base). */
  proporciones: number;
  /** 0..1 (0,5 = base). Solo mujer. */
  copa: number;
}

export const MACRO_INICIAL: ControlesMacro = {
  musculo: 0.5,
  peso: 0.5,
  edad: 25,
  altura: 0.5,
  proporciones: 0,
  copa: 0.5,
};

const NIVEL = ['min', 'prom', 'max'] as const;

/** Pesos de las esquinas de la rejilla músculo x peso (sin la central). */
export function pesosRejilla(musculo: number, peso: number): PesosMorph {
  const m = Math.min(1, Math.max(0, musculo));
  const w = Math.min(1, Math.max(0, peso));
  // Cuadrante: [0, 0,5] usa los niveles 0-1; [0,5, 1] usa 1-2.
  const im = m < 0.5 ? 0 : 1;
  const iw = w < 0.5 ? 0 : 1;
  const fm = (m - im * 0.5) / 0.5;
  const fw = (w - iw * 0.5) / 0.5;
  const esquinas: [number, number, number][] = [
    [im, iw, (1 - fm) * (1 - fw)],
    [im + 1, iw, fm * (1 - fw)],
    [im, iw + 1, (1 - fm) * fw],
    [im + 1, iw + 1, fm * fw],
  ];
  const pesos: PesosMorph = {};
  for (const [a, b, peso4] of esquinas) {
    if (a === 1 && b === 1) continue; // la esquina central es la malla base
    const nombre = `macro_musculo_${NIVEL[a]}_peso_${NIVEL[b]}`;
    pesos[nombre] = (pesos[nombre] ?? 0) + peso4;
  }
  return pesos;
}

/** Controles macro -> pesos de los morph macro. */
export function pesosMacro(c: ControlesMacro, sexo: Sexo): PesosMorph {
  const pesos = pesosRejilla(c.musculo, c.peso);
  pesos.macro_edad_mayor = Math.min(1, Math.max(0, (c.edad - 25) / (90 - 25)));
  pesos.macro_altura_min = c.altura < 0.5 ? (0.5 - c.altura) / 0.5 : 0;
  pesos.macro_altura_max = c.altura > 0.5 ? (c.altura - 0.5) / 0.5 : 0;
  pesos.macro_proporciones_ideales = c.proporciones;
  if (sexo === 'F') {
    pesos.macro_copa_min = c.copa < 0.5 ? (0.5 - c.copa) / 0.5 : 0;
    pesos.macro_copa_max = c.copa > 0.5 ? (c.copa - 0.5) / 0.5 : 0;
  }
  return pesos;
}

/** Un control local: bipolar (−1..1 sobre X_mas / X_menos) o simple (0..1). */
export interface ControlLocal {
  clave: string;
  etiqueta: string;
  grupo: string;
  bipolar: boolean;
}

/** Controles locales que existen en este cuerpo, sacados de sus morphs. */
export function controlesLocales(meta: MetaCuerpo): ControlLocal[] {
  const out: ControlLocal[] = [];
  const vistos = new Set<string>();
  for (const m of meta.morphs) {
    if (m.grupo === 'macro') continue;
    const bipolar = m.nombre.endsWith('_mas') || m.nombre.endsWith('_menos');
    const clave = bipolar ? m.nombre.replace(/_(mas|menos)$/, '') : m.nombre;
    if (vistos.has(clave)) continue;
    vistos.add(clave);
    out.push({
      clave,
      etiqueta: m.descripcion.replace(/ \((aumenta|disminuye)\)$/, ''),
      grupo: m.grupo,
      bipolar,
    });
  }
  return out;
}

/** Valores de los controles locales -> pesos de morph. */
export function pesosLocales(valores: Record<string, number>, controles: ControlLocal[]): PesosMorph {
  const pesos: PesosMorph = {};
  for (const c of controles) {
    const v = valores[c.clave] ?? 0;
    if (c.bipolar) {
      pesos[`${c.clave}_mas`] = Math.max(0, v);
      pesos[`${c.clave}_menos`] = Math.max(0, -v);
    } else {
      pesos[c.clave] = Math.max(0, v);
    }
  }
  return pesos;
}
