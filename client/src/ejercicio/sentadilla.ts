import { angulo, GRADOS, medio, P, visible, type Lado, type Pose, type Punto } from './puntos';

/**
 * Sentadilla libre: cuenta repeticiones y dice cuáles estuvieron bien hechas.
 *
 * Cada cuadro de la cámara se convierte en unas pocas medidas (`medirSentadilla`):
 * el ángulo de la rodilla, cuánto baja el muslo, cuánto se inclina el torso y,
 * de frente, si las rodillas se van hacia adentro. El contador (`ContadorSentadilla`)
 * sigue la rodilla: de pie → baja → sube → de pie es una repetición, y al
 * terminarla la evalúa con lo peor que pasó en ella.
 *
 * Todo es lógica pura (sin cámara ni detector): se prueba con poses sintéticas.
 *
 * Los talones NO se revisan: con el detector real, en el fondo de una sentadilla
 * profunda el punto del talón "sube" ~8 cm aunque el pie esté apoyado (la
 * pantorrilla tapa el pie), y marcaría mal las repeticiones bien hechas.
 */

export const UMBRALES = {
  /** Rodilla (grados) desde la que se considera que está de pie. */
  arriba: 160,
  /** Rodilla por debajo de la cual empezó a bajar. */
  inicio: 150,
  /** Si la rodilla no bajó de aquí, fue un acomodo y no una repetición. */
  minimaRepeticion: 135,
  /** Una repetición dura al menos esto (s): menos es ruido del detector. */
  duracionMinima: 0.5,
  /** Profundidad: el muslo llega a ≤ 15° sobre la horizontal (paralelo al piso)... */
  muslo: 15,
  /** ...o la rodilla se cierra hasta ≤ 85°. */
  rodillaProfunda: 85,
  /** Torso: más de 60° desde la vertical es "el pecho se cae". */
  torso: 60,
  /** De frente: separación de rodillas / separación de tobillos por debajo de esto = rodillas hacia adentro. */
  apertura: 0.75,
  /** Bajada más rápida que esto (s): se sugiere bajar con control (no la marca como mala). */
  bajadaRapida: 0.6,
  /** Si se pierde a la persona en medio de una repetición más de esto (s), se descarta. */
  perdidaMaxima: 1.5,
};

/** Suavizado de las medidas entre cuadros (media móvil exponencial). */
const SUAVIZADO = 0.6;

export type Vista = 'perfil' | 'frente';

export interface Cuadro {
  vista: Vista;
  /** Ángulo de la rodilla (180 = estirada). */
  rodilla: number;
  /** Inclinación del muslo sobre la horizontal: 90 de pie, 0 paralelo, negativo por debajo. */
  muslo: number;
  /** Inclinación del torso desde la vertical. */
  torso: number;
  /** De frente: separación de las rodillas / separación de los tobillos. */
  apertura: number | null;
}

export type Lectura = { tipo: 'ok'; cuadro: Cuadro } | { tipo: 'incompleto'; motivo: string };

const dentro = (p: Punto) => p.x > -0.02 && p.x < 1.02 && p.y > -0.02 && p.y < 1.02;
const resta = (a: Punto, b: Punto) => [a.x - b.x, a.y - b.y, a.z - b.z];
const norma = (v: number[]) => Math.hypot(v[0], v[1], v[2]);
const punto = (v: number[]) => (u: number[]) => v[0] * u[0] + v[1] * u[1] + v[2] * u[2];

/** Vertical "hacia arriba" por defecto (y del detector va hacia abajo). */
export const ARRIBA: [number, number, number] = [0, -1, 0];

/**
 * El eje del cuerpo de pie (de los tobillos a los hombros, en metros): sirve de
 * vertical aunque el celular quede un poco torcido en el soporte.
 */
export function ejeDePie(pose: Pose): [number, number, number] | null {
  const m = pose.mundo;
  if (!m?.length) return null;
  const pies = medio(m[P.tobillo.izq], m[P.tobillo.der]);
  const hombros = medio(m[P.hombro.izq], m[P.hombro.der]);
  const v = resta(hombros, pies);
  const n = norma(v);
  if (n < 0.5) return null;
  return [v[0] / n, v[1] / n, v[2] / n];
}

