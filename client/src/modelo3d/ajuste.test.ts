/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { ajustar, controlesSinGrasa, fraccionVolumenGrasa, type EntradaAjuste } from './ajuste';
import { desdeGltf } from './cargar';
import { CLIENTES_EJEMPLO } from './clientesEjemplo';
import { controlesLocales, pesosLocales, pesosMacro, MACRO_INICIAL } from './controles';
import { medir, posicionesArticulaciones, prepararMedicion, type PrepMedicion } from './medicion';
import { aplicarMorphs } from './motor';
import { entradaAjusteDe } from './objetivos';
import type { Borrador } from './cliente';
import type { CuerpoBase, MetaCuerpo, Sexo } from './tipos';

/** Fase 3: criterios de aceptación del solver sobre los cuerpos reales. */

const carpeta = fileURLToPath(new URL('../../public/modelo3d/', import.meta.url));
const cuerpos = {} as Record<Sexo, { cuerpo: CuerpoBase; prep: PrepMedicion }>;

beforeAll(async () => {
  for (const [sexo, nombre] of [['M', 'cuerpo-hombre'], ['F', 'cuerpo-mujer']] as const) {
    const glb = readFileSync(`${carpeta}${nombre}.glb`);
    const meta = JSON.parse(readFileSync(`${carpeta}${nombre}.json`, 'utf8')) as MetaCuerpo;
    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    const gltf = await loader.parseAsync(glb.buffer.slice(glb.byteOffset, glb.byteOffset + glb.byteLength), '');
    const cuerpo = desdeGltf(sexo, gltf.scene, meta);
    cuerpos[sexo] = { cuerpo, prep: prepararMedicion(cuerpo) };
  }
});

function resolver(b: Borrador) {
  const entrada = entradaAjusteDe(b)!;
  const { cuerpo, prep } = cuerpos[b.sexo];
  return { entrada, r: ajustar(cuerpo, prep, entrada) };
}

const informe = (i: number) => CLIENTES_EJEMPLO[i].borrador;
const reporte = (r: ReturnType<typeof ajustar>) =>
  r.residuos.map((x) => `${x.etiqueta}: ${x.medido.toFixed(1)} vs ${x.objetivo.toFixed(1)}`).join(' | ') +
  ` · ${r.iteraciones} it, ${r.evaluaciones} ev, ${r.ms.toFixed(0)} ms`;

