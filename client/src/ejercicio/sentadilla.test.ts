import { describe, expect, it } from 'vitest';
import { P } from './puntos';
import { pose, type Forma } from './poseSintetica';
import { ContadorSentadilla, ejeDePie, medirSentadilla, resumir, type Repeticion } from './sentadilla';

/** Una serie: reps con su forma; 30 cuadros por segundo, 2 s por repetición y 1 s de pie entre ellas. */
function serie(reps: Forma[], vista: 'perfil' | 'frente', opciones: { ruido?: number; inclinacion?: number; bajada?: number; alcance?: number } = {}) {
  const fps = 30;
  const contador = new ContadorSentadilla();
  const eje = ejeDePie(pose({ muslo: 0, torso: 0 }, 0, vista, 0, opciones.inclinacion ?? 0))!;
  const hechas: Repeticion[] = [];
  let t = 0;
  const cuadro = (f: Forma, a: number) => {
    const r = contador.procesar(medirSentadilla(pose(f, a, vista, opciones.ruido ?? 0, opciones.inclinacion ?? 0), eje), t);
    if (r) hechas.push(r);
    t += 1 / fps;
  };
  const bajada = opciones.bajada ?? 1;
  for (const f of reps) {
    for (let i = 0; i < fps; i++) cuadro(f, 0);
    const k = opciones.alcance ?? 1;
    for (let i = 0; i <= bajada * fps; i++) cuadro(f, (k * (1 - Math.cos((Math.PI * i) / (bajada * fps)))) / 2);
    for (let i = 0; i <= fps; i++) cuadro(f, (k * (1 + Math.cos((Math.PI * i) / fps))) / 2);
  }
  for (let i = 0; i < fps; i++) cuadro(reps[0] ?? { muslo: 0, torso: 0 }, 0);
  return hechas;
}

const BUENA: Forma = { muslo: -5, torso: 40 };
const CORTA: Forma = { muslo: 35, torso: 35 };

describe('medidas de un cuadro', () => {
  it('de pie: rodilla estirada, muslo vertical, torso derecho; en el fondo, muslo paralelo', () => {
    const de = medirSentadilla(pose(BUENA, 0, 'perfil'));
    const fondo = medirSentadilla(pose({ muslo: 0, torso: 45 }, 1, 'perfil'));
    expect(de.tipo).toBe('ok');
    expect(fondo.tipo).toBe('ok');
    if (de.tipo !== 'ok' || fondo.tipo !== 'ok') return;
    expect(de.cuadro.vista).toBe('perfil');
    expect(de.cuadro.rodilla).toBeGreaterThan(165);
    expect(de.cuadro.muslo).toBeGreaterThan(80);
    expect(fondo.cuadro.muslo).toBeCloseTo(0, 0);
    expect(fondo.cuadro.torso).toBeCloseTo(45, 0);
  });

  it('reconoce de frente y de perfil', () => {
    const f = medirSentadilla(pose(BUENA, 0, 'frente'));
    expect(f.tipo === 'ok' && f.cuadro.vista).toBe('frente');
  });

  it('si no se ven los pies, lo dice', () => {
    const p = pose(BUENA, 0, 'perfil');
    p.imagen[P.tobillo.izq].y = 1.1;
    const l = medirSentadilla(p);
    expect(l.tipo).toBe('incompleto');
    expect(l.tipo === 'incompleto' && l.motivo).toMatch(/pies/);
  });

  it('con el celular torcido, el eje de pie corrige la vertical', () => {
    const eje = ejeDePie(pose(BUENA, 0, 'perfil', 0, 12))!;
    const l = medirSentadilla(pose({ muslo: 0, torso: 45 }, 1, 'perfil', 0, 12), eje);
    expect(l.tipo === 'ok' && Math.abs(l.cuadro.muslo)).toBeLessThan(3);
    expect(l.tipo === 'ok' && Math.abs(l.cuadro.torso - 45)).toBeLessThan(3);
  });
});

