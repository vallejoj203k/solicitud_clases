import { angulo, GRADOS, medio, P, visible, type Lado, type Pose, type Punto } from './puntos';

/**
 * Sentadilla libre: cuenta repeticiones y dice cuáles estuvieron bien hechas.
 *
 * Se puede filmar de perfil o de frente. Cada cuadro de la cámara se convierte en
 * unas pocas medidas (`medirSentadilla`): cuánto baja el muslo, cuánto se inclina
 * el torso y, de frente, si las rodillas se van hacia adentro. El contador
 * (`ContadorSentadilla`) sigue el muslo: de pie → baja → sube → de pie es una
 * repetición, y al terminarla la evalúa con lo peor que pasó en ella.
 *
 * Todo es lógica pura (sin cámara ni detector): se prueba con poses sintéticas.
 *
 * Los talones NO se revisan: con el detector real, en el fondo de una sentadilla
 * profunda el punto del talón "sube" ~8 cm aunque el pie esté apoyado (la
 * pantorrilla tapa el pie), y marcaría mal las repeticiones bien hechas.
 */

export const UMBRALES = {
  /**
   * Las fases salen del muslo (grados sobre la horizontal: ~85-90 de pie, 0 en
   * el paralelo), que se mide igual de perfil y de frente. De pie: muslo ≥ 75.
   */
  arriba: 75,
  /** Muslo por debajo del cual empezó a bajar. */
  inicio: 72,
  /**
   * Si el muslo no bajó de aquí, fue un acomodo y no una repetición. Alto a
   * propósito (equivale a doblar la rodilla a ~150°): una media sentadilla o un
   * cuarto de sentadilla SÍ cuentan (como mal hechas por profundidad); solo se
   * ignora doblar apenas las rodillas.
   */
  minimaRepeticion: 65,
  /** Una repetición dura al menos esto (s): menos es ruido del detector. */
  duracionMinima: 0.5,
  /**
   * Profundidad: el muslo tiene que llegar a ≤ 10° sobre la horizontal (cadera a
   * la altura de la rodilla). Solo el muslo: la rodilla puede cerrarse mucho con
   * la cadera alta si las rodillas se van adelante.
   */
  muslo: 10,
  /** Torso: más de 60° desde la vertical es "el pecho se cae". */
  torso: 60,
  /** De frente: separación de rodillas / separación de tobillos por debajo de esto = rodillas hacia adentro. */
  apertura: 0.75,
  /** Bajada más rápida que esto (s): se sugiere bajar con control (no la marca como mala). */
  bajadaRapida: 0.6,
  /** Si se pierde a la persona en medio de una repetición más de esto (s), esa repetición no se pudo ver bien. */
  perdidaMaxima: 1.5,
  /** Si se pierde más de esto (s), se fue: la repetición en curso se descarta. */
  abandono: 6,
};

/** Suavizado de las medidas entre cuadros (media móvil exponencial). */
const SUAVIZADO = 0.6;

export type Vista = 'perfil' | 'frente';

