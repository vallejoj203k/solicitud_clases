import { P, visible, type Lado, type Pose } from './puntos';

/**
 * Seguir a una sola persona en un gimnasio lleno.
 *
 * El detector ve hasta varias personas por cuadro. Al empezar se elige la
 * principal (`elegirPrincipal`): la que se ve más grande de cuerpo entero, o sea
 * la que está al frente de la cámara. Desde ahí se la sigue por los pies
 * (`Seguidor`): en una sentadilla los pies no se mueven, así que en cada cuadro
 * se toma la persona cuyos tobillos están donde estaban los suyos y que se ve del
 * mismo tamaño. Quien pase por delante (más grande, pies más abajo) o por detrás
 * (más chico, pies más arriba) no coincide y se ignora; si tapa a la persona
 * seguida un momento, ese cuadro no tiene a nadie y se espera a que vuelva, sin
 * pasarse a otra.
 */

export const SEGUIMIENTO = {
  /** Distancia máxima de los tobillos a donde estaban, en largos de tibia. */
  distancia: 0.8,
  /**
   * Tamaño (largo de tibia en la imagen) respecto al último de la persona seguida.
   * Estrecho porque alguien parado justo detrás, con los pies alineados, solo se
   * distingue por verse más chico (~0,7 a un metro detrás).
   */
  tamanoMin: 0.8,
  tamanoMax: 1.25,
  /** Cuánto se acomoda el ancla a los pies en cada cuadro (sigue un paso chico, no a quien camina). */
  acomodo: 0.05,
  /**
   * Cuánto se acomoda el tamaño en cada cuadro: de frente la tibia se ve más
   * corta al bajar (se inclina hacia la cámara), y eso pasa de a poco.
   */
  acomodoTamano: 0.25,
};

/** Dónde están los pies de la persona seguida y de qué tamaño se ve (unidades de la imagen). */
export interface Ancla {
  x: number;
  y: number;
  /** Largo de la tibia en la imagen: la escala de la persona. */
  tibia: number;
}

const enImagen = (pose: Pose, i: number) => [pose.imagen[i].x * pose.aspecto, pose.imagen[i].y];
const dentro = (pose: Pose, i: number) => {
  const p = pose.imagen[i];
  return p.x > -0.02 && p.x < 1.02 && p.y > -0.02 && p.y < 1.02;
};

/** Pies y tamaño de una persona, o null si no se le ven los tobillos. */
export function anclaDe(pose: Pose): Ancla | null {
  const lados = (['izq', 'der'] as Lado[]).filter((l) => visible(pose.imagen[P.tobillo[l]], 0.3) && dentro(pose, P.tobillo[l]));
  if (!lados.length) return null;
  let x = 0;
  let y = 0;
  let tibia = 0;
  let n = 0;
  for (const l of lados) {
    const t = enImagen(pose, P.tobillo[l]);
    x += t[0] / lados.length;
    y += t[1] / lados.length;
    if (visible(pose.imagen[P.rodilla[l]], 0.3)) {
      const r = enImagen(pose, P.rodilla[l]);
      tibia += Math.hypot(r[0] - t[0], r[1] - t[1]);
      n++;
    }
  }
  return n ? { x, y, tibia: tibia / n } : null;
}

/** Alto de una persona en la imagen, de los hombros a los tobillos; 0 si no se ve entera. */
export function altoEnImagen(pose: Pose): number {
  const claves = [P.hombro.izq, P.hombro.der, P.tobillo.izq, P.tobillo.der];
  const vistos = claves.filter((i) => visible(pose.imagen[i]) && dentro(pose, i));
  // Hace falta al menos un hombro y un tobillo (de perfil se tapa el otro lado).
  const hombros = vistos.filter((i) => i === P.hombro.izq || i === P.hombro.der);
  const tobillos = vistos.filter((i) => i === P.tobillo.izq || i === P.tobillo.der);
  if (!hombros.length || !tobillos.length) return 0;
  const arriba = Math.min(...hombros.map((i) => pose.imagen[i].y));
  const abajo = Math.max(...tobillos.map((i) => pose.imagen[i].y));
  return Math.max(0, abajo - arriba);
}

/** La persona al frente: la más grande de las que se ven de cuerpo entero. */
export function elegirPrincipal(poses: readonly Pose[]): Pose | null {
  let mejor: Pose | null = null;
  let alto = 0;
  for (const p of poses) {
    const a = altoEnImagen(p);
    if (a > alto && anclaDe(p)) {
      alto = a;
      mejor = p;
    }
  }
  return mejor;
}

export class Seguidor {
  ancla: Ancla | null = null;

  constructor(private readonly s = SEGUIMIENTO) {}

  /** Empieza a seguir a esta persona. Devuelve false si no se le ven los pies. */
  fijar(pose: Pose): boolean {
    this.ancla = anclaDe(pose);
    return this.ancla !== null;
  }

  soltar() {
    this.ancla = null;
  }

  /** Cuánto se alejaron los pies de una pose del ancla, en largos de tibia (Infinity si no es comparable). */
  distancia(pose: Pose): number {
    const a = anclaDe(pose);
    const b = this.ancla;
    if (!a || !b) return Infinity;
    const tamano = a.tibia / b.tibia;
    if (tamano < this.s.tamanoMin || tamano > this.s.tamanoMax) return Infinity;
    return Math.hypot(a.x - b.x, a.y - b.y) / b.tibia;
  }

  /** La persona seguida entre las que se detectaron en este cuadro, o null si no está (tapada o fuera). */
  elegir(poses: readonly Pose[]): Pose | null {
    if (!this.ancla) return null;
    let mejor: Pose | null = null;
    let min = this.s.distancia;
    for (const p of poses) {
      const d = this.distancia(p);
      if (d <= min) {
        min = d;
        mejor = p;
      }
    }
    if (mejor) {
      // Se acomoda despacio a los pies (por si da un paso chico) y al tamaño.
      const a = anclaDe(mejor)!;
      const k = this.s.acomodo;
      const kt = this.s.acomodoTamano;
      this.ancla = { x: this.ancla.x + k * (a.x - this.ancla.x), y: this.ancla.y + k * (a.y - this.ancla.y), tibia: this.ancla.tibia + kt * (a.tibia - this.ancla.tibia) };
    }
    return mejor;
  }
}