describe('contador', () => {
  it('10 repeticiones: 8 buenas y 2 cortas (el ejemplo)', () => {
    const reps = serie([BUENA, BUENA, BUENA, CORTA, BUENA, BUENA, BUENA, BUENA, CORTA, BUENA], 'perfil');
    const r = resumir(reps);
    expect(r.total).toBe(10);
    expect(r.buenas).toBe(8);
    expect(r.malas).toBe(2);
    expect(reps[3].fallas).toEqual(['profundidad']);
    expect(reps[8].fallas).toEqual(['profundidad']);
    expect(r.consejos[0]).toMatch(/Baja más/);
  });

  it('con ruido del detector cuenta igual', () => {
    const reps = serie(Array(8).fill(BUENA), 'perfil', { ruido: 0.02 });
    expect(reps.length).toBe(8);
    expect(reps.filter((r) => r.buena).length).toBeGreaterThanOrEqual(7);
  });

  it('torso muy inclinado', () => {
    const reps = serie([{ muslo: -5, torso: 70 }, BUENA], 'perfil');
    expect(reps.map((r) => r.fallas)).toEqual([['torso'], []]);
    expect(resumir(reps).consejos[0]).toMatch(/pecho arriba/);
  });

  it('de frente también: 10 repeticiones, 8 buenas y 2 cortas', () => {
    const reps = serie([BUENA, BUENA, BUENA, CORTA, BUENA, BUENA, BUENA, BUENA, CORTA, BUENA], 'frente');
    expect(reps.every((r) => r.vista === 'frente')).toBe(true);
    const r = resumir(reps);
    expect([r.total, r.buenas, r.malas]).toEqual([10, 8, 2]);
    expect(reps[3].fallas).toEqual(['profundidad']);
    expect(reps[8].fallas).toEqual(['profundidad']);
  });

  it('de frente: media sentadilla, el paralelo justo y el torso muy inclinado', () => {
    const reps = serie([{ muslo: 40, torso: 30 }, { muslo: 5, torso: 40 }, { muslo: 18, torso: 40 }, { muslo: -5, torso: 70 }], 'frente');
    expect(reps.map((r) => r.fallas)).toEqual([['profundidad'], [], ['profundidad'], ['torso']]);
  });

  it('de frente con el celular torcido y con ruido', () => {
    const reps = serie([BUENA, CORTA, BUENA, BUENA], 'frente', { inclinacion: 8, ruido: 0.01 });
    expect(reps.map((r) => r.buena)).toEqual([true, false, true, true]);
  });

  it('rodillas hacia adentro (de frente)', () => {
    const reps = serie([BUENA, { ...BUENA, valgo: 0.07 }], 'frente');
    expect(reps.map((r) => r.buena)).toEqual([true, false]);
    expect(reps[1].fallas).toEqual(['rodillas']);
    expect(resumir(reps).consejos[0]).toMatch(/rodillas hacia afuera/);
  });

  it('un acomodo (doblar apenas las rodillas) no es una repetición', () => {
    const reps = serie([BUENA], 'perfil', { alcance: 0.15 });
    expect(reps.length).toBe(0);
    expect(resumir(reps).consejos[0]).toMatch(/No se contó/);
  });

  it('todas bien: felicita; bajando muy rápido, sugiere control', () => {
    expect(resumir(serie([BUENA, BUENA, BUENA], 'perfil')).consejos[0]).toMatch(/Muy bien/);
    const rapidas = resumir(serie([BUENA, BUENA, BUENA], 'perfil', { bajada: 0.4 }));
    expect(rapidas.buenas).toBe(3);
    expect(rapidas.consejos.some((c) => /despacio/.test(c))).toBe(true);
  });

  it('media sentadilla y cuarto de sentadilla cuentan, como mal hechas', () => {
    const reps = serie([BUENA, { muslo: 40, torso: 30 }, { muslo: 60, torso: 20 }, BUENA], 'perfil');
    expect(reps.length).toBe(4);
    expect(reps.map((r) => r.buena)).toEqual([true, false, false, true]);
    expect(reps[1].fallas).toEqual(['profundidad']);
    expect(reps[2].fallas).toEqual(['profundidad']);
  });

  it('cerrar mucho la rodilla con la cadera alta (rodillas muy adelante) no es buena profundidad', () => {
    const reps = serie([{ muslo: 20, torso: 35, tibia: 50 }], 'perfil');
    expect(reps[0].rodillaMin).toBeLessThan(85);
    expect(reps[0].fallas).toEqual(['profundidad']);
  });

  it('el umbral es el paralelo: 5° por encima vale, 18° no', () => {
    const reps = serie([{ muslo: 5, torso: 40 }, { muslo: 18, torso: 40 }], 'perfil');
    expect(reps.map((r) => r.buena)).toEqual([true, false]);
  });

  it('con la cabeza fuera de cuadro también cuenta (basta de los hombros a los pies)', () => {
    const c = new ContadorSentadilla();
    let t = 0;
    const sinCabeza = (a: number) => {
      const p = pose(BUENA, a, 'perfil');
      p.imagen[P.nariz].y = -0.1;
      return medirSentadilla(p);
    };
    for (let i = 0; i < 30; i++) c.procesar(sinCabeza(0), (t += 1 / 30));
    for (let i = 0; i <= 30; i++) c.procesar(sinCabeza((1 - Math.cos((Math.PI * i) / 30)) / 2), (t += 1 / 30));
    for (let i = 0; i <= 30; i++) c.procesar(sinCabeza((1 + Math.cos((Math.PI * i) / 30)) / 2), (t += 1 / 30));
    expect(c.repeticiones.map((r) => r.buena)).toEqual([true]);
  });

  it('si se pierde a la persona en medio y vuelve, la repetición cuenta', () => {
    /** Baja hasta `hasta` (avance 0 a 1), se pierde `perdidos` cuadros y vuelve a verse subiendo. */
    const conPerdida = (perdidos: number, forma: Forma = BUENA, hasta = 1) => {
      const c = new ContadorSentadilla();
      let t = 0;
      for (let i = 0; i < 30; i++) c.procesar(medirSentadilla(pose(forma, 0, 'perfil')), (t += 1 / 30));
      for (let i = 0; i <= 30; i++) c.procesar(medirSentadilla(pose(forma, (hasta * i) / 30, 'perfil')), (t += 1 / 30));
      for (let i = 0; i < perdidos; i++) c.procesar(medirSentadilla(null), (t += 1 / 30));
      for (let i = 0; i <= 30; i++) c.procesar(medirSentadilla(pose(forma, 0.5 * (1 - i / 30), 'perfil')), (t += 1 / 30));
      return c.repeticiones;
    };
    // Un momento sin verla: nada cambia.
    expect(conPerdida(10).map((r) => r.fallas)).toEqual([[]]);
    // Mucho rato, pero ya se la había visto llegar al paralelo: buena.
    expect(conPerdida(60).map((r) => r.fallas)).toEqual([[]]);
    // Mucho rato sin haberla visto llegar al paralelo: no se sabe.
    const sinFondo = conPerdida(60, BUENA, 0.5);
    expect(sinFondo.map((r) => r.fallas)).toEqual([['fuera']]);
    expect(resumir(sinFondo).consejos[0]).toMatch(/no se te veía entero/);
    // Si no vuelve en mucho rato, se fue: no cuenta.
    expect(conPerdida(250).length).toBe(0);
  });
});
