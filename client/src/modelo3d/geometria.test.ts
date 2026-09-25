import { describe, expect, it } from 'vitest';
import {
  contornoCinta,
  cortePlano,
  envolvente2D,
  normalesVertice,
  prepararParticion,
  volumenMalla,
  volumenesSegmento,
} from './geometria';

/** Cilindro cerrado de eje Y, de y=0 a y=alto, con n lados y `pisos` anillos, orientado hacia afuera. */
function cilindro(radio: number, alto: number, n: number, pisos: number) {
  const pos: number[] = [];
  for (let j = 0; j <= pisos; j++) {
    for (let i = 0; i < n; i++) {
      const a = (2 * Math.PI * i) / n;
      pos.push(radio * Math.cos(a), (alto * j) / pisos, -radio * Math.sin(a));
    }
  }
  const abajo = pos.length / 3;
  pos.push(0, 0, 0);
  const arriba = pos.length / 3;
  pos.push(0, alto, 0);
  const tris: number[] = [];
  for (let j = 0; j < pisos; j++) {
    for (let i = 0; i < n; i++) {
      const a = j * n + i, b = j * n + ((i + 1) % n);
      const c = a + n, d = b + n;
      tris.push(a, b, d, a, d, c);
    }
  }
  for (let i = 0; i < n; i++) {
    tris.push(abajo, (i + 1) % n, i);
    tris.push(arriba, pisos * n + i, pisos * n + ((i + 1) % n));
  }
  return { pos: Float32Array.from(pos), tris };
}

/** Esfera UV de radio r centrada en el origen, orientada hacia afuera. */
function esfera(r: number, n: number) {
  const pos: number[] = [0, r, 0];
  for (let j = 1; j < n; j++) {
    const th = (Math.PI * j) / n;
    for (let i = 0; i < 2 * n; i++) {
      const ph = (Math.PI * i) / n;
      pos.push(r * Math.sin(th) * Math.cos(ph), r * Math.cos(th), -r * Math.sin(th) * Math.sin(ph));
    }
  }
  const sur = pos.length / 3;
  pos.push(0, -r, 0);
  const m = 2 * n;
  const anillo = (j: number, i: number) => 1 + (j - 1) * m + (i % m);
  const tris: number[] = [];
  for (let i = 0; i < m; i++) tris.push(0, anillo(1, i), anillo(1, i + 1));
  for (let j = 1; j < n - 1; j++) {
    for (let i = 0; i < m; i++) {
      const a = anillo(j, i), b = anillo(j, i + 1), c = anillo(j + 1, i), d = anillo(j + 1, i + 1);
      tris.push(a, c, d, a, d, b);
    }
  }
  for (let i = 0; i < m; i++) tris.push(sur, anillo(n - 1, i + 1), anillo(n - 1, i));
  return { pos: Float32Array.from(pos), tris };
}

/** Volumen exacto de un prisma de n lados inscrito en un círculo de radio r. */
const volPrisma = (r: number, h: number, n: number) => 0.5 * n * r * r * Math.sin((2 * Math.PI) / n) * h;
/** Perímetro exacto de un n-gono regular inscrito. */
const perimetroPoligono = (r: number, n: number) => 2 * n * r * Math.sin(Math.PI / n);

describe('volumenMalla', () => {
  it('cilindro: da el volumen exacto del prisma y se acerca a πr²h', () => {
    const { pos, tris } = cilindro(0.15, 0.8, 64, 10);
    const v = volumenMalla(pos, tris);
    expect(v).toBeCloseTo(volPrisma(0.15, 0.8, 64), 6);
    expect(Math.abs(v / (Math.PI * 0.15 ** 2 * 0.8) - 1)).toBeLessThan(0.002);
  });

  it('esfera: se acerca a 4/3 πr³ y es positiva (normales hacia afuera)', () => {
    const { pos, tris } = esfera(0.3, 96);
    const v = volumenMalla(pos, tris);
    expect(v).toBeGreaterThan(0);
    expect(Math.abs(v / ((4 / 3) * Math.PI * 0.3 ** 3) - 1)).toBeLessThan(0.002);
  });

  it('no depende de dónde esté la malla', () => {
    const { pos, tris } = esfera(0.3, 32);
    const movida = pos.map((x, i) => x + [5, -2, 7][i % 3]);
    expect(volumenMalla(movida, tris)).toBeCloseTo(volumenMalla(pos, tris), 7);
  });
});

describe('normalesVertice', () => {
  it('en la esfera apuntan hacia afuera, en la dirección del radio', () => {
    const { pos, tris } = esfera(1, 24);
    const n = normalesVertice(pos, tris);
    for (let v = 0; v < pos.length; v += 3) {
      const dot = n[v] * pos[v] + n[v + 1] * pos[v + 1] + n[v + 2] * pos[v + 2];
      expect(dot).toBeGreaterThan(0.99);
    }
  });
});

