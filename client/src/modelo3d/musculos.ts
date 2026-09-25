import { Color } from 'three';
import { normalesVertice, type Indices, type Vec3 } from './geometria';
import type { CuerpoBase } from './tipos';

/**
 * Músculos pintados sobre el cuerpo sin grasa (vista "grasa y músculo"). Van
 * debajo de los músculos anatómicos (musculosAnatomicos.ts): cubren manos, pies,
 * cabeza y los huecos entre músculos, y son lo que se ve mientras aquellos
 * bajan. Como en una lámina de anatomía: cada vértice de la malla base se
 * asigna a un músculo con reglas geométricas (segmento, altura respecto de las
 * bandas de medida, posición a lo largo de brazo o pierna y hacia dónde mira la
 * superficie). La asignación se hace una vez sobre la malla base y sigue a los
 * morphs, porque es por vértice.
 *
 * El shader dibuja con eso el color de cada músculo, un surco fino entre
 * músculos (y entre los "cuadros" del recto abdominal), un relieve más claro
 * hacia el centro y estrías en la dirección de las fibras.
 *
 * No son modelos anatómicos: es una aproximación visual sobre la malla de
 * MakeHuman (todo CC0).
 */

export interface Grupo {
  nombre: string;
  /** false: tejido sin músculo marcado (tendón, hueso, cara, manos, pies). */
  musculo: boolean;
  color: string;
}

export const GRUPOS: Grupo[] = [
  { nombre: 'Tendón y hueso', musculo: false, color: '#D8B7A0' },
  { nombre: 'Cabeza', musculo: false, color: '#C99A86' },
  { nombre: 'Pubis', musculo: false, color: '#A9826F' },
  // Dos tonos que se alternan entre músculos vecinos, para que se distingan.
  { nombre: 'Esternocleidomastoideo', musculo: true, color: '#B9483E' },
  { nombre: 'Trapecio', musculo: true, color: '#9C3730' },
  { nombre: 'Pectoral mayor', musculo: true, color: '#BD4A40' },
  { nombre: 'Deltoides', musculo: true, color: '#9A362F' },
  { nombre: 'Bíceps', musculo: true, color: '#BD4A40' },
  { nombre: 'Tríceps', musculo: true, color: '#9C3730' },
  { nombre: 'Flexores del antebrazo', musculo: true, color: '#B8473E' },
  { nombre: 'Extensores del antebrazo', musculo: true, color: '#983530' },
  { nombre: 'Recto abdominal', musculo: true, color: '#BF4C42' },
  { nombre: 'Oblicuos', musculo: true, color: '#9E3831' },
  { nombre: 'Serrato anterior', musculo: true, color: '#B6463D' },
  { nombre: 'Dorsal ancho', musculo: true, color: '#A53B33' },
  { nombre: 'Infraespinoso y redondo', musculo: true, color: '#BB4940' },
  { nombre: 'Lumbares', musculo: true, color: '#933330' },
  { nombre: 'Glúteos', musculo: true, color: '#AE4038' },
  { nombre: 'Cuádriceps', musculo: true, color: '#BD4A40' },
  { nombre: 'Isquiotibiales', musculo: true, color: '#9C3730' },
  { nombre: 'Aductores', musculo: true, color: '#A63C34' },
  { nombre: 'Gemelos', musculo: true, color: '#BB4940' },
  { nombre: 'Sóleo', musculo: true, color: '#983530' },
  { nombre: 'Tibial anterior', musculo: true, color: '#B8473E' },
  { nombre: 'Peroneos', musculo: true, color: '#9C3730' },
];

const G = Object.fromEntries(GRUPOS.map((g, i) => [g.nombre, i])) as Record<string, number>;

/** Vecinos de cada vértice (sin repetir). */
function vecinosDe(tris: ArrayLike<number>, n: number) {
  const vecinos: number[][] = Array.from({ length: n }, () => []);
  for (let t = 0; t < tris.length; t += 3) {
    for (let k = 0; k < 3; k++) {
      const a = tris[t + k];
      const b = tris[t + ((k + 1) % 3)];
      if (!vecinos[a].includes(b)) vecinos[a].push(b);
      if (!vecinos[b].includes(a)) vecinos[b].push(a);
    }
  }
  return vecinos;
}

/**
 * Normales de la malla alisada (Laplaciano): las reglas miran hacia dónde da la
 * superficie, y con las normales crudas cada arruga de la malla movía el borde.
 */
