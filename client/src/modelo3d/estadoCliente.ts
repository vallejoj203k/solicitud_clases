import { create } from 'zustand';
import type { Borrador, ClaveEvaluacion, Diagnostico, Evaluacion } from './cliente';

/**
 * Lo que el entrenador escribió en el formulario, tal cual (texto). Vive solo en
 * memoria: la página es pública y no guarda nada. El sexo vive en useVisor.
 */
type Datos = Omit<Borrador, 'sexo'>;

interface EstadoCliente extends Datos {
  setNombre: (v: string) => void;
  setValor: (clave: string, texto: string) => void;
  /** Marca la evaluación; si ya estaba marcada, la desmarca (como tachar la casilla). */
  alternarEvaluacion: (clave: ClaveEvaluacion, v: Evaluacion) => void;
  alternarDiagnostico: (d: Diagnostico) => void;
  cargar: (d: Datos) => void;
  limpiar: () => void;
}

const VACIO: Datos = { nombre: '', valores: {}, evaluacion: {}, diagnostico: undefined };

export const useCliente = create<EstadoCliente>((set) => ({
  ...VACIO,
  setNombre: (nombre) => set({ nombre }),
  setValor: (clave, texto) => set((s) => ({ valores: { ...s.valores, [clave]: texto } })),
  alternarEvaluacion: (clave, v) =>
    set((s) => ({ evaluacion: { ...s.evaluacion, [clave]: s.evaluacion[clave] === v ? undefined : v } })),
  alternarDiagnostico: (d) => set((s) => ({ diagnostico: s.diagnostico === d ? undefined : d })),
  cargar: (d) => set({ ...VACIO, ...d, valores: { ...d.valores }, evaluacion: { ...d.evaluacion } }),
  limpiar: () => set(VACIO),
}));
