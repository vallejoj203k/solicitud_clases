/**
 * Puntos del cuerpo que entrega el detector de postura (MediaPipe Pose
 * Landmarker, 33 puntos) y cuentas geométricas sobre ellos.
 *
 * Cada cuadro trae los puntos dos veces:
 * - `imagen`: x, y normalizados al ancho y al alto del video (0 a 1, y hacia
 *   abajo). Sirven para saber si la persona está entera en cuadro y para lo que
 *   se ve en la foto (talón contra punta del pie).
 * - `mundo`: en metros, con origen en la cadera (y hacia abajo). Sirven para
 *   los ángulos: no dependen de la distancia a la cámara ni de la proporción del
 *   video.
 */

export interface Punto {
  x: number;
  y: number;
  z: number;
  /** Qué tan seguro está el detector de que el punto se ve (0 a 1). */
  visibility?: number;
}

export interface Pose {
  imagen: Punto[];
  mundo: Punto[];
  /** Ancho / alto del video: para medir en la imagen sin deformar. */
  aspecto: number;
}

export const P = {
  nariz: 0,
  hombro: { izq: 11, der: 12 },
  cadera: { izq: 23, der: 24 },
  rodilla: { izq: 25, der: 26 },
  tobillo: { izq: 27, der: 28 },
  talon: { izq: 29, der: 30 },
  punta: { izq: 31, der: 32 },
} as const;

export type Lado = 'izq' | 'der';

/** Huesos que se dibujan sobre el video. */
export const HUESOS: [number, number][] = [
  [11, 12], [11, 23], [12, 24], [23, 24],
  [11, 13], [13, 15], [12, 14], [14, 16],
  [23, 25], [25, 27], [27, 29], [29, 31], [27, 31],
  [24, 26], [26, 28], [28, 30], [30, 32], [28, 32],
];

export const GRADOS = 180 / Math.PI;

/** Ángulo (grados) en `b` entre los segmentos b→a y b→c, en 3D. */
export function angulo(a: Punto, b: Punto, c: Punto): number {
  const u = [a.x - b.x, a.y - b.y, a.z - b.z];
  const v = [c.x - b.x, c.y - b.y, c.z - b.z];
  const nu = Math.hypot(u[0], u[1], u[2]);
  const nv = Math.hypot(v[0], v[1], v[2]);
  if (nu === 0 || nv === 0) return 180;
  const cos = (u[0] * v[0] + u[1] * v[1] + u[2] * v[2]) / (nu * nv);
  return Math.acos(Math.max(-1, Math.min(1, cos))) * GRADOS;
}

export function medio(a: Punto, b: Punto): Punto {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2, visibility: Math.min(a.visibility ?? 1, b.visibility ?? 1) };
}

export const visible = (p: Punto | undefined, min = 0.5) => !!p && (p.visibility ?? 1) >= min;
