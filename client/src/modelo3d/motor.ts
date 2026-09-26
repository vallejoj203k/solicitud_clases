import type { CuerpoBase, PesosMorph } from './tipos';

/** Por debajo de este peso un morph se ignora: no mueve nada visible. */
const PESO_MINIMO = 1e-4;

/**
 * Aplica los morphs en CPU: pos = base + Σ wᵢ·Δᵢ, y apoya los pies en el suelo
 * (y mínima = 0), porque los morphs de altura y de piernas mueven los pies.
 *
 * Escribe en `destino` si se pasa (para no reservar memoria en cada cuadro).
 * En `info.desplazoY` deja cuánto se subió el cuerpo para apoyarlo.
 * Es una función pura sobre arrays: la misma que correrá en el Worker.
 */
export function aplicarMorphs(
  cuerpo: CuerpoBase,
  pesos: PesosMorph,
  destino?: Float32Array,
  info?: { desplazoY: number },
): Float32Array {
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
  if (info) info.desplazoY = -minY;
  return pos;
}

/** Estatura = alto de la caja envolvente (los pies ya están en y = 0). */
export function estatura(pos: Float32Array): number {
  let maxY = -Infinity;
  for (let v = 1; v < pos.length; v += 3) if (pos[v] > maxY) maxY = pos[v];
  return maxY;
}

/**
 * La grasa por fuera del músculo: donde el cuerpo completo quedaría por dentro
 * del cuerpo sin grasa (o a menos de `margen`), se empuja hacia afuera sobre la
 * normal del músculo. Se corrige la grasa, nunca el músculo (así el músculo no
 * depende de cuánta grasa hay).
 */
export function contenerFuera(exterior: Float32Array, interior: Float32Array, normalesInterior: Float32Array, margen = 0.001) {
  const out = Float32Array.from(exterior);
  for (let v = 0; v < out.length; v += 3) {
    const nx = normalesInterior[v];
    const ny = normalesInterior[v + 1];
    const nz = normalesInterior[v + 2];
    const d = (out[v] - interior[v]) * nx + (out[v + 1] - interior[v + 1]) * ny + (out[v + 2] - interior[v + 2]) * nz;
    if (d < margen) {
      const k = margen - d;
      out[v] += k * nx;
      out[v + 1] += k * ny;
      out[v + 2] += k * nz;
    }
  }
  return out;
}
