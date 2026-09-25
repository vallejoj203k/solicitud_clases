import { create } from 'zustand';
import { COLORES_CUERPO } from './config';
import { MACRO_INICIAL, type ControlesMacro } from './controles';
import type { ResultadoCliente } from './motor.worker';
import type { Sexo } from './tipos';

/**
 * Modos de vista:
 * - grasa: el cuerpo sin grasa en rojo dentro de la capa de grasa amarilla (principal).
 * - realista: el cuerpo solo, con material de piel mate y el color elegido.
 * - calor: cada segmento coloreado según su estado (bajo / normal / alto) de grasa o de músculo.
 * - comparar: actual y objetivo, lado a lado o el objetivo dentro de un fantasma del actual.
 * Los anillos de medida se pueden sumar a cualquier vista.
 */
export type Vista = 'grasa' | 'realista' | 'calor' | 'comparar';

type Ajustes = 'vista' | 'verAnillos' | 'verSegmentos' | 'calorDe' | 'comparar' | 'mezcla' | 'colorCuerpo' | 'modoMedidas' | 'giro';

interface EstadoVisor {
  sexo: Sexo;
  macro: ControlesMacro;
  /** Valor de cada control local por clave (−1..1 bipolar, 0..1 simple). */
  locales: Record<string, number>;
  /** De dónde salen los controles: del ajuste a los datos o de moverlos a mano. */
  origen: 'ajuste' | 'manual';
  /** Último ajuste a los datos (null si todavía no hay estatura y peso). */
  ajuste: ResultadoCliente | null;
  ajustando: boolean;
  /** Ajuste del cuerpo objetivo (vista comparar). */
  objetivo: ResultadoCliente | null;
  vista: Vista;
  verAnillos: boolean;
  /** Solo para revisar la malla (pestaña de ajuste manual). */
  verSegmentos: boolean;
  calorDe: 'grasa' | 'musculo';
  comparar: 'lado' | 'fantasma';
  /** Transición actual (0) -> objetivo (1) en la vista fantasma. */
  mezcla: number;
  colorCuerpo: string;
  /**
   * Al escribir una medida: 'autoequilibrio' deja que las medidas no escritas se
   * acomoden solas; 'editar' las mantiene como estaban y solo cambia la escrita.
   */
  modoMedidas: 'autoequilibrio' | 'editar';
  /** Giro del cuerpo sobre su eje (radianes), para girarlo con el teclado. */
  giro: number;
  setSexo: (s: Sexo) => void;
  setMacro: <K extends keyof ControlesMacro>(k: K, v: ControlesMacro[K]) => void;
  setLocal: (clave: string, v: number) => void;
  /** Aplica un ajuste: los controles pasan a ser los que encontró el solver. */
  aplicarAjuste: (r: ResultadoCliente | null) => void;
  setAjustando: (v: boolean) => void;
  setObjetivo: (r: ResultadoCliente | null) => void;
  set: (cambios: Partial<Pick<EstadoVisor, Ajustes>>) => void;
  reiniciar: () => void;
}

export const useVisor = create<EstadoVisor>((set) => ({
  sexo: 'M',
  macro: MACRO_INICIAL,
  locales: {},
  origen: 'manual',
  ajuste: null,
  ajustando: false,
  objetivo: null,
  vista: 'grasa',
  verAnillos: false,
  verSegmentos: false,
  calorDe: 'grasa',
  comparar: 'lado',
  mezcla: 1,
  colorCuerpo: COLORES_CUERPO[0],
  modoMedidas: 'autoequilibrio',
  giro: 0,
  setSexo: (sexo) => set({ sexo, ajuste: null, objetivo: null }),
  setMacro: (k, v) => set((s) => ({ macro: { ...s.macro, [k]: v }, origen: 'manual' })),
  setLocal: (clave, v) => set((s) => ({ locales: { ...s.locales, [clave]: v }, origen: 'manual' })),
  aplicarAjuste: (r) => set(r ? { macro: r.exterior.macro, locales: r.exterior.locales, ajuste: r, origen: 'ajuste' } : { ajuste: null }),
  setAjustando: (ajustando) => set({ ajustando }),
  setObjetivo: (objetivo) => set({ objetivo }),
  set: (cambios) => set(cambios),
  reiniciar: () => set({ macro: MACRO_INICIAL, locales: {}, origen: 'manual' }),
}));
