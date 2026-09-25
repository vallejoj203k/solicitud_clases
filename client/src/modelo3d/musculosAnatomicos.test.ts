/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import type { BufferGeometry, Mesh } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { desdeGltf } from './cargar';
import { MACRO_INICIAL, pesosMacro } from './controles';
import { normalesVertice } from './geometria';
import { aplicarMorphs } from './motor';
import { deformarMusculos, desdeGeometria, nombrePieza, type MusculosAnatomicos } from './musculosAnatomicos';
import type { CuerpoBase, MetaCuerpo, Sexo } from './tipos';

/** Pruebas sobre los GLB reales de client/public/modelo3d (cuerpo y músculos). */

const carpeta = fileURLToPath(new URL('../../public/modelo3d/', import.meta.url));

async function glb(nombre: string) {
  const b = readFileSync(`${carpeta}${nombre}.glb`);
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  return loader.parseAsync(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), '');
}

for (const sexo of ['M', 'F'] as Sexo[]) {
  const etiqueta = sexo === 'M' ? 'hombre' : 'mujer';
  describe(`músculos anatómicos ${etiqueta}`, () => {
    let cuerpo: CuerpoBase;
    let m: MusculosAnatomicos;
    let reposo: Float32Array;

    beforeAll(async () => {
      const g = await glb(`cuerpo-${etiqueta}`);
      cuerpo = desdeGltf(sexo, g.scene, JSON.parse(readFileSync(`${carpeta}cuerpo-${etiqueta}.json`, 'utf8')) as MetaCuerpo);
      const gm = await glb(`musculos-${etiqueta}`);
      let malla: Mesh | undefined;
      gm.scene.traverse((o) => {
        if ((o as Mesh).isMesh) malla = o as Mesh;
      });
      const geo = malla!.geometry as BufferGeometry;
      reposo = geo.getAttribute('position').array as Float32Array;
      m = desdeGeometria(sexo, geo, JSON.parse(readFileSync(`${carpeta}musculos-${etiqueta}.json`, 'utf8')).piezas);
    });

    const deformar = (pos: Float32Array) =>
      deformarMusculos(m, cuerpo.indicesTriangulos, pos, normalesVertice(pos, cuerpo.indicesTriangulos), new Float32Array(m.tri.length * 3));

    it('sobre el cuerpo base quedan donde los dejó la exportación', () => {
      const out = deformar(cuerpo.posiciones);
      const errores: number[] = [];
      for (let v = 0; v < m.tri.length; v++) {
        errores.push(Math.hypot(out[v * 3] - reposo[v * 3], out[v * 3 + 1] - reposo[v * 3 + 1], out[v * 3 + 2] - reposo[v * 3 + 2]));
      }
      errores.sort((a, b) => a - b);
      // El cuerpo del GLB tiene alisados que el de la exportación no (pezones).
      expect(errores[Math.floor(errores.length / 2)]).toBeLessThan(0.001);
      expect(errores[Math.floor(errores.length * 0.99)]).toBeLessThan(0.01);
    });

    it('siguen a un cuerpo muy distinto sin salirse de él', () => {
      const pesos = pesosMacro({ ...MACRO_INICIAL, musculo: 1, peso: 1 }, sexo);
      const pos = aplicarMorphs(cuerpo, pesos);
      const out = deformar(pos);
      const min = [Infinity, Infinity, Infinity];
      const max = [-Infinity, -Infinity, -Infinity];
      for (let v = 0; v < pos.length / 3; v++) {
        for (let c = 0; c < 3; c++) {
          min[c] = Math.min(min[c], pos[v * 3 + c]);
          max[c] = Math.max(max[c], pos[v * 3 + c]);
        }
      }
      let fuera = 0;
      for (let v = 0; v < m.tri.length; v++) {
        for (let c = 0; c < 3; c++) if (out[v * 3 + c] < min[c] - 0.01 || out[v * 3 + c] > max[c] + 0.01) fuera++;
      }
      expect(fuera).toBe(0);
    });

    it('cada pieza tiene nombre en español y lado', () => {
      expect(m.piezas.length).toBeGreaterThan(200);
      const conLado = m.piezas.filter((p) => p.lado).length;
      expect(conLado / m.piezas.length).toBeGreaterThan(0.95);
      const traducidas = m.piezas.filter((p) => /[Mm]úsculo|[Tt]endón|[Aa]ductor|[Ll]igamento|[Pp]orción|[Cc]abeza|[Ff]lexor|[Ee]xtensor/.test(p.es));
      expect(traducidas.length / m.piezas.length).toBeGreaterThan(0.9);
      const nombres = new Set(Array.from({ length: m.tri.length }, (_, v) => nombrePieza(m, v)));
      for (const n of ['Músculo recto del abdomen · izquierdo', 'Músculo glúteo máximo · derecho', 'Músculo latísimo del dorso · izquierdo']) {
        expect(nombres).toContain(n);
      }
    });
  });
}
