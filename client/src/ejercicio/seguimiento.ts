import { P, visible, type Lado, type Pose } from './puntos';

/**
 * Seguir a una sola persona en un gimnasio lleno.
 *
 * El detector busca una persona y la "sigue" de un cuadro al otro (así es
 * rápido y estable en el fondo de la sentadilla, y quien pasa por detrás no lo
 * desvía). Al empezar se fija a quién (`Seguidor.fijar`): la persona de pie y
 * quieta frente a la cámara. Desde ahí cada cuadro se valida por los pies
 * (`Seguidor.elegir`): en una sentadilla no se mueven, así que vale si los
 * tobillos están donde estaban y se ve del mismo tamaño. Lo que no coincide es
 * una de dos cosas (`Seguidor.clasificar`):
 * - una falla del detector (pasa en el fondo de la sentadilla: el esqueleto está
 *   donde estaba la persona pero con los pies mal ubicados): se ignora ese cuadro;
 * - otra persona (su cuerpo está en otro lugar): el detector se pasó a ella. La
 *   página la tapa en la imagen que analiza un momento para que vuelva a
 *   encontrar a quien entrena.
 * Con varias personas en el cuadro (`elegirPrincipal`), la principal es la más
 * grande de cuerpo entero: la que está al frente.
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

/** Rectángulo de una persona en la imagen (coordenadas normalizadas del video, 0 a 1). */
export interface Caja {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** El rectángulo que ocupan los puntos visibles de una persona. */
export function cajaDe(pose: Pose): Caja | null {
  const ps = pose.imagen.filter((p) => (p.visibility ?? 1) >= 0.3);
  if (ps.length < 4) return null;
  return {
    x0: Math.min(...ps.map((p) => p.x)),
    y0: Math.min(...ps.map((p) => p.y)),
    x1: Math.max(...ps.map((p) => p.x)),
    y1: Math.max(...ps.map((p) => p.y)),
  };
}

/** Qué parte de la caja b queda dentro de la caja a (0 a 1). */
export function solape(a: Caja, b: Caja): number {
  const w = Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0));
  const h = Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));
  const area = (b.x1 - b.x0) * (b.y1 - b.y0);
  return area > 0 ? (w * h) / area : 0;
}

export class Seguidor {
  ancla: Ancla | null = null;
  /** Dónde se vio por última vez a la persona seguida. */
  caja: Caja | null = null;

  constructor(private readonly s = SEGUIMIENTO) {}

  /** Empieza a seguir a esta persona. Devuelve false si no se le ven los pies. */
  fijar(pose: Pose): boolean {
    this.ancla = anclaDe(pose);
    this.caja = cajaDe(pose);
    return this.ancla !== null;
  }

  soltar() {
    this.ancla = null;
    this.caja = null;
  }

  /**
   * Una pose que no pasó la validación: ¿falla del detector (está donde estaba la
   * persona seguida) u otra persona (está en otro lado)?
   */
  clasificar(pose: Pose): 'falla' | 'otra' {
    const c = cajaDe(pose);
    if (!c || !this.caja) return 'falla';
    // Comparten la mayor parte del lugar: es la misma persona mal detectada.
    return solape(this.caja, c) >= 0.5 || solape(c, this.caja) >= 0.5 ? 'falla' : 'otra';
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
      this.caja = cajaDe(mejor) ?? this.caja;
    }
    return mejor;
  }
}
