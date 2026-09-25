import { create } from 'zustand';
import type { ResultadoAjuste } from './ajuste';
import { MACRO_INICIAL, type ControlesMacro } from './controles';
import type { Sexo } from './tipos';

interface EstadoVisor {
  sexo: Sexo;
  macro: ControlesMacro;
  /** Valor de cada control local por clave (−1..1 bipolar, 0..1 simple). */
  locales: Record<string, number>;
  /** De dónde salen los controles: del ajuste a los datos o de moverlos a mano. */
  origen: 'ajuste' | 'manual';
  /** Último ajuste a los datos (null si todavía no hay estatura y peso). */
  ajuste: ResultadoAjuste | null;
  ajustando: boolean;
  verSegmentos: boolean;
  /** Vista "grasa sobre músculo": el cuerpo sin grasa dentro de una capa de grasa amarilla. */
  verGrasa: boolean;
  /** Dibuja los contornos donde se miden las circunferencias. */
  verAnillos: boolean;
  setSexo: (s: Sexo) => void;
  setMacro: <K extends keyof ControlesMacro>(k: K, v: ControlesMacro[K]) => void;
  setLocal: (clave: string, v: number) => void;
  /** Aplica un ajuste: los controles pasan a ser los que encontró el solver. */
  aplicarAjuste: (r: ResultadoAjuste | null) => void;
  setAjustando: (v: boolean) => void;
  setVerSegmentos: (v: boolean) => void;
  setVerGrasa: (v: boolean) => void;
  setVerAnillos: (v: boolean) => void;
  reiniciar: () => void;
}

export const useVisor = create<EstadoVisor>((set) => ({
  sexo: 'M',
  macro: MACRO_INICIAL,
  locales: {},
  origen: 'manual',
  ajuste: null,
  ajustando: false,
  verSegmentos: false,
  verGrasa: true,
  verAnillos: false,
  setSexo: (sexo) => set({ sexo, ajuste: null }),
  setMacro: (k, v) => set((s) => ({ macro: { ...s.macro, [k]: v }, origen: 'manual' })),
  setLocal: (clave, v) => set((s) => ({ locales: { ...s.locales, [clave]: v }, origen: 'manual' })),
  aplicarAjuste: (r) => set(r ? { macro: r.macro, locales: r.locales, ajuste: r, origen: 'ajuste' } : { ajuste: null }),
  setAjustando: (ajustando) => set({ ajustando }),
  setVerSegmentos: (verSegmentos) => set({ verSegmentos }),
  setVerGrasa: (verGrasa) => set({ verGrasa }),
  setVerAnillos: (verAnillos) => set({ verAnillos }),
  reiniciar: () => set({ macro: MACRO_INICIAL, locales: {}, origen: 'manual' }),
}));
