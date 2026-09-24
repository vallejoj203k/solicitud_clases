/** Tipos del JSON de metadatos que escribe tools/export_bodies.py. */

export type Sexo = 'M' | 'F';

export type GrupoMorph = 'macro' | 'segmento' | 'torso' | 'medida' | 'musculo' | 'grasa';

export interface MetaMorph {
  nombre: string;
  grupo: GrupoMorph;
  descripcion: string;
  vertices_movidos: number;
  /** Solo en los macro: los valores de MakeHuman que produjeron este morph. */
  macro?: Record<string, unknown>;
  /** Solo en los locales: los targets de MakeHuman que se sumaron. */
  targets?: string[];
}

export interface MetaCuerpo {
  version: number;
  sexo: Sexo;
  generado: string;
  fuente: { mpfb: string; version: string; blender: string; licencia_assets: string };
  coordenadas: string;
  vertices: number;
  triangulos: number;
  base: { macros: Record<string, number>; etnia: Record<string, number> };
  base_medidas: { estatura_m: number; volumen_l: number; angulo_brazo_bajo_horizontal_grados: number };
  morphs: MetaMorph[];
  segmentos: { nombres: string[]; atributo: string; conteo: Record<string, number> };
  landmarks: Record<string, { target: string; vertices: number[] }>;
  articulaciones: { nombres: string[]; base: number[][]; deltas: Record<string, number[][]> };
}

/** Un morph listo para aplicar en CPU: solo los vértices que mueve. */
export interface MorphCPU {
  nombre: string;
  /** Índices de vértice que mueve. */
  indices: Uint32Array;
  /** Deltas xyz de esos vértices, en metros (3 por índice). */
  deltas: Float32Array;
}

/** Lo que el motor necesita de un cuerpo cargado. */
export interface CuerpoBase {
  sexo: Sexo;
  meta: MetaCuerpo;
  /** Posiciones base xyz (3 x vértices). */
  posiciones: Float32Array;
  indicesTriangulos: Uint16Array | Uint32Array;
  /** Segmento de cada vértice (índice en meta.segmentos.nombres). */
  segmentos: Uint8Array;
  morphs: MorphCPU[];
  /** nombre del morph -> posición en `morphs`. */
  indiceMorph: Map<string, number>;
}

/** Peso de cada morph por nombre; los que faltan valen 0. */
export type PesosMorph = Record<string, number>;
