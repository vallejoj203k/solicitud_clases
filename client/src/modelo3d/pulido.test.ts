/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { desdeGltf } from './cargar';
import { volumenMalla } from './geometria';
import { prepararPulido, pulirMalla, subdivisionLoop } from './pulido';
import type { MetaCuerpo } from './tipos';

/** Icosaedro de radio 1, orientado hacia afuera. */
function icosaedro() {
  const t = (1 + Math.sqrt(5)) / 2;
  const v = [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]]
    .flatMap((p) => p.map((x) => x / Math.hypot(1, t)));
  const f = [0, 11, 5, 0, 5, 1, 0, 1, 7, 0, 7, 10, 0, 10, 11, 1, 5, 9, 5, 11, 4, 11, 10, 2, 10, 7, 6, 7, 1, 8,
    3, 9, 4, 3, 4, 2, 3, 2, 6, 3, 6, 8, 3, 8, 9, 4, 9, 5, 2, 4, 11, 6, 2, 10, 8, 6, 7, 9, 8, 1];
  return { pos: Float32Array.from(v), tris: f };
}

function aplicar(sub: ReturnType<typeof subdivisionLoop>['sub'], pos: Float32Array) {
  const n = sub.inicio.length - 1;
  const out = new Float32Array(n * 3);
  for (let r = 0; r < n; r++) {
    for (let j = sub.inicio[r]; j < sub.inicio[r + 1]; j++) for (let c = 0; c < 3; c++) out[r * 3 + c] += sub.peso[j] * pos[sub.col[j] * 3 + c];
  }
  return out;
}

describe('subdivisión de Loop', () => {
  it('los pesos de cada vértice nuevo suman 1', () => {
    const { tris } = icosaedro();
    const { sub, nTotal, indices } = subdivisionLoop(tris, 12);
    expect(nTotal).toBe(12 + 30);
    expect(indices.length).toBe(tris.length * 4);
    for (let r = 0; r < nTotal; r++) {
      let s = 0;
      for (let j = sub.inicio[r]; j < sub.inicio[r + 1]; j++) s += sub.peso[j];
      expect(s).toBeCloseTo(1, 6);
    }
  });

  it('un icosaedro se acerca a una esfera y conserva el sentido de las caras', () => {
    const { pos, tris } = icosaedro();
    const { sub, indices } = subdivisionLoop(tris, 12);
    const p2 = aplicar(sub, pos);
    const radios = Array.from({ length: p2.length / 3 }, (_, i) => Math.hypot(p2[i * 3], p2[i * 3 + 1], p2[i * 3 + 2]));
    expect(Math.max(...radios) - Math.min(...radios)).toBeLessThan(0.1);
    expect(volumenMalla(p2, indices)).toBeGreaterThan(0); // caras hacia afuera
  });
});

describe('pulido del cuerpo', () => {
  it('queda liso sin cambiar estatura ni volumen de forma apreciable', async () => {
    const carpeta = fileURLToPath(new URL('../../public/modelo3d/', import.meta.url));
    const b = readFileSync(`${carpeta}cuerpo-hombre.glb`);
    const l = new GLTFLoader();
    l.setMeshoptDecoder(MeshoptDecoder);
    const g = await l.parseAsync(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), '');
    const cuerpo = desdeGltf('M', g.scene, JSON.parse(readFileSync(`${carpeta}cuerpo-hombre.json`, 'utf8')) as MetaCuerpo);
    const p = prepararPulido(cuerpo);
    const t0 = performance.now();
    const m = pulirMalla(p, { pos: cuerpo.posiciones, normales: new Float32Array(0) });
    const ms = performance.now() - t0;
    expect(m.pos.every(Number.isFinite)).toBe(true);
    const alto = (a: Float32Array) => Math.max(...Array.from({ length: a.length / 3 }, (_, i) => a[i * 3 + 1]));
    expect(Math.abs(alto(m.pos) - alto(cuerpo.posiciones))).toBeLessThan(0.01);
    const v0 = volumenMalla(cuerpo.posiciones, cuerpo.indicesTriangulos);
    expect(Math.abs(volumenMalla(m.pos, p.indices) - v0) / v0).toBeLessThan(0.02);
    expect(ms).toBeLessThan(200);
  });
});