/** Medidas de un cuadro, o por qué no se puede medir (la persona no se ve entera). */
export function medirSentadilla(pose: Pose | null, arriba: readonly number[] = ARRIBA): Lectura {
  if (!pose || !pose.imagen?.length || !pose.mundo?.length) return { tipo: 'incompleto', motivo: 'No te veo: ponte frente a la cámara.' };
  const im = pose.imagen;
  const mu = pose.mundo;
  // El lado que mejor se ve (de perfil, la pierna de atrás queda tapada).
  const puntaje = (l: Lado) => (im[P.cadera[l]].visibility ?? 1) + (im[P.rodilla[l]].visibility ?? 1) + (im[P.tobillo[l]].visibility ?? 1);
  const lado: Lado = puntaje('izq') >= puntaje('der') ? 'izq' : 'der';
  const clave = [P.hombro[lado], P.cadera[lado], P.rodilla[lado], P.tobillo[lado]];
  if (!visible(im[P.tobillo[lado]]) || !dentro(im[P.tobillo[lado]])) return { tipo: 'incompleto', motivo: 'No se ven los pies: aléjate un poco o baja el celular.' };
  if (!dentro(im[P.nariz]) || !dentro(im[P.hombro[lado]])) return { tipo: 'incompleto', motivo: 'No se ve la cabeza: aléjate un poco o sube el celular.' };
  if (!clave.every((i) => visible(im[i]))) return { tipo: 'incompleto', motivo: 'No te veo bien: ponte de lado, con el cuerpo entero en la imagen.' };

  // De frente los hombros se ven anchos; de perfil, casi uno encima del otro.
  const px = (p: Punto) => [p.x * pose.aspecto, p.y];
  const hi = px(im[P.hombro.izq]);
  const hd = px(im[P.hombro.der]);
  const ci = px(im[P.cadera.izq]);
  const cd = px(im[P.cadera.der]);
  const anchoHombros = Math.abs(hi[0] - hd[0]);
  const altoTorso = Math.abs((hi[1] + hd[1]) / 2 - (ci[1] + cd[1]) / 2) || 1e-6;
  const ambosHombros = visible(im[P.hombro.izq], 0.3) && visible(im[P.hombro.der], 0.3);
  const vista: Vista = ambosHombros && anchoHombros / altoTorso > 0.45 ? 'frente' : 'perfil';

  const arr = punto(arriba as number[]);
  const piernas: Lado[] = vista === 'frente' ? ['izq', 'der'] : [lado];
  let rodilla = 0;
  let muslo = 0;
  for (const l of piernas) {
    rodilla += angulo(mu[P.cadera[l]], mu[P.rodilla[l]], mu[P.tobillo[l]]) / piernas.length;
    const femur = resta(mu[P.cadera[l]], mu[P.rodilla[l]]);
    muslo += (Math.asin(Math.max(-1, Math.min(1, arr(femur) / (norma(femur) || 1)))) * GRADOS) / piernas.length;
  }
  const tronco = resta(medio(mu[P.hombro.izq], mu[P.hombro.der]), medio(mu[P.cadera.izq], mu[P.cadera.der]));
  const torso = Math.acos(Math.max(-1, Math.min(1, arr(tronco) / (norma(tronco) || 1)))) * GRADOS;

  let apertura: number | null = null;
  if (vista === 'frente') {
    const tobillos = Math.abs(mu[P.tobillo.izq].x - mu[P.tobillo.der].x);
    if (tobillos > 0.08) apertura = Math.abs(mu[P.rodilla.izq].x - mu[P.rodilla.der].x) / tobillos;
  }
  return { tipo: 'ok', cuadro: { vista, rodilla, muslo, torso, apertura } };
}

/* -------------------------------------------------------------- Contador */

export type Falla = 'profundidad' | 'torso' | 'rodillas';
export type Nota = 'rapido';

