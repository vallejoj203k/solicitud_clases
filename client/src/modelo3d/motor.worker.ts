/// <reference lib="webworker" />
import { expose, transfer } from 'comlink';
import { ajustar, controlesSinGrasa, fraccionVolumenGrasa, type EntradaAjuste, type ResultadoAjuste } from './ajuste';
import { controlesLocales, pesosLocales, pesosMacro, type ControlesMacro } from './controles';
import { normalesVertice } from './geometria';
import { medir, posicionesArticulaciones, prepararMedicion, type Anillos, type Medidas, type PrepMedicion } from './medicion';
import { aplicarMorphs, contenerDentro } from './motor';
import type { CuerpoBase, Sexo } from './tipos';

/**
 * Worker del motor: aplica los morphs, calcula normales y mide, fuera del hilo
 * principal. El visor solo copia los arrays que devuelve a la geometría.
 */

export interface Malla {
  pos: Float32Array;
  normales: Float32Array;
}

export interface ResultadoMotor {
  sexo: Sexo;
  cuerpo: Malla;
  /** Cuerpo sin grasa (vista "grasa sobre músculo"), ya contenido dentro del completo. */
  magro?: Malla;
  /** Grosor de la capa de grasa en cada vértice (m), medido sobre la normal exterior. */
  espesor?: Float32Array;
  medidas: Medidas;
  anillos: Anillos;
  /** Tiempo del cálculo completo dentro del Worker. */
  ms: number;
  /** Solo lo de aplicar los morphs (sin normales ni medición). */
  msMorphs: number;
}

const cuerpos = new Map<Sexo, { cuerpo: CuerpoBase; prep: PrepMedicion }>();

const api = {
  iniciar(cuerpo: CuerpoBase) {
    if (!cuerpos.has(cuerpo.sexo)) cuerpos.set(cuerpo.sexo, { cuerpo, prep: prepararMedicion(cuerpo) });
  },

  /** Fase 3: controles que hacen que la malla cumpla los objetivos. */
  ajustar(sexo: Sexo, entrada: EntradaAjuste): ResultadoAjuste {
    const c = cuerpos.get(sexo);
    if (!c) throw new Error(`El cuerpo ${sexo} no está iniciado en el Worker`);
    return ajustar(c.cuerpo, c.prep, entrada);
  },

  /**
   * Cuerpo con esos controles, sus medidas y, si se pasa pctGrasa, el cuerpo sin
   * grasa (vista "grasa sobre músculo") con el grosor de grasa de cada punto.
   */
  calcular(
    sexo: Sexo,
    macro: ControlesMacro,
    locales: Record<string, number>,
    pctGrasa: number | null,
    conAnillos: boolean,
  ): ResultadoMotor {
    const c = cuerpos.get(sexo);
    if (!c) throw new Error(`El cuerpo ${sexo} no está iniciado en el Worker`);
    const { cuerpo, prep } = c;
    const t0 = performance.now();
    const pesos = { ...pesosMacro(macro, sexo), ...pesosLocales(locales, controlesLocales(cuerpo.meta)) };

    const info = { desplazoY: 0 };
    const pos = aplicarMorphs(cuerpo, pesos, undefined, info);
    const msMorphs = performance.now() - t0;
    const normales = normalesVertice(pos, cuerpo.indicesTriangulos);
    const articulaciones = posicionesArticulaciones(prep, pesos, info.desplazoY);
    const { medidas, anillos } = medir(cuerpo, prep, pos, articulaciones, conAnillos);

    let magro: Malla | undefined;
    let espesor: Float32Array | undefined;
    if (pctGrasa !== null) {
      const volumenMagro = medidas.volumenL * (1 - fraccionVolumenGrasa(pctGrasa));
      const pm = contenerDentro(controlesSinGrasa(cuerpo, macro, locales, volumenMagro).pos, pos, normales, 0.003);
      magro = { pos: pm, normales: normalesVertice(pm, cuerpo.indicesTriangulos) };
      espesor = new Float32Array(pos.length / 3);
      for (let v = 0; v < espesor.length; v++) {
        const i = v * 3;
        const d = (pos[i] - pm[i]) * normales[i] + (pos[i + 1] - pm[i + 1]) * normales[i + 1] + (pos[i + 2] - pm[i + 2]) * normales[i + 2];
        espesor[v] = Math.max(0, d);
      }
    }

    const res: ResultadoMotor = { sexo, cuerpo: { pos, normales }, magro, espesor, medidas, anillos, ms: performance.now() - t0, msMorphs };
    const buffers = [pos.buffer, normales.buffer, ...Object.values(anillos).map((a) => a.buffer)];
    if (magro) buffers.push(magro.pos.buffer, magro.normales.buffer);
    if (espesor) buffers.push(espesor.buffer);
    return transfer(res, buffers as ArrayBuffer[]);
  },
};

export type ApiMotor = typeof api;

expose(api);
