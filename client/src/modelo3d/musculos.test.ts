/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { desdeGltf } from './cargar';
import { clasificarMusculos, etiquetaEn, GRUPOS, nombreEtiqueta, type Musculos } from './musculos';
import type { CuerpoBase, MetaCuerpo, Sexo } from './tipos';

/** Pruebas sobre los cuerpos reales (los GLB comprimidos de client/public/modelo3d). */

const carpeta = fileURLToPath(new URL('../../public/modelo3d/', import.meta.url));

async function cargarDeDisco(sexo: Sexo): Promise<CuerpoBase> {
  const nombre = sexo === 'M' ? 'cuerpo-hombre' : 'cuerpo-mujer';
  const glb = readFileSync(`${carpeta}${nombre}.glb`);
  const meta = JSON.parse(readFileSync(`${carpeta}${nombre}.json`, 'utf8')) as MetaCuerpo;
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const buf = glb.buffer.slice(glb.byteOffset, glb.byteOffset + glb.byteLength);
  const gltf = await loader.parseAsync(buf, '');
  return desdeGltf(sexo, gltf.scene, meta);
}

for (const sexo of ['M', 'F'] as Sexo[]) {
  describe(`músculos ${sexo === 'M' ? 'hombre' : 'mujer'}`, () => {
    let cuerpo: CuerpoBase;
    let m: Musculos;

    beforeAll(async () => {
      cuerpo = await cargarDeDisco(sexo);
      m = clasificarMusculos(cuerpo);
    });

    /** Nombre en el vértice más cercano a un punto (en la esquina de un triángulo que lo usa). */
    const nombreCerca = (x: number, y: number, z: number) => {
      const p = cuerpo.posiciones;
      let mejor = 0;
      let d = Infinity;
      for (let v = 0; v < p.length / 3; v++) {
        const dv = Math.hypot(p[v * 3] - x, p[v * 3 + 1] - y, p[v * 3 + 2] - z);
        if (dv < d) [mejor, d] = [v, dv];
      }
      const c = Array.prototype.indexOf.call(cuerpo.indicesTriangulos, mejor);
      const t = Math.floor(c / 3);
      const bary: [number, number, number] = [0, 0, 0];
      bary[c % 3] = 1;
      return nombreEtiqueta(etiquetaEn(m, t, bary));
    };
    const art = (n: string) => cuerpo.meta.articulaciones.base[cuerpo.meta.articulaciones.nombres.indexOf(n)];

    it('cada triángulo tiene candidatas válidas', () => {
      const nT = cuerpo.indicesTriangulos.length / 3;
      expect(m.candidatas.length).toBe(nT * 9);
      let malas = 0;
      for (let i = 0; i < m.candidatas.length; i++) {
        if (m.candidatas[i] >= m.etiquetas.length) malas++;
        if (!(m.pesos[i] === -1 || (m.pesos[i] >= 0 && m.pesos[i] <= 1.0001))) malas++;
        // La primera ranura siempre está en uso.
        if (i % 3 === 0 && m.pesos[i] < 0) malas++;
      }
      expect(malas).toBe(0);
    });

    it('pone cada músculo en su lugar', () => {
      const ombligo = cuerpo.meta.landmarks.ombligo.vertices;
      const y = ombligo.reduce((s, v) => s + cuerpo.posiciones[v * 3 + 1], 0) / ombligo.length;
      const zFrente = Math.max(...ombligo.map((v) => cuerpo.posiciones[v * 3 + 2]));
      expect(nombreCerca(0.03, y + 0.06, zFrente)).toBe('Recto abdominal');
      const cabeza = art('joint-head');
      expect(nombreCerca(cabeza[0], cabeza[1] + 0.12, cabeza[2])).toBe('Cabeza');
      // Parte de atrás del brazo izquierdo, a media altura entre hombro y codo.
      const [h, c] = [art('joint-l-shoulder'), art('joint-l-elbow')];
      expect(nombreCerca((h[0] + c[0]) / 2, (h[1] + c[1]) / 2, (h[2] + c[2]) / 2 - 0.1)).toBe('Tríceps · izquierdo');
      // Pantorrilla derecha por detrás.
      const [r, t] = [art('joint-r-knee'), art('joint-r-ankle')];
      expect(nombreCerca(r[0] * 0.7 + t[0] * 0.3, r[1] * 0.7 + t[1] * 0.3, r[2] - 0.15)).toBe('Gemelos · derecho');
    });

    it('los dos lados tienen los mismos músculos', () => {
      const de = (lado: number) =>
        m.etiquetas
          .filter((e) => GRUPOS[e.grupo].musculo && e.lado === lado)
          .map((e) => e.grupo)
          .sort()
          .join();
      expect(de(0)).toBe(de(1));
    });
  });
}