export interface Repeticion {
  numero: number;
  buena: boolean;
  fallas: Falla[];
  notas: Nota[];
  vista: Vista;
  /** Lo más bajo que llegó el muslo (grados sobre la horizontal). */
  musloMin: number;
  rodillaMin: number;
  torsoMax: number;
  aperturaMin: number | null;
  /** Segundos de bajada y de subida. */
  bajada: number;
  subida: number;
}

export type Fase = 'arriba' | 'bajando' | 'subiendo';

interface EnCurso {
  inicio: number;
  fondo: number;
  vista: Vista;
  rodillaMin: number;
  musloMin: number;
  torsoMax: number;
  aperturaMin: number | null;
}

export class ContadorSentadilla {
  readonly repeticiones: Repeticion[] = [];
  fase: Fase = 'arriba';
  /** Última medida suavizada (para mostrar en vivo). */
  actual: Cuadro | null = null;
  private enCurso: EnCurso | null = null;
  private perdidaDesde: number | null = null;
  /** Solo se empieza a contar después de verla de pie (al principio y si se perdió en medio de una). */
  private dePie = false;

  constructor(private readonly u = UMBRALES) {}

  /** Procesa un cuadro (t en segundos). Devuelve la repetición si con este cuadro terminó una. */
  procesar(lectura: Lectura, t: number): Repeticion | null {
    if (lectura.tipo !== 'ok') {
      // Sin persona a la vista: si dura mucho en medio de una repetición, se descarta.
      if (this.enCurso) {
        this.perdidaDesde ??= t;
        if (t - this.perdidaDesde > this.u.perdidaMaxima) this.reiniciar();
      }
      return null;
    }
    this.perdidaDesde = null;
    const c = this.suavizar(lectura.cuadro);
    this.actual = c;

    if (this.fase === 'arriba') {
      if (c.rodilla >= this.u.arriba) this.dePie = true;
      if (!this.dePie) return null;
      if (c.rodilla < this.u.inicio) {
        this.fase = 'bajando';
        this.enCurso = { inicio: t, fondo: t, vista: c.vista, rodillaMin: c.rodilla, musloMin: c.muslo, torsoMax: c.torso, aperturaMin: null };
      }
      return null;
    }

    const r = this.enCurso!;
    if (c.rodilla < r.rodillaMin) {
      r.rodillaMin = c.rodilla;
      r.fondo = t;
    }
    r.musloMin = Math.min(r.musloMin, c.muslo);
    r.torsoMax = Math.max(r.torsoMax, c.torso);
    // Las rodillas se miran en la parte baja, que es donde se cierran.
    const abajo = c.rodilla < (this.u.inicio + this.u.minimaRepeticion) / 2;
    if (abajo && c.apertura !== null) r.aperturaMin = Math.min(r.aperturaMin ?? Infinity, c.apertura);
    if (this.fase === 'bajando' && c.rodilla > r.rodillaMin + 10) this.fase = 'subiendo';

    if (c.rodilla >= this.u.arriba) {
      this.fase = 'arriba';
      this.enCurso = null;
      if (r.rodillaMin > this.u.minimaRepeticion || t - r.inicio < this.u.duracionMinima) return null;
      const rep = this.evaluar(r, t);
      this.repeticiones.push(rep);
      return rep;
    }
    return null;
  }

  private evaluar(r: EnCurso, fin: number): Repeticion {
    const u = this.u;
    const fallas: Falla[] = [];
    if (r.musloMin > u.muslo && r.rodillaMin > u.rodillaProfunda) fallas.push('profundidad');
    if (r.torsoMax > u.torso) fallas.push('torso');
    if (r.vista === 'frente' && r.aperturaMin !== null && r.aperturaMin < u.apertura) fallas.push('rodillas');
    const bajada = r.fondo - r.inicio;
    const notas: Nota[] = bajada < u.bajadaRapida ? ['rapido'] : [];
    return {
      numero: this.repeticiones.length + 1,
      buena: fallas.length === 0,
      fallas,
      notas,
      vista: r.vista,
      musloMin: r.musloMin,
      rodillaMin: r.rodillaMin,
      torsoMax: r.torsoMax,
      aperturaMin: r.aperturaMin,
      bajada,
      subida: fin - r.fondo,
    };
  }

