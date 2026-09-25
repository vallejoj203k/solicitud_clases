/// <reference lib="webworker" />
import { expose, transfer } from 'comlink';
import { normalesVertice } from './geometria';
import { medir, posicionesArticulaciones, prepararMedicion, type Anillos, type Medidas, type PrepMedicion } from './medicion';
import { aplicarMorphs, contenerDentro } from './motor';
import type { CuerpoBase, PesosMorph, Sexo } from './tipos';

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

  calcular(sexo: Sexo, pesos: PesosMorph, pesosMagro: PesosMorph | null, conAnillos: boolean): ResultadoMotor {
    const c = cuerpos.get(sexo);
    if (!c) throw new Error(`El cuerpo ${sexo} no está iniciado en el Worker`);
    const { cuerpo, prep } = c;
    const t0 = performance.now();

    const info = { desplazoY: 0 };
    const pos = aplicarMorphs(cuerpo, pesos, undefined, info);
    const msMorphs = performance.now() - t0;
    const normales = normalesVertice(pos, cuerpo.indicesTriangulos);
    const articulaciones = posicionesArticulaciones(prep, pesos, info.desplazoY);
    const { medidas, anillos } = medir(cuerpo, prep, pos, articulaciones, conAnillos);

    let magro: Malla | undefined;
    if (pesosMagro) {
      const pm = contenerDentro(aplicarMorphs(cuerpo, pesosMagro), pos, normales);
      magro = { pos: pm, normales: normalesVertice(pm, cuerpo.indicesTriangulos) };
    }

    const res: ResultadoMotor = { sexo, cuerpo: { pos, normales }, magro, medidas, anillos, ms: performance.now() - t0, msMorphs };
    const buffers = [pos.buffer, normales.buffer, ...Object.values(anillos).map((a) => a.buffer)];
    if (magro) buffers.push(magro.pos.buffer, magro.normales.buffer);
    return transfer(res, buffers as ArrayBuffer[]);
  },
};

export type ApiMotor = typeof api;

expose(api);
