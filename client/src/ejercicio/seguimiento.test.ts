import { describe, expect, it } from 'vitest';
import type { Pose } from './puntos';
import { pose, type Forma, type Lugar } from './poseSintetica';
import { elegirPrincipal, Seguidor } from './seguimiento';
import { ContadorSentadilla, ejeDePie, medirSentadilla, resumir } from './sentadilla';

/** Gimnasio de prueba: quien entrena en el centro y gente que pasa por delante y por detrás. */
const BUENA: Forma = { muslo: -5, torso: 40 };
const CORTA: Forma = { muslo: 35, torso: 35 };
const DE_PIE: Forma = { muslo: 90, torso: 5 };
const ENTRENA: Lugar = { x: 0.5, piso: 0.9, escala: 1 };
/** Pasa por delante: más cerca de la cámara (más grande, pies más abajo). */
const delante = (x: number): Lugar => ({ x, piso: 1.0, escala: 1.7 });
/** Pasa por detrás: más lejos (más chico, pies más arriba). */
const detras = (x: number): Lugar => ({ x, piso: 0.8, escala: 0.7 });

describe('elegir a quién seguir', () => {
  it('la persona al frente: la más grande de cuerpo entero', () => {
    const entrena = pose(DE_PIE, 0, 'frente', 0, 0, ENTRENA);
    const lejos = pose(DE_PIE, 0, 'frente', 0, 0, { x: 0.2, piso: 0.75, escala: 0.6 });
    // Más grande pero cortada (sin pies en la imagen): no cuenta.
    const cortada = pose(DE_PIE, 0, 'frente', 0, 0, { x: 0.85, piso: 1.3, escala: 1.8 });
    expect(elegirPrincipal([lejos, cortada, entrena])).toBe(entrena);
    expect(elegirPrincipal([])).toBeNull();
  });

  it('ignora a quien pasa por delante o por detrás, aunque quede en el mismo lugar', () => {
    const s = new Seguidor();
    const entrena = pose(DE_PIE, 0, 'perfil', 0, 0, ENTRENA);
    expect(s.fijar(entrena)).toBe(true);
    const enFrente = pose(DE_PIE, 0, 'frente', 0, 0, delante(0.5));
    const atras = pose(DE_PIE, 0, 'frente', 0, 0, detras(0.5));
    expect(s.elegir([enFrente, atras])).toBeNull();
    const bajando = pose(BUENA, 0.3, 'perfil', 0, 0, ENTRENA);
    expect(s.elegir([enFrente, bajando, atras])).toBe(bajando);
  });
});

/**
 * Una serie con gente pasando: en cada cuadro el detector devuelve a todos en
 * cualquier orden, y quien pasa por delante tapa a quien entrena mientras cruza.
 */
function serieConGente(reps: Forma[], vista: 'perfil' | 'frente') {
  const fps = 30;
  const seguidor = new Seguidor();
  const contador = new ContadorSentadilla();
  const inicio = pose(DE_PIE, 0, vista, 0, 0, ENTRENA);
  const quien = elegirPrincipal([pose(DE_PIE, 0, 'frente', 0, 0, detras(0.3)), inicio]);
  expect(quien).toBe(inicio);
  seguidor.fijar(inicio);
  const eje = ejeDePie(inicio)!;
  let t = 0;
  let n = 0;
  let tapada = 0;
  const cuadro = (f: Forma, a: number) => {
    // Alguien cruza por delante cada 4 s y otro por detrás cada 3 s (de lado a lado en 2 s).
    const xd = ((n % 120) / 60) * 1.4 - 0.2;
    const xa = 1.2 - ((n % 90) / 60) * 1.4;
    const gente: Pose[] = [pose(DE_PIE, 0, 'frente', 0, 0, detras(xa))];
    const cruza = xd < 1.2;
    if (cruza) gente.push(pose(DE_PIE, 0, 'frente', 0, 0, delante(xd)));
    // Mientras quien cruza por delante está encima, el detector no ve a quien entrena.
    const tapa = cruza && Math.abs(xd - 0.5) < 0.12;
    if (tapa) tapada++;
    else gente.push(pose(f, a, vista, 0.005, 0, ENTRENA));
    gente.sort(() => Math.random() - 0.5);
    const elegida = seguidor.elegir(gente);
    contador.procesar(medirSentadilla(elegida, eje), t);
    t += 1 / fps;
    n++;
  };
  for (const f of reps) {
    for (let i = 0; i < fps; i++) cuadro(f, 0);
    for (let i = 0; i <= fps; i++) cuadro(f, (1 - Math.cos((Math.PI * i) / fps)) / 2);
    for (let i = 0; i <= fps; i++) cuadro(f, (1 + Math.cos((Math.PI * i) / fps)) / 2);
  }
  for (let i = 0; i < fps; i++) cuadro(DE_PIE, 0);
  return { reps: contador.repeticiones, tapada };
}

describe('serie con gente pasando', () => {
  for (const vista of ['perfil', 'frente'] as const) {
    it(`${vista}: sigue contando a quien entrena (10 repeticiones, 8 buenas y 2 cortas)`, () => {
      const { reps, tapada } = serieConGente([BUENA, BUENA, BUENA, CORTA, BUENA, BUENA, BUENA, BUENA, CORTA, BUENA], vista);
      expect(tapada).toBeGreaterThan(0);
      const r = resumir(reps);
      expect([r.total, r.buenas, r.malas]).toEqual([10, 8, 2]);
      expect(reps[3].fallas).toEqual(['profundidad']);
      expect(reps[8].fallas).toEqual(['profundidad']);
    });
  }
});