  private suavizar(c: Cuadro): Cuadro {
    const a = this.actual;
    if (!a || a.vista !== c.vista) return c;
    const m = (x: number, y: number) => y + SUAVIZADO * (x - y);
    const apertura = c.apertura === null ? null : a.apertura === null ? c.apertura : m(c.apertura, a.apertura);
    return { vista: c.vista, rodilla: m(c.rodilla, a.rodilla), muslo: m(c.muslo, a.muslo), torso: m(c.torso, a.torso), apertura };
  }

  private reiniciar() {
    this.fase = 'arriba';
    this.dePie = false;
    this.enCurso = null;
    this.actual = null;
  }

  /** Cuánto le falta a la bajada en curso para llegar a buena profundidad (0 de pie, 1 ya llegó). */
  profundidad(): number {
    if (!this.actual) return 0;
    return Math.max(0, Math.min(1, (90 - this.actual.muslo) / (90 - this.u.muslo)));
  }
}

/* -------------------------------------------------------------- Resumen */

export const ETIQUETA_FALLA: Record<Falla, string> = {
  profundidad: 'Poca profundidad',
  torso: 'Torso muy inclinado',
  rodillas: 'Rodillas hacia adentro',
};

/** Lo que dice la voz cuando una repetición sale mal. */
export const VOZ_FALLA: Record<Falla, string> = {
  profundidad: 'más abajo',
  torso: 'pecho arriba',
  rodillas: 'rodillas afuera',
};

export const CONSEJO: Record<Falla | Nota, string> = {
  profundidad:
    'Baja más: lleva la cadera hasta la altura de las rodillas, con los muslos paralelos al piso. Si no llegas con este peso, bájalo un poco o trabaja la movilidad de tobillos y cadera.',
  torso:
    'Mantén el pecho arriba: el torso se fue muy adelante. Toma aire y aprieta el abdomen antes de bajar, mira al frente y empuja el piso con todo el pie.',
  rodillas:
    'Empuja las rodillas hacia afuera, en la misma línea de la punta de los pies: se están cerrando hacia adentro. Si pasa con este peso, bájalo y haz la subida más lenta.',
  rapido: 'Baja más despacio y con control, en unos 2 segundos, sin dejarte caer.',
};

export interface Resumen {
  total: number;
  buenas: number;
  malas: number;
  fallas: Partial<Record<Falla, number>>;
  consejos: string[];
}

export function resumir(reps: readonly Repeticion[]): Resumen {
  const total = reps.length;
  const buenas = reps.filter((r) => r.buena).length;
  const fallas: Partial<Record<Falla, number>> = {};
  for (const r of reps) for (const f of r.fallas) fallas[f] = (fallas[f] ?? 0) + 1;
  const consejos: string[] = [];
  if (total === 0) {
    consejos.push('No se contó ninguna repetición. Revisa que se vea tu cuerpo entero, de los pies a la cabeza, y que bajes hasta doblar bien las rodillas.');
  } else {
    // Primero lo que más se repitió (como mucho dos consejos: más es difícil de recordar en la serie).
    const orden = (Object.entries(fallas) as [Falla, number][]).sort((a, b) => b[1] - a[1]);
    for (const [f] of orden.slice(0, 2)) consejos.push(CONSEJO[f]);
    const rapidas = reps.filter((r) => r.notas.includes('rapido')).length;
    if (consejos.length < 2 && rapidas >= Math.max(2, total / 3)) consejos.push(CONSEJO.rapido);
    if (orden.length === 0) {
      consejos.unshift('¡Muy bien! Todas con buena profundidad y buena postura. Si se sintieron fáciles, súbele un poco de peso en la próxima serie.');
    }
  }
  return { total, buenas, malas: total - buenas, fallas, consejos };
}
