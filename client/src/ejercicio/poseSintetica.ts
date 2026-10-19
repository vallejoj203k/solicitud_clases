import { P, type Pose, type Punto } from './puntos';

/**
 * Poses sintéticas: un esqueleto de 1,75 m que hace sentadillas. De perfil la
 * cámara mira el costado (x adelante); de frente, mira la cara (x de lado).
 */
export interface Forma {
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

/**
 * Dónde está la persona en la imagen: x del centro (0 a 1), y de los pies (0 a 1)
 * y tamaño (1 = a la distancia de siempre; más cerca de la cámara, más grande).
 */
export interface Lugar {
  x: number;
  piso: number;
  escala: number;
}
export const LUGAR: Lugar = { x: 0.5, piso: 0.9, escala: 1 };

/** Pose con avance a (0 de pie, 1 en el fondo). */
export function pose(f: Forma, a: number, vista: 'perfil' | 'frente', ruido = 0, inclinacion = 0, lugar: Lugar = LUGAR): Pose {
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
  const imagen = mundo.map((p) => ({ x: lugar.x + (p.x * lugar.escala) / (2.3 * aspecto), y: lugar.piso + (p.y * lugar.escala) / 2.3, z: 0, visibility: p.visibility }));
  if (vista === 'perfil') for (const i of [P.hombro.der, P.cadera.der, P.rodilla.der, P.tobillo.der]) imagen[i].visibility = 0.3;
  return { imagen, mundo: m, aspecto };
}
