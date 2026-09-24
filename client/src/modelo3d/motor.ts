import type { CuerpoBase, PesosMorph } from './tipos';

/** Por debajo de este peso un morph se ignora: no mueve nada visible. */
const PESO_MINIMO = 1e-4;

/**
 * Aplica los morphs en CPU: pos = base + Σ wᵢ·Δᵢ, y apoya los pies en el suelo
 * (y mínima = 0), porque los morphs de altura y de piernas mueven los pies.
 *
 * Escribe en `destino` si se pasa (para no reservar memoria en cada cuadro).
 * Es una función pura sobre arrays: la misma que correrá en el Worker.
 */
export function aplicarMorphs(cuerpo: CuerpoBase, pesos: PesosMorph, destino?: Float32Array): Float32Array {
  const pos = destino ?? new Float32Array(cuerpo.posiciones.length);
  pos.set(cuerpo.posiciones);

  for (const [nombre, w] of Object.entries(pesos)) {
    if (Math.abs(w) < PESO_MINIMO) continue;
    const i = cuerpo.indiceMorph.get(nombre);
    if (i === undefined) continue;
    const { indices, deltas } = cuerpo.morphs[i];
    for (let k = 0; k < indices.length; k++) {
      const v = indices[k] * 3;
      pos[v] += w * deltas[k * 3];
      pos[v + 1] += w * deltas[k * 3 + 1];
      pos[v + 2] += w * deltas[k * 3 + 2];
    }
  }

  let minY = Infinity;
  for (let v = 1; v < pos.length; v += 3) if (pos[v] < minY) minY = pos[v];
  for (let v = 1; v < pos.length; v += 3) pos[v] -= minY;
  return pos;
}

/** Estatura = alto de la caja envolvente (los pies ya están en y = 0). */
export function estatura(pos: Float32Array): number {
  let maxY = -Infinity;
  for (let v = 1; v < pos.length; v += 3) if (pos[v] > maxY) maxY = pos[v];
  return maxY;
}

/**
 * Mete el cuerpo sin grasa dentro del cuerpo completo: si un vértice interior
 * queda afuera (o a menos de `margen`) de la superficie exterior, medido sobre
 * la normal exterior de ese mismo vértice, se empuja hacia adentro. Los dos
 * cuerpos comparten topología, así que el vértice i de uno es el i del otro.
 */
export function contenerDentro(interior: Float32Array, exterior: Float32Array, normalesExterior: Float32Array, margen = 0.001) {
  for (let v = 0; v < interior.length; v += 3) {
    const nx = normalesExterior[v];
    const ny = normalesExterior[v + 1];
    const nz = normalesExterior[v + 2];
    const d = (interior[v] - exterior[v]) * nx + (interior[v + 1] - exterior[v + 1]) * ny + (interior[v + 2] - exterior[v + 2]) * nz;
    if (d > -margen) {
      const k = d + margen;
      interior[v] -= k * nx;
      interior[v + 1] -= k * ny;
      interior[v + 2] -= k * nz;
    }
  }
  return interior;
}
