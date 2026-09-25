import { create } from 'zustand';
import { MACRO_INICIAL, type ControlesMacro } from './controles';
import type { Sexo } from './tipos';

interface EstadoVisor {
  sexo: Sexo;
  macro: ControlesMacro;
  /** Valor de cada control local por clave (−1..1 bipolar, 0..1 simple). */
  locales: Record<string, number>;
  verSegmentos: boolean;
  /** Prototipo: cuerpo sin grasa oscuro dentro de una capa de grasa amarilla. */
  verGrasa: boolean;
  /** Dibuja los contornos donde se miden las circunferencias. */
  verAnillos: boolean;
  setSexo: (s: Sexo) => void;
  setMacro: <K extends keyof ControlesMacro>(k: K, v: ControlesMacro[K]) => void;
  setLocal: (clave: string, v: number) => void;
  setVerSegmentos: (v: boolean) => void;
  setVerGrasa: (v: boolean) => void;
  setVerAnillos: (v: boolean) => void;
  reiniciar: () => void;
}

export const useVisor = create<EstadoVisor>((set) => ({
  sexo: 'M',
  macro: MACRO_INICIAL,
  locales: {},
  verSegmentos: false,
  verGrasa: false,
  verAnillos: true,
  setSexo: (sexo) => set({ sexo }),
  setMacro: (k, v) => set((s) => ({ macro: { ...s.macro, [k]: v } })),
  setLocal: (clave, v) => set((s) => ({ locales: { ...s.locales, [clave]: v } })),
  setVerSegmentos: (verSegmentos) => set({ verSegmentos }),
  setVerGrasa: (verGrasa) => set({ verGrasa }),
  setVerAnillos: (verAnillos) => set({ verAnillos }),
  reiniciar: () => set({ macro: MACRO_INICIAL, locales: {} }),
}));