export interface Cuadro {
  vista: Vista;
  /** Ángulo de la rodilla (180 = estirada). De frente es aproximado (puntos 3D): solo informativo. */
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
const norma = (v: number[]) => Math.hypot(...v);
const escalar = (v: number[], u: readonly number[]) => v.reduce((s, x, i) => s + x * u[i], 0);
const grados = (x: number) => x * GRADOS;
const recortar = (x: number) => Math.max(-1, Math.min(1, x));

/**
 * La vertical "hacia arriba", en los puntos en metros (3D) y en la imagen (2D,
 * con el ancho corregido por la proporción del video). y va hacia abajo.
 */
export interface Ejes {
  mundo: readonly number[];
  imagen: readonly number[];
  /**
   * Largos de pie, en la imagen: el muslo (cadera → rodilla) y el torso (caderas →
   * hombros). De pie los dos quedan verticales, de perfil y de frente. De frente,
   * cuánto se acorta cada uno en la vertical dice cuánto se inclinó hacia la
   * cámara. 0 si no se midieron.
   */
  muslo: number;
  torso: number;
}
export const ARRIBA: Ejes = { mundo: [0, -1, 0], imagen: [0, -1], muslo: 0, torso: 0 };

/** Punto de la imagen en unidades iguales en x e y (x por la proporción del video). */
const enImagen = (pose: Pose, i: number) => [pose.imagen[i].x * pose.aspecto, pose.imagen[i].y];

/**
 * El eje del cuerpo de pie (de los tobillos a los hombros): sirve de vertical
 * aunque el celular quede un poco torcido en el soporte.
 */
export function ejeDePie(pose: Pose): Ejes | null {
  const m = pose.mundo;
  if (!m?.length || !pose.imagen?.length) return null;
  const v = resta(medio(m[P.hombro.izq], m[P.hombro.der]), medio(m[P.tobillo.izq], m[P.tobillo.der]));
  const n = norma(v);
  const pie = [P.tobillo.izq, P.tobillo.der].map((i) => enImagen(pose, i));
  const hom = [P.hombro.izq, P.hombro.der].map((i) => enImagen(pose, i));
  const w = [(hom[0][0] + hom[1][0] - pie[0][0] - pie[1][0]) / 2, (hom[0][1] + hom[1][1] - pie[0][1] - pie[1][1]) / 2];
  const nw = norma(w);
  if (n < 0.5 || nw < 0.1) return null;
  const arriba = w.map((x) => x / nw);
  // Muslo: el promedio de las piernas que se ven bien; torso: entre los puntos medios.
  const piernas = (['izq', 'der'] as Lado[]).filter((l) => visible(pose.imagen[P.cadera[l]]) && visible(pose.imagen[P.rodilla[l]]));
  const muslo = piernas.length
    ? piernas.reduce((s, l) => s + escalar(dif(enImagen(pose, P.cadera[l]), enImagen(pose, P.rodilla[l])), arriba), 0) / piernas.length
    : 0;
  const torso = escalar(dif(mitad(pose, P.hombro.izq, P.hombro.der), mitad(pose, P.cadera.izq, P.cadera.der)), arriba);
  return { mundo: v.map((x) => x / n), imagen: arriba, muslo: Math.max(0, muslo), torso: Math.max(0, torso) };
}

const dif = (a: number[], b: number[]) => [a[0] - b[0], a[1] - b[1]];
const mitad = (pose: Pose, i: number, j: number) => {
  const a = enImagen(pose, i);
  const b = enImagen(pose, j);
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
};

/** Promedio de varios ejes (los cuadros de pie al preparar). */
export function promedioEjes(ejes: Ejes[]): Ejes {
  const suma = (k: 'mundo' | 'imagen') => {
    const s = ejes.reduce((a, e) => a.map((x, i) => x + e[k][i]), ejes[0][k].map(() => 0));
    const n = norma(s) || 1;
    return s.map((x) => x / n);
  };
  const media = (k: 'muslo' | 'torso') => ejes.reduce((s, e) => s + e[k], 0) / ejes.length;
  return ejes.length ? { mundo: suma('mundo'), imagen: suma('imagen'), muslo: media('muslo'), torso: media('torso') } : ARRIBA;
}

/** Ángulo (grados) del segmento a→b sobre la horizontal, según la vertical `arriba`. */
const sobreHorizontal = (v: number[], arriba: readonly number[]) => grados(Math.asin(recortar(escalar(v, arriba) / (norma(v) || 1))));
/** Ángulo (grados) del segmento a→b desde la vertical. */
const desdeVertical = (v: number[], arriba: readonly number[]) => grados(Math.acos(recortar(escalar(v, arriba) / (norma(v) || 1))));
/** Ángulo (grados) en b entre b→a y b→c, en 2D. */
function angulo2d(a: number[], b: number[], c: number[]) {
  const u = [a[0] - b[0], a[1] - b[1]];
  const v = [c[0] - b[0], c[1] - b[1]];
  return grados(Math.acos(recortar(escalar(u, v) / ((norma(u) * norma(v)) || 1))));
}

/**
 * Medidas de un cuadro, o por qué no se puede medir. Para la sentadilla basta ver
 * hombro, cadera, rodilla y tobillo (de un lado de perfil, de los dos de frente):
 * la cabeza puede quedar fuera.
 *
 * Todo sale de la imagen, que es mucho más exacta que la profundidad 3D que
 * estima el detector:
 * - De perfil, la pierna y el torso quedan en el plano de la foto: los ángulos se
 *   miden directo.
 * - De frente, el muslo y el torso se inclinan hacia la cámara y se ven más
 *   cortos. La profundidad sale de la altura de la cadera respecto a la rodilla
 *   (con el celular a la altura de la rodilla, en el paralelo están a la misma
 *   altura), en proporción al largo del muslo de pie; la inclinación del torso,
 *   de cuánto se acortó. Y las rodillas se comparan con los tobillos.
 */
export function medirSentadilla(pose: Pose | null, ejes: Ejes = ARRIBA): Lectura {
  if (!pose || !pose.imagen?.length || !pose.mundo?.length) return { tipo: 'incompleto', motivo: 'No te veo: párate frente al celular.' };
  const im = pose.imagen;
  const mu = pose.mundo;
  // El lado que mejor se ve (de perfil, la pierna de atrás queda tapada).
  const puntaje = (l: Lado) => (im[P.cadera[l]].visibility ?? 1) + (im[P.rodilla[l]].visibility ?? 1) + (im[P.tobillo[l]].visibility ?? 1);
  const lado: Lado = puntaje('izq') >= puntaje('der') ? 'izq' : 'der';
  const clave = [P.hombro[lado], P.cadera[lado], P.rodilla[lado], P.tobillo[lado]];
  if (!visible(im[P.tobillo[lado]]) || !dentro(im[P.tobillo[lado]])) return { tipo: 'incompleto', motivo: 'No se ven los pies: aléjate un paso o inclina el celular hacia abajo.' };
  if (!dentro(im[P.hombro[lado]])) return { tipo: 'incompleto', motivo: 'No se ven los hombros: aléjate un paso o inclina el celular hacia arriba.' };
  if (!clave.every((i) => visible(im[i]))) return { tipo: 'incompleto', motivo: 'No te veo bien: que se vea tu cuerpo entero en la imagen.' };

  // De frente los hombros se ven anchos; de perfil, casi uno encima del otro.
  const hi = enImagen(pose, P.hombro.izq);
  const hd = enImagen(pose, P.hombro.der);
  const ci = enImagen(pose, P.cadera.izq);
  const cd = enImagen(pose, P.cadera.der);
  const anchoHombros = Math.abs(hi[0] - hd[0]);
  const altoTorso = Math.abs((hi[1] + hd[1]) / 2 - (ci[1] + cd[1]) / 2) || 1e-6;
  const ambosHombros = visible(im[P.hombro.izq], 0.3) && visible(im[P.hombro.der], 0.3);
  const vista: Vista = ambosHombros && anchoHombros / altoTorso > 0.45 ? 'frente' : 'perfil';

  if (vista === 'perfil') {
    const [h, c, r, t] = clave.map((i) => enImagen(pose, i));
    const femur = [c[0] - r[0], c[1] - r[1]];
    const tronco = [h[0] - c[0], h[1] - c[1]];
    return {
      tipo: 'ok',
      cuadro: { vista, rodilla: angulo2d(c, r, t), muslo: sobreHorizontal(femur, ejes.imagen), torso: desdeVertical(tronco, ejes.imagen), apertura: null },
    };
  }

  // De frente hacen falta las dos piernas.
  const otro: Lado = lado === 'izq' ? 'der' : 'izq';
  if (![P.cadera[otro], P.rodilla[otro], P.tobillo[otro]].every((i) => visible(im[i]) && dentro(im[i]))) {
    return { tipo: 'incompleto', motivo: 'No se ven bien las dos piernas: que se vea tu cuerpo entero en la imagen.' };
  }
  const arriba = ejes.imagen;
  const lateral = [-arriba[1], arriba[0]];
  let rodilla = 0;
  let muslo = 0;
  for (const l of ['izq', 'der'] as Lado[]) {
    rodilla += angulo(mu[P.cadera[l]], mu[P.rodilla[l]], mu[P.tobillo[l]]) / 2;
    muslo +=
      (ejes.muslo > 0
        ? grados(Math.asin(recortar(escalar(dif(enImagen(pose, P.cadera[l]), enImagen(pose, P.rodilla[l])), arriba) / ejes.muslo)))
        : sobreHorizontal(resta(mu[P.cadera[l]], mu[P.rodilla[l]]), ejes.mundo)) / 2;
  }
  const alto = escalar(dif(mitad(pose, P.hombro.izq, P.hombro.der), mitad(pose, P.cadera.izq, P.cadera.der)), arriba);
  const torso =
    ejes.torso > 0
      ? grados(Math.acos(recortar(alto / ejes.torso)))
      : desdeVertical(resta(medio(mu[P.hombro.izq], mu[P.hombro.der]), medio(mu[P.cadera.izq], mu[P.cadera.der])), ejes.mundo);
  const separacion = (i: number, j: number) => Math.abs(escalar(dif(enImagen(pose, i), enImagen(pose, j)), lateral));
  const tobillos = separacion(P.tobillo.izq, P.tobillo.der);
  const apertura = tobillos > 0.02 ? separacion(P.rodilla.izq, P.rodilla.der) / tobillos : null;
  return { tipo: 'ok', cuadro: { vista, rodilla, muslo, torso, apertura } };
}

/* -------------------------------------------------------------- Contador */

export type Falla = 'profundidad' | 'torso' | 'rodillas' | 'fuera';
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
  /** Se dejó de ver a la persona un rato largo en medio de la repetición. */
  sinVer: boolean;
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
      // Sin persona a la vista en medio de una repetición: se sigue esperando (la
      // repetición cuenta al volver a verla de pie, marcada como "no se vio
      // completa" si fue mucho rato); si no vuelve, se descarta.
      if (this.enCurso) {
        this.perdidaDesde ??= t;
        const perdida = t - this.perdidaDesde;
        if (perdida > this.u.perdidaMaxima) this.enCurso.sinVer = true;
        if (perdida > this.u.abandono) this.reiniciar();
      }
      return null;
    }
    this.perdidaDesde = null;
    const c = this.suavizar(lectura.cuadro);
    this.actual = c;

    if (this.fase === 'arriba') {
      if (c.muslo >= this.u.arriba) this.dePie = true;
      if (!this.dePie) return null;
      if (c.muslo < this.u.inicio) {
        this.fase = 'bajando';
        this.enCurso = { inicio: t, fondo: t, vista: c.vista, rodillaMin: c.rodilla, musloMin: c.muslo, torsoMax: c.torso, aperturaMin: null, sinVer: false };
      }
      return null;
    }

    const r = this.enCurso!;
    if (c.muslo < r.musloMin) {
      r.musloMin = c.muslo;
      r.fondo = t;
    }
    r.rodillaMin = Math.min(r.rodillaMin, c.rodilla);
    r.torsoMax = Math.max(r.torsoMax, c.torso);
    // Las rodillas se miran en la parte baja, que es donde se cierran.
    const abajo = c.muslo < (this.u.inicio + this.u.minimaRepeticion) / 2;
    if (abajo && c.apertura !== null) r.aperturaMin = Math.min(r.aperturaMin ?? Infinity, c.apertura);
    if (this.fase === 'bajando' && c.muslo > r.musloMin + 10) this.fase = 'subiendo';

    if (c.muslo >= this.u.arriba) {
      this.fase = 'arriba';
      this.enCurso = null;
      if (r.musloMin > this.u.minimaRepeticion || t - r.inicio < this.u.duracionMinima) return null;
      const rep = this.evaluar(r, t);
      this.repeticiones.push(rep);
      return rep;
    }
    return null;
  }

  private evaluar(r: EnCurso, fin: number): Repeticion {
    const u = this.u;
    const fallas: Falla[] = [];
    // Si se la dejó de ver un rato (alguien se cruzó), la profundidad vale si se la
    // vio llegar al paralelo; si no, no se sabe: "no se vio completa".
    if (r.musloMin > u.muslo) fallas.push(r.sinVer ? 'fuera' : 'profundidad');
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
  fuera: 'No se vio completa',
};

/** Lo que dice la voz cuando una repetición sale mal. */
export const VOZ_FALLA: Record<Falla, string> = {
  profundidad: 'más abajo',
  torso: 'pecho arriba',
  rodillas: 'rodillas afuera',
  fuera: 'no te vi',
};

export const CONSEJO: Record<Falla | Nota, string> = {
  profundidad:
    'Baja más: lleva la cadera hasta la altura de las rodillas, con los muslos paralelos al piso. Si no llegas con este peso, bájalo un poco o trabaja la movilidad de tobillos y cadera.',
  torso:
    'Mantén el pecho arriba: el torso se fue muy adelante. Toma aire y aprieta el abdomen antes de bajar, mira al frente y empuja el piso con todo el pie.',
  rodillas:
    'Empuja las rodillas hacia afuera, en la misma línea de la punta de los pies: se están cerrando hacia adentro. Si pasa con este peso, bájalo y haz la subida más lenta.',
  fuera:
    'En algunas repeticiones no se te veía entero, de los hombros a los pies, y no se pudieron revisar. Aléjate un paso, o usa la cámara de atrás del celular, que ve más ancho.',
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