function normalesSuaves(pos: Float32Array, tris: Indices, vecinos: number[][], iteraciones: number) {
  let p = pos.slice();
  let q = new Float32Array(pos.length);
  for (let it = 0; it < iteraciones; it++) {
    for (let v = 0; v < vecinos.length; v++) {
      const vs = vecinos[v];
      let x = 0;
      let y = 0;
      let z = 0;
      for (const w of vs) {
        x += p[w * 3];
        y += p[w * 3 + 1];
        z += p[w * 3 + 2];
      }
      const k = vs.length || 1;
      q[v * 3] = (p[v * 3] + x / k) / 2;
      q[v * 3 + 1] = (p[v * 3 + 1] + y / k) / 2;
      q[v * 3 + 2] = (p[v * 3 + 2] + z / k) / 2;
    }
    [p, q] = [q, p];
  }
  return normalesVertice(p, tris);
}

/** Una etiqueta: un músculo de un lado (o una fila del recto abdominal), o un tejido sin músculo. */
export interface Etiqueta {
  grupo: number;
  lado: number;
}

/**
 * Para el shader, la malla va sin indexar (cada triángulo con sus 3 esquinas),
 * en el orden de `indicesTriangulos`. Cada triángulo lleva hasta 3 etiquetas
 * candidatas y cada esquina el peso de cada una en ese vértice: por píxel gana
 * la de más peso y el surco va donde las dos primeras empatan. Como los pesos
 * son un campo suave (ver DIFUSION), el borde es una curva que corta los
 * triángulos, no una escalera por las aristas.
 */
export interface Musculos {
  etiquetas: Etiqueta[];
  /** Por esquina: las 3 etiquetas candidatas del triángulo (índices en `etiquetas`). */
  candidatas: Float32Array;
  /** Por esquina: peso de cada candidata en ese vértice (−1: ranura sin usar). */
  pesos: Float32Array;
  /**
   * Tabla por etiqueta (RGBA, `etiquetas.length` × 2): fila 0 color lineal y 1
   * si es músculo; fila 1 dirección perpendicular a las fibras (0 sin músculo).
   */
  tabla: Float32Array<ArrayBuffer>;
}

/** Pasadas de alisado de la malla para las normales que usan las reglas. */
const ITERACIONES_ALISADO = 12;
/**
 * Pasadas de difusión de las etiquetas: cada una mezcla un vértice con la media
 * de sus vecinos. Más pasadas, bordes más redondeados (y músculos chicos que se
 * pierden); ~6 quitan la escalera de aristas de ~12 mm.
 */
const DIFUSION = 6;

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: Vec3): Vec3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

/** Posición a lo largo del segmento a->b (0..1 sin recortar) y distancia a la recta. */
function aLoLargo(p: Vec3, a: Vec3, b: Vec3) {
  const ab = sub(b, a);
  const t = dot(sub(p, a), ab) / dot(ab, ab);
  const q: Vec3 = [a[0] + ab[0] * t, a[1] + ab[1] * t, a[2] + ab[2] * t];
  const tc = Math.min(1, Math.max(0, t));
  const qc: Vec3 = [a[0] + ab[0] * tc, a[1] + ab[1] * tc, a[2] + ab[2] * tc];
  return { t, dist: Math.hypot(...sub(p, qc)), eje: norm(ab), q };
}

/** Color hex (sRGB) -> rgb lineal, que es lo que three.js espera en los atributos de color. */
function hexARgb(h: string): Vec3 {
  const c = new Color(h);
  return [c.r, c.g, c.b];
}

