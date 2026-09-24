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
