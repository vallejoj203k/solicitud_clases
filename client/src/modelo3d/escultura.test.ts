/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import type { BufferGeometry, Mesh } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { desdeGltf } from './cargar';
import { MACRO_INICIAL, pesosMacro } from './controles';
import { atributoEscultura, desdeGeometria, posicionesEscultura, type Escultura } from './escultura';
import { aplicarMorphs } from './motor';
import type { CuerpoBase, MetaCuerpo, Sexo } from './tipos';

/** Pruebas sobre los GLB reales de client/public/modelo3d (cuerpo y escultura). */

const carpeta = fileURLToPath(new URL('../../public/modelo3d/', import.meta.url));

async function glb(nombre: string) {
  const b = readFileSync(`${carpeta}${nombre}.glb`);
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  return loader.parseAsync(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), '');
}

const caja = (p: Float32Array) => {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < p.length; i += 3) {
    for (let c = 0; c < 3; c++) {
      min[c] = Math.min(min[c], p[i + c]);
      max[c] = Math.max(max[c], p[i + c]);
    }
  }
  return { min, max };
};

for (const sexo of ['M', 'F'] as Sexo[]) {
  const etiqueta = sexo === 'M' ? 'hombre' : 'mujer';
  describe(`escultura ${etiqueta}`, () => {
    let cuerpo: CuerpoBase;
    let e: Escultura;

    beforeAll(async () => {
      const g = await glb(`cuerpo-${etiqueta}`);
      cuerpo = desdeGltf(sexo, g.scene, JSON.parse(readFileSync(`${carpeta}cuerpo-${etiqueta}.json`, 'utf8')) as MetaCuerpo);
      let malla: Mesh | undefined;
      (await glb(`escultura-${etiqueta}`)).scene.traverse((o) => {
        if ((o as Mesh).isMesh) malla = o as Mesh;
      });
      e = desdeGeometria(sexo, malla!.geometry as BufferGeometry, JSON.parse(readFileSync(`${carpeta}escultura-${etiqueta}.json`, 'utf8')).regiones);
    });

    it('sobre el cuerpo base queda de su estatura, sin puntos sueltos', () => {
      const out = posicionesEscultura(e, cuerpo.indicesTriangulos, cuerpo.posiciones, new Float32Array(e.nTotal * 3));
      expect(out.every(Number.isFinite)).toBe(true);
      const a = caja(out);
      const b = caja(cuerpo.posiciones);
      // Misma estatura (±2 cm) y nada fuera del cuerpo más de 4 cm (las manos de la escultura van algo abiertas).
      expect(Math.abs(a.max[1] - b.max[1])).toBeLessThan(0.02);
      for (let c = 0; c < 3; c++) {
        expect(a.min[c]).toBeGreaterThan(b.min[c] - 0.04);
        expect(a.max[c]).toBeLessThan(b.max[c] + 0.04);
      }
    });

    it('sigue a un cuerpo muy distinto y es rápida', () => {
      const pos = aplicarMorphs(cuerpo, pesosMacro({ ...MACRO_INICIAL, peso: 1 }, sexo));
      const out = new Float32Array(e.nTotal * 3);
      posicionesEscultura(e, cuerpo.indicesTriangulos, pos, out);
      const t0 = performance.now();
      posicionesEscultura(e, cuerpo.indicesTriangulos, pos, out);
      const ms = performance.now() - t0;
      const a = caja(out);
      const b = caja(pos);
      // Más ancha que la escultura sobre el cuerpo base, y dentro del cuerpo gordo.
      expect(a.max[0] - a.min[0]).toBeGreaterThan(0.9 * (b.max[0] - b.min[0]));
      for (let c = 0; c < 3; c++) expect(a.max[c]).toBeLessThan(b.max[c] + 0.05);
      expect(ms).toBeLessThan(100);
    });

    it('interpola atributos por vértice (colores, espesor)', () => {
      const uno = new Float32Array(cuerpo.posiciones.length / 3).fill(1);
      const out = atributoEscultura(e, cuerpo.indicesTriangulos, uno, 1, new Float32Array(e.nTotal));
      expect(out.every((x) => Math.abs(x - 1) < 1e-5)).toBe(true);
    });
  });
}
