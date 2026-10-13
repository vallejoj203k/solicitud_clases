import { describe, expect, it } from 'vitest';
import { P, type Pose, type Punto } from './puntos';
import { ContadorSentadilla, ejeDePie, medirSentadilla, resumir, type Repeticion } from './sentadilla';

/**
 * Poses sintéticas: un esqueleto de 1,75 m que hace sentadillas. De perfil la
 * cámara mira el costado (x adelante); de frente, mira la cara (x de lado).
 */
interface Forma {
  /** Muslo en el fondo, grados sobre la horizontal (0 = paralelo). */
  muslo: number;
  /** Torso en el fondo, grados desde la vertical. */
  torso: number;
  /** De frente: cuánto se cierran las rodillas en el fondo (m, cada una). */
  valgo?: number;
  /** Tibia en el fondo, grados hacia adelante (por defecto 35). */
  tibia?: number;
}

const FEMUR = 0.45;
const TIBIA = 0.43;
const TRONCO = 0.52;

/** Pose con avance a (0 de pie, 1 en el fondo). */
function pose(f: Forma, a: number, vista: 'perfil' | 'frente', ruido = 0, inclinacion = 0): Pose {
  const s = (x: number) => x + (Math.random() - 0.5) * ruido;
  const muslo = 90 - a * (90 - f.muslo); // grados sobre la horizontal
  const tibia = 3 + a * ((f.tibia ?? 35) - 3); // grados de la tibia hacia adelante
  const torso = 5 + a * (f.torso - 5);
  const rad = Math.PI / 180;
  // Plano sagital (adelante, arriba) en metros, tobillo en el origen.
  const tob = [0, 0];
  const rod = [TIBIA * Math.sin(tibia * rad), TIBIA * Math.cos(tibia * rad)];
  const cad = [rod[0] - FEMUR * Math.cos(muslo * rad), rod[1] + FEMUR * Math.sin(muslo * rad)];
  const hom = [cad[0] + TRONCO * Math.sin(torso * rad), cad[1] + TRONCO * Math.cos(torso * rad)];
  const nar = [hom[0] + 0.05, hom[1] + 0.22];
  const tal = [-0.06, 0];
  const pun = [0.17, 0];
  const ancho = { hombro: 0.19, cadera: 0.11, rodilla: 0.13 - (f.valgo ?? 0) * a, tobillo: 0.14 };
  // Punto 3D (x lateral, y abajo, z hacia la cámara) en el sistema del detector.
  const mundo: Punto[] = Array.from({ length: 33 }, () => ({ x: 0, y: 0, z: 0, visibility: 0.9 }));
  const poner = (i: number, sag: number[], lado: number) => {
    const adelante = sag[0];
    const arriba = sag[1];
    // De perfil: adelante = x de la imagen, el lado = profundidad; de frente al revés.
    const p = vista === 'perfil' ? { x: adelante, y: -arriba, z: lado } : { x: lado, y: -arriba, z: adelante };
    // Celular torcido: rota alrededor de la vista.
    const c = Math.cos(inclinacion * rad);
    const sn = Math.sin(inclinacion * rad);
    mundo[i] = { x: s(p.x * c - p.y * sn), y: s(p.x * sn + p.y * c), z: s(p.z), visibility: 0.9 };
  };
  for (const [l, signo] of [['izq', -1], ['der', 1]] as const) {
    poner(P.hombro[l], hom, signo * ancho.hombro);
    poner(P.cadera[l], cad, signo * ancho.cadera);
    poner(P.rodilla[l], rod, signo * ancho.rodilla);
    poner(P.tobillo[l], tob, signo * ancho.tobillo);
    poner(P.talon[l], tal, signo * ancho.tobillo);
    poner(P.punta[l], pun, signo * ancho.tobillo);
  }
  poner(P.nariz, nar, 0);
  // Origen en la cadera, como el detector.
  const c0 = { x: (mundo[23].x + mundo[24].x) / 2, y: (mundo[23].y + mundo[24].y) / 2, z: (mundo[23].z + mundo[24].z) / 2 };
  const m = mundo.map((p) => ({ ...p, x: p.x - c0.x, y: p.y - c0.y, z: p.z - c0.z }));
  // Imagen 9:16 vertical: el cuerpo ocupa ~80 % del alto.
  const aspecto = 9 / 16;
  const imagen = mundo.map((p) => ({ x: 0.5 + p.x / (2.3 * aspecto), y: 0.9 + p.y / 2.3, z: 0, visibility: p.visibility }));
  if (vista === 'perfil') for (const i of [P.hombro.der, P.cadera.der, P.rodilla.der, P.tobillo.der]) imagen[i].visibility = 0.3;
  return { imagen, mundo: m, aspecto };
}

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
    const reps = serie([BUENA, { muslo: 40, torso: 30 }, { muslo: 65, torso: 20 }, BUENA], 'perfil');
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

  it('si se pierde a la persona en medio y vuelve, la repetición cuenta (como "no se vio completa" si fue mucho)', () => {
    const conPerdida = (cuadrosPerdidos: number) => {
      const c = new ContadorSentadilla();
      let t = 0;
      for (let i = 0; i < 30; i++) c.procesar(medirSentadilla(pose(BUENA, 0, 'perfil')), (t += 1 / 30));
      for (let i = 0; i < 30; i++) c.procesar(medirSentadilla(pose(BUENA, i / 30, 'perfil')), (t += 1 / 30));
      for (let i = 0; i < cuadrosPerdidos; i++) c.procesar(medirSentadilla(null), (t += 1 / 30));
      for (let i = 0; i <= 30; i++) c.procesar(medirSentadilla(pose(BUENA, 1 - i / 30, 'perfil')), (t += 1 / 30));
      return c.repeticiones;
    };
    expect(conPerdida(10).map((r) => r.fallas)).toEqual([[]]);
    expect(conPerdida(60).map((r) => r.fallas)).toEqual([['fuera']]);
    expect(resumir(conPerdida(60)).consejos[0]).toMatch(/no se te veía entero/);
    // Si no vuelve en mucho rato, se fue: no cuenta.
    expect(conPerdida(250).length).toBe(0);
  });
});
