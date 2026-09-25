/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { desdeGltf } from './cargar';
import { pesosLocales, pesosMacro, controlesLocales, MACRO_INICIAL } from './controles';
import { medir, posicionesArticulaciones, prepararMedicion, type PrepMedicion } from './medicion';
import { aplicarMorphs } from './motor';
import type { CuerpoBase, MetaCuerpo, PesosMorph, Sexo } from './tipos';

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

function medirCon(cuerpo: CuerpoBase, prep: PrepMedicion, pesos: PesosMorph) {
  const info = { desplazoY: 0 };
  const pos = aplicarMorphs(cuerpo, pesos, undefined, info);
  return medir(cuerpo, prep, pos, posicionesArticulaciones(prep, pesos, info.desplazoY)).medidas;
}

for (const sexo of ['M', 'F'] as Sexo[]) {
  describe(`cuerpo ${sexo === 'M' ? 'hombre' : 'mujer'}`, () => {
    let cuerpo: CuerpoBase;
    let prep: PrepMedicion;
    const pesosDe = (macro = MACRO_INICIAL, locales: Record<string, number> = {}) => ({
      ...pesosMacro(macro, sexo),
      ...pesosLocales(locales, controlesLocales(cuerpo.meta)),
    });

    beforeAll(async () => {
      cuerpo = await cargarDeDisco(sexo);
      prep = prepararMedicion(cuerpo);
    });

    it('la base mide lo mismo que dijo el exportador (estatura y volumen)', () => {
      const m = medirCon(cuerpo, prep, pesosDe());
      expect(m.estaturaCm / 100).toBeCloseTo(cuerpo.meta.base_medidas.estatura_m, 3);
      expect(Math.abs(m.volumenL / cuerpo.meta.base_medidas.volumen_l - 1)).toBeLessThan(0.001);
    });

    it('los volúmenes por segmento suman el total', () => {
      const m = medirCon(cuerpo, prep, pesosDe({ ...MACRO_INICIAL, peso: 0.9, musculo: 0.2 }, { barriga: 0.7 }));
      const suma = Object.values(m.volumenSegmentoL).reduce((a, b) => a + b, 0);
      expect(suma).toBeCloseTo(m.volumenL, 6);
      for (const v of Object.values(m.volumenSegmentoL)) expect(v).toBeGreaterThan(0);
    });

    it('izquierda y derecha miden casi lo mismo', () => {
      const m = medirCon(cuerpo, prep, pesosDe());
      const c = m.circunferenciasCm;
      for (const par of ['brazo', 'muslo', 'pantorrilla']) {
        expect(Math.abs(c[`${par}_izq`] - c[`${par}_der`])).toBeLessThan(0.3);
      }
      const v = m.volumenSegmentoL;
      expect(Math.abs(v.brazo_izq / v.brazo_der - 1)).toBeLessThan(0.02);
      expect(Math.abs(v.pierna_izq / v.pierna_der - 1)).toBeLessThan(0.02);
    });

    it('las circunferencias de la base están en rangos humanos', () => {
      const c = medirCon(cuerpo, prep, pesosDe()).circunferenciasCm;
      const rangos: Record<string, [number, number]> = {
        cuello: [25, 45],
        pecho: [75, 115],
        cintura: [60, 100],
        cadera: [80, 115],
        brazo_izq: [20, 40],
        muslo_izq: [40, 65],
        pantorrilla_izq: [28, 45],
      };
      for (const [n, [a, b]] of Object.entries(rangos)) {
        expect(c[n], n).toBeGreaterThan(a);
        expect(c[n], n).toBeLessThan(b);
      }
    });

    it('más peso: más volumen y circunferencias más grandes', () => {
      const flaco = medirCon(cuerpo, prep, pesosDe({ ...MACRO_INICIAL, peso: 0.2 }));
      const gordo = medirCon(cuerpo, prep, pesosDe({ ...MACRO_INICIAL, peso: 1 }));
      expect(gordo.volumenL).toBeGreaterThan(flaco.volumenL * 1.1);
      for (const n of ['cintura', 'cadera', 'brazo_izq', 'muslo_izq']) {
        expect(gordo.circunferenciasCm[n], n).toBeGreaterThan(flaco.circunferenciasCm[n]);
      }
    });

    it('la barriga agranda la cintura (a la altura del ombligo) más que el pecho', () => {
      const base = medirCon(cuerpo, prep, pesosDe());
      const panza = medirCon(cuerpo, prep, pesosDe(MACRO_INICIAL, { barriga: 1 }));
      const dCintura = panza.circunferenciasCm.cintura - base.circunferenciasCm.cintura;
      const dPecho = panza.circunferenciasCm.pecho - base.circunferenciasCm.pecho;
      expect(dCintura).toBeGreaterThan(5);
      expect(dCintura).toBeGreaterThan(dPecho);
    });

    it('la altura cambia la estatura y la entrepierna, no el ancho', () => {
      const bajo = medirCon(cuerpo, prep, pesosDe({ ...MACRO_INICIAL, altura: 0 }));
      const alto = medirCon(cuerpo, prep, pesosDe({ ...MACRO_INICIAL, altura: 1 }));
      expect(alto.estaturaCm - bajo.estaturaCm).toBeGreaterThan(20);
      expect(alto.entrepiernaCm).toBeGreaterThan(bajo.entrepiernaCm);
      expect(alto.entrepiernaCm / alto.estaturaCm).toBeGreaterThan(0.4);
      expect(alto.entrepiernaCm / alto.estaturaCm).toBeLessThan(0.52);
    });

    it('medir tarda poco (muy por debajo de los 300 ms del ajuste completo)', () => {
      const pesos = pesosDe({ ...MACRO_INICIAL, peso: 0.8 }, { barriga: 0.5 });
      medirCon(cuerpo, prep, pesos); // calentar el JIT
      const t0 = performance.now();
      for (let i = 0; i < 10; i++) medirCon(cuerpo, prep, pesos);
      expect((performance.now() - t0) / 10).toBeLessThan(40);
    });
  });
}