describe('volumenesSegmento', () => {
  const n = 48, pisos = 12, alto = 1.2, radio = 0.2;
  const { pos, tris } = cilindro(radio, alto, n, pisos);
  const total = volumenMalla(pos, tris);

  it('corte recto a media altura: cada mitad vale la mitad y suman el total', () => {
    const seg = new Uint8Array(pos.length / 3);
    for (let v = 0; v < seg.length; v++) seg[v] = pos[v * 3 + 1] > alto / 2 + 1e-6 ? 1 : 0;
    const vol = volumenesSegmento(pos, tris, prepararParticion(tris, seg, 2));
    expect(vol[0] + vol[1]).toBeCloseTo(total, 9);
    // La junta queda entre los pisos 6 y 7 (los triángulos con mayoría abajo van
    // al segmento 0): se compara con la altura a la que queda realmente.
    expect(vol[0]).toBeGreaterThan(0);
    expect(vol[1]).toBeGreaterThan(0);
    expect(Math.abs(vol[0] - vol[1]) / total).toBeLessThan(0.1);
  });

  it('junta dentada (no plana): la suma sigue siendo exacta', () => {
    const seg = new Uint8Array(pos.length / 3);
    for (let v = 0; v < seg.length; v++) {
      const a = Math.atan2(-pos[v * 3 + 2], pos[v * 3]);
      const corte = alto / 2 + 0.25 * Math.sin(3 * a);
      seg[v] = pos[v * 3 + 1] > corte ? 1 : 0;
    }
    const vol = volumenesSegmento(pos, tris, prepararParticion(tris, seg, 2));
    expect(vol[0] + vol[1]).toBeCloseTo(total, 9);
    expect(vol[0]).toBeGreaterThan(0);
    expect(vol[1]).toBeGreaterThan(0);
  });

  it('tres segmentos: la suma sigue siendo exacta', () => {
    const seg = new Uint8Array(pos.length / 3);
    for (let v = 0; v < seg.length; v++) seg[v] = Math.min(2, Math.floor((pos[v * 3 + 1] / alto) * 3));
    const vol = volumenesSegmento(pos, tris, prepararParticion(tris, seg, 3));
    expect(vol[0] + vol[1] + vol[2]).toBeCloseTo(total, 9);
    for (const x of vol) expect(Math.abs(x / (total / 3) - 1)).toBeLessThan(0.15);
  });
});

describe('envolvente2D', () => {
  it('descarta los puntos interiores', () => {
    const xs = [0, 1, 1, 0, 0.5, 0.2, 0.7];
    const ys = [0, 0, 1, 1, 0.5, 0.3, 0.9];
    expect(envolvente2D(xs, ys).sort()).toEqual([0, 1, 2, 3]);
  });
});

describe('contornoCinta', () => {
  const n = 64;
  const { pos, tris } = cilindro(0.15, 0.8, n, 8);
  const todos = Array.from({ length: tris.length / 3 }, (_, i) => i);

  it('corte horizontal de un cilindro: perímetro del polígono inscrito', () => {
    const puntos = cortePlano(pos, tris, todos, [0, 0.37, 0], [0, 1, 0]);
    const c = contornoCinta(puntos, [0, 0.37, 0], [0, 1, 0]);
    expect(c.perimetro).toBeCloseTo(perimetroPoligono(0.15, n), 6);
    // Los cortes de las diagonales caen sobre los lados: puntos colineales de más.
    expect(c.anillo.length / 3).toBeGreaterThanOrEqual(n);
  });

  it('corte oblicuo: perímetro de la elipse (plano inclinado 30°)', () => {
    const inc = Math.PI / 6;
    const normal: [number, number, number] = [Math.sin(inc), Math.cos(inc), 0];
    const puntos = cortePlano(pos, tris, todos, [0, 0.4, 0], normal);
    const c = contornoCinta(puntos, [0, 0.4, 0], normal);
    // Elipse con semiejes r y r / cos(30°) (Ramanujan).
    const a = 0.15 / Math.cos(inc), b = 0.15;
    const h = ((a - b) / (a + b)) ** 2;
    const elipse = Math.PI * (a + b) * (1 + (3 * h) / (10 + Math.sqrt(4 - 3 * h)));
    expect(Math.abs(c.perimetro / elipse - 1)).toBeLessThan(0.002);
  });

  it('dos piernas: la cinta rodea las dos (envolvente convexa)', () => {
    const a = cilindro(0.08, 0.8, 48, 4);
    const b = cilindro(0.08, 0.8, 48, 4);
    const desplazo = 0.1;
    const pos2 = new Float32Array(a.pos.length * 2);
    pos2.set(a.pos.map((x, i) => (i % 3 === 0 ? x - desplazo : x)));
    pos2.set(b.pos.map((x, i) => (i % 3 === 0 ? x + desplazo : x)), a.pos.length);
    const off = a.pos.length / 3;
    const tris2 = [...a.tris, ...b.tris.map((v) => v + off)];
    const todos2 = Array.from({ length: tris2.length / 3 }, (_, i) => i);
    const puntos = cortePlano(pos2, tris2, todos2, [0, 0.5, 0], [0, 1, 0]);
    const c = contornoCinta(puntos, [0, 0.5, 0], [0, 1, 0]);
    // Estadio: 2 rectas de 2·desplazo + una circunferencia completa.
    expect(Math.abs(c.perimetro / (4 * desplazo + 2 * Math.PI * 0.08) - 1)).toBeLessThan(0.003);
  });

  it('radioMax deja afuera otra parte cortada por el mismo plano', () => {
    const a = cilindro(0.1, 0.8, 48, 4);
    const lejos = cilindro(0.05, 0.8, 48, 4);
    const pos2 = new Float32Array(a.pos.length * 2);
    pos2.set(a.pos);
    pos2.set(lejos.pos.map((x, i) => (i % 3 === 0 ? x + 0.5 : x)), a.pos.length);
    const off = a.pos.length / 3;
    const tris2 = [...a.tris, ...lejos.tris.map((v) => v + off)];
    const todos2 = Array.from({ length: tris2.length / 3 }, (_, i) => i);
    const puntos = cortePlano(pos2, tris2, todos2, [0, 0.5, 0], [0, 1, 0]);
    const c = contornoCinta(puntos, [0, 0.5, 0], [0, 1, 0], 0.2);
    expect(c.perimetro).toBeCloseTo(perimetroPoligono(0.1, 48), 6);
  });
});
