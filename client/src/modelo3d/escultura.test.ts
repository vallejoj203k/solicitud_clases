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
      e = desdeGeometria(sexo, malla!.geometry as BufferGeometry, JSON.parse(readFileSync(`${carpeta}escultura-${etiqueta}.json`, 'utf8')).calce);
    });

    it('con el cuerpo base la escultura queda tal cual es', () => {
      const out = posicionesEscultura(e, cuerpo.indicesTriangulos, cuerpo.posiciones, cuerpo.posiciones, new Float32Array(e.nTotal * 3));
      let max = 0;
      for (let i = 0; i < out.length; i++) max = Math.max(max, Math.abs(out[i] - e.original[i]));
      expect(max).toBe(0);
    });

    it('crece con un cuerpo más pesado, sin puntos sueltos, y es rápida', () => {
      const pos = aplicarMorphs(cuerpo, pesosMacro({ ...MACRO_INICIAL, peso: 1 }, sexo));
      const out = new Float32Array(e.nTotal * 3);
      posicionesEscultura(e, cuerpo.indicesTriangulos, cuerpo.posiciones, pos, out);
      const t0 = performance.now();
      posicionesEscultura(e, cuerpo.indicesTriangulos, cuerpo.posiciones, pos, out);
      const ms = performance.now() - t0;
      expect(out.every(Number.isFinite)).toBe(true);
      // Los mismos vértices del tronco (a la altura de la cintura) quedan más lejos del eje.
      let antes = 0;
      let despues = 0;
      for (let v = 0; v < e.nTotal; v++) {
        const [x, y, z] = [e.original[v * 3], e.original[v * 3 + 1], e.original[v * 3 + 2]];
        if (Math.abs(y - 0.55 * 1.75) > 0.05 || Math.abs(x) > 0.22) continue;
        antes += Math.hypot(x, z);
        despues += Math.hypot(out[v * 3], out[v * 3 + 2]);
      }
      expect(despues).toBeGreaterThan(antes * 1.05);
      // Ningún vértice se mueve más que el cuerpo (el mayor desplazamiento de un vértice del cuerpo).
      let maxCuerpo = 0;
      for (let v = 0; v < pos.length; v += 3) maxCuerpo = Math.max(maxCuerpo, Math.hypot(pos[v] - cuerpo.posiciones[v], pos[v + 1] - cuerpo.posiciones[v + 1], pos[v + 2] - cuerpo.posiciones[v + 2]));
      let maxEsc = 0;
      for (let v = 0; v < out.length; v += 3) maxEsc = Math.max(maxEsc, Math.hypot(out[v] - e.original[v], out[v + 1] - e.original[v + 1], out[v + 2] - e.original[v + 2]));
      expect(maxEsc).toBeLessThanOrEqual(maxCuerpo + 1e-6);
      expect(ms).toBeLessThan(100);
    });

    it('trae los colores del modelo y, si faltan (GLB viejo), no falla', async () => {
      expect(e.color.some((x) => x > 0)).toBe(true);
      let malla: Mesh | undefined;
      (await glb(`escultura-${etiqueta}`)).scene.traverse((o) => {
        if ((o as Mesh).isMesh) malla = o as Mesh;
      });
      const geo = malla!.geometry as BufferGeometry;
      geo.deleteAttribute('_color');
      const sinColores = desdeGeometria(sexo, geo, []);
      expect(sinColores.color.every(Number.isFinite)).toBe(true);
      expect(sinColores.color[0]).toBeGreaterThan(0);
    });

    it('interpola atributos por vértice (colores, espesor)', () => {
      const uno = new Float32Array(cuerpo.posiciones.length / 3).fill(1);
      const out = atributoEscultura(e, cuerpo.indicesTriangulos, uno, 1, new Float32Array(e.nTotal));
      expect(out.every((x) => Math.abs(x - 1) < 1e-5)).toBe(true);
    });
  });
}