export function clasificarMusculos(cuerpo: CuerpoBase): Musculos {
  const pos = cuerpo.posiciones;
  const tris = cuerpo.indicesTriangulos;
  const n = pos.length / 3;
  const vecinos = vecinosDe(tris, n);
  const nor = normalesSuaves(pos, tris, vecinos, ITERACIONES_ALISADO);
  const meta = cuerpo.meta;
  const art = (nombre: string): Vec3 => meta.articulaciones.base[meta.articulaciones.nombres.indexOf(nombre)] as Vec3;
  const alturaBanda = (lm: string) => {
    const vs = meta.landmarks[lm]?.vertices ?? [];
    return vs.reduce((s, v) => s + pos[v * 3 + 1], 0) / Math.max(1, vs.length);
  };
  const segNombre = (v: number) => meta.segmentos.nombres[cuerpo.segmentos[v]];

  const yClav = art('joint-l-clavicle')[1];
  const yBusto = alturaBanda('bajo_busto');
  const yOmbligo = alturaBanda('ombligo');
  const yCadera = alturaBanda('cadera');
  // La articulación "cabeza" de MakeHuman queda a la altura de la nariz: el
  // cuello termina más o menos a mitad de camino desde la base del cuello.
  const yMenton = (art('joint-neck')[1] + art('joint-head')[1]) / 2 + 0.01;
  const anchoHombro = Math.abs(art('joint-l-shoulder')[0]);
  // Horcajadura: el vértice más bajo de la línea media por encima del 30 % de la estatura.
  let yHorca = Infinity;
  let alto = 0;
  for (let v = 0; v < n; v++) alto = Math.max(alto, pos[v * 3 + 1]);
  for (let v = 0; v < n; v++)
    if (Math.abs(pos[v * 3]) < 0.004 && pos[v * 3 + 1] > 0.3 * alto) yHorca = Math.min(yHorca, pos[v * 3 + 1]);

  const grupo = new Uint8Array(n);
  const lado = new Uint8Array(n);
  /** Fila del recto abdominal (los "cuadros"): cada una es una etiqueta aparte. */
  const fila = new Uint8Array(n);
  /** Dirección de las fibras en cada vértice (antes de promediar por músculo). */
  const fibraCruda = new Float32Array(n * 3);

  for (let v = 0; v < n; v++) {
    const p: Vec3 = [pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]];
    const nv: Vec3 = [nor[v * 3], nor[v * 3 + 1], nor[v * 3 + 2]];
    const izq = p[0] >= 0;
    const s = izq ? 1 : -1; // hacia afuera en X
    lado[v] = izq ? 1 : 0;
    const L = izq ? 'l' : 'r';
    const seg = segNombre(v);
    const [x, y] = p;
    const afuera = nv[0] * s; // >0: la superficie mira hacia afuera del cuerpo
    let g = G['Tendón y hueso'];
    let dir: Vec3 | null = null;

    if (seg === 'cabeza') {
      if (y < yMenton) {
        // Cuello: esternocleidomastoideo adelante y a los lados, trapecio atrás.
        if (nv[2] < -0.3) {
          g = G.Trapecio;
          dir = [s * 0.4, -0.9, 0];
        } else {
          g = G['Esternocleidomastoideo'];
          dir = [-s * 0.35, -0.9, 0.3];
        }
      } else g = G.Cabeza;
    } else if (seg.startsWith('brazo')) {
      const hombro = art(`joint-${L}-shoulder`);
      const codo = art(`joint-${L}-elbow`);
      const mano = art(`joint-${L}-hand`);
      const arriba = aLoLargo(p, hombro, codo);
      const abajo = aLoLargo(p, codo, mano);
      if (abajo.t > 0.97)
        g = G['Tendón y hueso']; // mano
      else if (arriba.dist <= abajo.dist) {
        dir = arriba.eje;
        const adelante = norm(sub([0, 0, 1], arriba.eje.map((c) => c * arriba.eje[2]) as Vec3));
        if (arriba.t < 0.32) g = G.Deltoides;
        else g = dot(nv, adelante) > 0.05 ? G['Bíceps'] : G['Tríceps'];
      } else {
        dir = abajo.eje;
        const adelante = norm(sub([0, 0, 1], abajo.eje.map((c) => c * abajo.eje[2]) as Vec3));
        const haciaAfuera = dot(nv, adelante) * 0.5 + afuera;
        g =
          abajo.t < 0.06 ? G['Tendón y hueso'] : haciaAfuera > 0.15 ? G['Extensores del antebrazo'] : G['Flexores del antebrazo'];
      }
    } else if (seg.startsWith('pierna')) {
      const cadera = art(`joint-${L}-upper-leg`);
      const rodilla = art(`joint-${L}-knee`);
      const tobillo = art(`joint-${L}-ankle`);
      const muslo = aLoLargo(p, cadera, rodilla);
      const pierna = aLoLargo(p, rodilla, tobillo);
      if (y < tobillo[1] + 0.03)
        g = G['Tendón y hueso']; // pie
      else if (y > yHorca - 0.02 && nv[2] < -0.15) {
        g = G['Glúteos'];
        dir = [s * 0.8, -0.6, 0];
      } else if (muslo.dist <= pierna.dist && muslo.t < 1.02) {
        dir = muslo.eje;
        const adentro = -afuera;
        if (muslo.t > 0.95 && nv[2] > 0.7)
          g = G['Tendón y hueso']; // rótula
        else if (adentro > 0.45 && muslo.t < 0.75) g = G.Aductores;
        else if (afuera > 0.7 && nv[2] < 0.25 && nv[2] > -0.35)
          g = G['Tendón y hueso']; // banda iliotibial
        else g = nv[2] > -0.1 ? G['Cuádriceps'] : G.Isquiotibiales;
      } else {
        dir = pierna.eje;
        if (nv[2] < -0.1) g = pierna.t < 0.55 ? G.Gemelos : pierna.t < 0.85 ? G['Sóleo'] : G['Tendón y hueso'];
        else if (pierna.t < 0.06 && nv[2] > 0.7)
          g = G['Tendón y hueso']; // tendón de la rótula
        else if (afuera < -0.35 && nv[2] > 0.25 && pierna.t > 0.15)
          g = G['Tendón y hueso']; // cara interna de la tibia
        else if (afuera > 0.55) g = G.Peroneos;
        else g = G['Tibial anterior'];
      }
    } else {
      // Tronco
      const adelante = nv[2] > 0.35;
      const atras = nv[2] < -0.35;
      const hombro = art(`joint-${L}-shoulder`);
      if (y > yClav - 0.005 && !atras) {
        g = G['Esternocleidomastoideo'];
        dir = [-s * 0.35, -0.9, 0.3];
      } else if (adelante) {
        if (y > yBusto - 0.01) {
          g = G['Pectoral mayor'];
          dir = norm(sub(hombro, p));
        } else if (y < yHorca + 0.05) g = G.Pubis;
        else if (Math.abs(x) < 0.075) {
          g = G['Recto abdominal'];
          dir = [0, 1, 0];
          // Cuadros: tres filas entre el busto y el ombligo, una debajo.
          const f = Math.floor((yBusto - y) / ((yBusto - yOmbligo) / 3));
          fila[v] = Math.min(3, Math.max(0, f));
        } else {
          g = G.Oblicuos;
          dir = [-s * 0.7, -0.7, 0];
        }
      } else if (atras) {
        const baseTrapecio = yBusto - 0.05;
        const anchoTrapecio = ((y - baseTrapecio) / (yClav - baseTrapecio)) * anchoHombro * 0.95;
        if (y < yCadera + 0.02) {
          g = G['Glúteos'];
          dir = [s * 0.8, -0.6, 0];
        } else if (y > baseTrapecio && Math.abs(x) < anchoTrapecio) {
          g = G.Trapecio;
          dir = norm(sub([hombro[0], hombro[1], p[2]], p));
        } else if (y > yBusto) {
          g = G['Infraespinoso y redondo'];
          dir = norm(sub([hombro[0], hombro[1], p[2]], p));
        } else if (Math.abs(x) < 0.055) {
          g = G.Lumbares;
          dir = [0, 1, 0];
        } else {
          g = G['Dorsal ancho'];
          dir = norm(sub([s * anchoHombro * 0.8, yBusto + 0.12, p[2]], p));
        }
      } else {
        // Costados
        if (y > yBusto) {
          g = G['Serrato anterior'];
          dir = [s * 0.4, 0.6, 0.6];
        } else if (y > yCadera + 0.02) {
          g = G.Oblicuos;
          dir = [-s * 0.7, -0.7, 0];
        } else {
          g = G['Glúteos'];
          dir = [s * 0.8, -0.6, 0];
        }
      }
    }
    grupo[v] = g;
    if (dir && GRUPOS[g].musculo) fibraCruda.set(norm(dir), v * 3);
  }

  // El lado solo separa músculos (la cara no se parte al medio).
  const claves = new Map<number, number>();
  const etiquetas: Etiqueta[] = [];
  const etiqueta = new Uint16Array(n);
  for (let v = 0; v < n; v++) {
    if (!GRUPOS[grupo[v]].musculo) lado[v] = 0;
    const k = grupo[v] * 64 + lado[v] * 8 + fila[v];
    let e = claves.get(k);
    if (e === undefined) {
      e = etiquetas.length;
      claves.set(k, e);
      etiquetas.push({ grupo: grupo[v], lado: lado[v] });
    }
    etiqueta[v] = e;
  }
  const nE = etiquetas.length;

  // Difusión: cada etiqueta es un campo 1/0 que se alisa por la malla. Cada
  // vértice solo recorre las etiquetas que le pueden llegar en DIFUSION pasos
  // (casi siempre una a tres), no todas.
  let presentes: number[][] = Array.from(etiqueta, (e) => [e]);
  for (let it = 0; it < DIFUSION; it++) {
    presentes = presentes.map((ls, v) => {
      const out = ls.slice();
      for (const w of vecinos[v]) for (const k of presentes[w]) if (!out.includes(k)) out.push(k);
      return out;
    });
  }
  let f = new Float32Array(n * nE);
  let g = new Float32Array(n * nE);
  for (let v = 0; v < n; v++) f[v * nE + etiqueta[v]] = 1;
  for (let it = 0; it < DIFUSION; it++) {
    for (let v = 0; v < n; v++) {
      const vs = vecinos[v];
      const peso = 0.5 / (vs.length || 1);
      const o = v * nE;
      for (const k of presentes[v]) {
        let x = 0;
        for (const w of vs) x += f[w * nE + k];
        g[o + k] = 0.5 * f[o + k] + peso * x;
      }
    }
    [f, g] = [g, f];
  }

  // Tres candidatas por triángulo: las de más peso sumado en sus esquinas.
  const nT = tris.length / 3;
  const candidatas = new Float32Array(nT * 9);
  const pesos = new Float32Array(nT * 9);
  const suma = new Map<number, number>();
  for (let t = 0; t < nT; t++) {
    suma.clear();
    for (let c = 0; c < 3; c++) {
      const v = tris[t * 3 + c];
      for (const k of presentes[v]) suma.set(k, (suma.get(k) ?? 0) + f[v * nE + k]);
    }
    const elegidas = [...suma]
      .filter(([, w]) => w > 0.01)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([k]) => k);
    for (let c = 0; c < 3; c++) {
      const v = tris[t * 3 + c];
      for (let r = 0; r < 3; r++) {
        const i = (t * 3 + c) * 3 + r;
        candidatas[i] = elegidas[r] ?? elegidas[0];
        pesos[i] = r < elegidas.length ? f[v * nE + elegidas[r]] : -1;
      }
    }
  }

  // Estrías: una sola dirección por etiqueta (la media de sus vértices),
  // perpendicular a las fibras y a la normal media. Con una dirección por
  // vértice las estrías se curvan como curvas de nivel; así quedan paralelas.
  const tabla = new Float32Array(nE * 2 * 4);
  const d = new Float32Array(nE * 3);
  const nm = new Float32Array(nE * 3);
  for (let v = 0; v < n; v++) {
    for (let c = 0; c < 3; c++) {
      d[etiqueta[v] * 3 + c] += fibraCruda[v * 3 + c];
      nm[etiqueta[v] * 3 + c] += nor[v * 3 + c];
    }
  }
  etiquetas.forEach((e, k) => {
    const musculo = GRUPOS[e.grupo].musculo;
    tabla.set([...hexARgb(GRUPOS[e.grupo].color), musculo ? 1 : 0], k * 4);
    const dk: Vec3 = [d[k * 3], d[k * 3 + 1], d[k * 3 + 2]];
    if (musculo && Math.hypot(...dk) > 0) {
      const q = norm(cross(norm(dk), norm([nm[k * 3], nm[k * 3 + 1], nm[k * 3 + 2]])));
      tabla.set([...q, 0], (nE + k) * 4);
    }
  });
  return { etiquetas, candidatas, pesos, tabla };
}

/** Etiqueta en un punto de un triángulo (coordenadas baricéntricas), como la elige el shader. */
export function etiquetaEn(m: Musculos, triangulo: number, bary: Vec3): Etiqueta {
  let mejor = 0;
  let pesoMejor = -Infinity;
  for (let r = 0; r < 3; r++) {
    let w = 0;
    for (let c = 0; c < 3; c++) w += bary[c] * m.pesos[(triangulo * 3 + c) * 3 + r];
    if (w > pesoMejor) {
      pesoMejor = w;
      mejor = r;
    }
  }
  return m.etiquetas[m.candidatas[triangulo * 9 + mejor]];
}

/** Nombre para mostrar: el músculo y su lado (el recto abdominal va al medio). */
export function nombreEtiqueta(e: Etiqueta) {
  const g = GRUPOS[e.grupo];
  const lado = g.musculo && g.nombre !== 'Recto abdominal' ? (e.lado ? ' · izquierdo' : ' · derecho') : '';
  return g.nombre + lado;
}