describe('ajuste a objetivos geométricos', () => {
  for (const i of [0, 1, 2, 3]) {
    it(`${CLIENTES_EJEMPLO[i].titulo}: cumple estatura ±0,5 cm, volumen ±2 % y cinta ±1,5 cm`, () => {
      const { r } = resolver(informe(i));
      console.log(CLIENTES_EJEMPLO[i].titulo, '->', reporte(r));
      for (const x of r.residuos) expect(Math.abs(x.diferencia), x.etiqueta).toBeLessThanOrEqual(x.tolerancia);
      expect(r.cumple).toBe(true);
    });
  }

  it('grasa visceral alta = barriga prominente (caso extremo, visceral 16; informe 21-09, visceral 13)', () => {
    const extremo = resolver(informe(3)).r;
    const informe0 = resolver(informe(0)).r;
    const carlos = resolver(informe(1)).r; // visceral 8
    console.log('barriga: extremo', extremo.locales.barriga.toFixed(2), 'informe', informe0.locales.barriga.toFixed(2), 'carlos', carlos.locales.barriga.toFixed(2));
    expect(extremo.locales.barriga).toBeGreaterThan(0.6);
    expect(informe0.locales.barriga).toBeGreaterThan(0.4);
    expect(carlos.locales.barriga).toBeLessThan(0.2);
  });

  it('con medidas completas de cinta también cumple (hombre y mujer)', () => {
    const conCinta = (b: Borrador, m: Record<string, string>): Borrador => ({ ...b, valores: { ...b.valores, ...m } });
    const casos: Borrador[] = [
      conCinta(informe(1), { m_pecho: '100', m_cintura: '86', m_cadera: '98', m_cuello: '38', m_brazo: '32', m_muslo: '56', m_pantorrilla: '37', m_hombros: '41', m_entrepierna: '80' }),
      conCinta(informe(2), { m_pecho: '94', m_cintura: '82', m_cadera: '104', m_cuello: '33', m_brazo: '29', m_muslo: '58', m_pantorrilla: '36', m_hombros: '36', m_entrepierna: '74' }),
    ];
    for (const b of casos) {
      const { r } = resolver(b);
      console.log(b.nombre, 'con cinta ->', reporte(r));
      for (const x of r.residuos) expect(Math.abs(x.diferencia), `${b.nombre} ${x.etiqueta}`).toBeLessThanOrEqual(x.tolerancia);
    }
  });

  it('recupera las medidas de un cuerpo generado al azar (hombre y mujer)', () => {
    let semilla = 7;
    const azar = () => ((semilla = (semilla * 16807) % 2147483647) / 2147483647);
    for (const sexo of ['M', 'F'] as Sexo[]) {
      const { cuerpo, prep } = cuerpos[sexo];
      const ctl = controlesLocales(cuerpo.meta);
      const macro = { ...MACRO_INICIAL, musculo: 0.2 + 0.6 * azar(), peso: 0.2 + 0.7 * azar(), altura: 0.2 + 0.6 * azar() };
      const locales = { barriga: azar() * 0.6, cadera: azar() - 0.5, hombros: azar() - 0.5, brazo_izq_grasa: azar() * 0.5, brazo_der_grasa: azar() * 0.5 };
      const pesos = { ...pesosMacro(macro, sexo), ...pesosLocales(locales, ctl) };
      const info = { desplazoY: 0 };
      const pos = aplicarMorphs(cuerpo, pesos, undefined, info);
      const m = medir(cuerpo, prep, pos, posicionesArticulaciones(prep, pesos, info.desplazoY)).medidas;
      const obj = (clave: string, valor: number, unidad: 'cm' | 'L', sigma: number, tolerancia: number) => ({ clave, etiqueta: clave, valor, unidad, fuente: 'cinta' as const, sigma, tolerancia });
      const entrada: EntradaAjuste = {
        fijos: { edad: 25 },
        objetivos: [
          obj('estatura', m.estaturaCm, 'cm', 0.15, 0.5),
          obj('volumen', m.volumenL, 'L', 0.005 * m.volumenL, 0.02 * m.volumenL),
          ...['pecho', 'cintura', 'cadera', 'brazo_izq', 'brazo_der', 'muslo_izq'].map((c) => obj(`circ:${c}`, m.circunferenciasCm[c], 'cm', 0.4, 1.5)),
          obj('hombros', m.hombrosCm, 'cm', 0.4, 1.5),
        ],
      };
      const r = ajustar(cuerpo, prep, entrada);
      console.log('azar', sexo, '->', reporte(r));
      expect(r.cumple).toBe(true);
    }
  });

  it('tarda menos de 300 ms', () => {
    const b: Borrador = { ...informe(3), valores: { ...informe(3).valores, m_cuello: '42', m_brazo: '36', m_muslo: '62', m_hombros: '44' } };
    resolver(b); // calentar
    const { r } = resolver(b);
    console.log('tiempo con 10 objetivos:', r.ms.toFixed(0), 'ms');
    expect(r.ms).toBeLessThan(300);
  });
});

describe('cuerpo sin grasa', () => {
  it('tiene el volumen de la masa libre de grasa y queda más chico que el completo', () => {
    const { r, entrada } = resolver(informe(0));
    const { cuerpo } = cuerpos.M;
    const volumen = entrada.objetivos.find((o) => o.clave === 'volumen')!.valor;
    const magro = volumen * (1 - fraccionVolumenGrasa(32.4));
    // Masa libre de grasa / 1,1 kg/L = 63,3 L
    expect(magro).toBeCloseTo(69.6 / 1.1, 0);
    const s = controlesSinGrasa(cuerpo, r.macro, r.locales, magro);
    expect(s.macro.peso).toBeLessThan(r.macro.peso);
  });
});
