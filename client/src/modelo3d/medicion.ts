import { CIRCUNFERENCIAS, ENTREPIERNA_TOLERANCIA_X } from './config';
import {
  contornoCinta,
  cortePlano,
  prepararParticion,
  volumenMalla,
  volumenesSegmento,
  type Particion,
  type Vec3,
} from './geometria';
import { estatura } from './motor';
import type { CuerpoBase, PesosMorph } from './tipos';

/**
 * Medidas del cuerpo deformado: estatura, volumen total y por segmento,
 * entrepierna y circunferencias de cinta métrica. Todo sale de la malla, no de
 * fórmulas: es lo que el solver (fase 3) va a comparar con los objetivos.
 */
export interface Medidas {
  estaturaCm: number;
  entrepiernaCm: number;
  volumenL: number;
  /** Litros por segmento (tronco, cabeza, brazo_izq, brazo_der, pierna_izq, pierna_der). */
  volumenSegmentoL: Record<string, number>;
  /** Circunferencias en cm. */
  circunferenciasCm: Record<string, number>;
}

export interface Anillos {
  /** Puntos 3D de cada contorno (xyz xyz ...), para dibujar los anillos. */
  [nombre: string]: Float32Array;
}

interface PrepCircunferencia {
  nombre: string;
  banda: Uint32Array;
  bandaAltura?: Uint32Array;
  triangulos: Uint32Array;
  eje?: [number, number];
  holgura: number;
}

/** Lo que se calcula una sola vez por cuerpo (topología, bandas, índices). */
export interface PrepMedicion {
  particion: Particion;
  nombresSegmento: string[];
  circunferencias: PrepCircunferencia[];
  vEntrepierna: number;
  articulaciones: { nombres: string[]; base: Float32Array; deltas: Map<string, Float32Array> };
}

export function prepararMedicion(cuerpo: CuerpoBase): PrepMedicion {
  const nombresSegmento = cuerpo.meta.segmentos.nombres;
  const tris = cuerpo.indicesTriangulos;
  const particion = prepararParticion(tris, cuerpo.segmentos, nombresSegmento.length);
  const nombresArt = cuerpo.meta.articulaciones.nombres;

  const circunferencias: PrepCircunferencia[] = [];
  for (const [nombre, def] of Object.entries(CIRCUNFERENCIAS)) {
    const lm = cuerpo.meta.landmarks[def.landmark];
    if (!lm) continue;
    const permitidos = new Set(def.segmentos.map((s) => nombresSegmento.indexOf(s)));
    const triangulos: number[] = [];
    for (let t = 0; t < particion.triSegmento.length; t++) if (permitidos.has(particion.triSegmento[t])) triangulos.push(t);
    const eje = def.plano === 'eje' && def.eje ? (def.eje.map((n) => nombresArt.indexOf(n)) as [number, number]) : undefined;
    if (eje && (eje[0] < 0 || eje[1] < 0)) throw new Error(`Faltan articulaciones para ${nombre}`);
    const altura = def.alturaDe ? cuerpo.meta.landmarks[def.alturaDe] : undefined;
    if (def.alturaDe && !altura) throw new Error(`El JSON no trae el landmark ${def.alturaDe}; regenera los GLB`);
    circunferencias.push({
      nombre,
      banda: Uint32Array.from(lm.vertices),
      bandaAltura: altura ? Uint32Array.from(altura.vertices) : undefined,
      triangulos: Uint32Array.from(triangulos),
      eje,
      holgura: def.holgura,
    });
  }

  // Entrepierna: el vértice más bajo de la línea media por encima del 30 % de la
  // estatura (las piernas no tienen vértices en x = 0: el primero es la horcajadura).
  const p = cuerpo.posiciones;
  const alto = estatura(p);
  let vEntrepierna = -1;
  for (let v = 0; v < p.length / 3; v++) {
    if (Math.abs(p[v * 3]) > ENTREPIERNA_TOLERANCIA_X || p[v * 3 + 1] < 0.3 * alto) continue;
    if (vEntrepierna < 0 || p[v * 3 + 1] < p[vEntrepierna * 3 + 1]) vEntrepierna = v;
  }

  const art = cuerpo.meta.articulaciones;
  const deltas = new Map<string, Float32Array>();
  for (const [morph, lista] of Object.entries(art.deltas)) deltas.set(morph, Float32Array.from(lista.flat()));

  return {
    particion,
    nombresSegmento,
    circunferencias,
    vEntrepierna,
    articulaciones: { nombres: nombresArt, base: Float32Array.from(art.base.flat()), deltas },
  };
}

/** Articulaciones con los mismos pesos que la malla (y el mismo apoyo en el suelo). */
export function posicionesArticulaciones(prep: PrepMedicion, pesos: PesosMorph, desplazoY: number): Float32Array {
  const out = Float32Array.from(prep.articulaciones.base);
  for (const [nombre, w] of Object.entries(pesos)) {
    if (Math.abs(w) < 1e-4) continue;
    const d = prep.articulaciones.deltas.get(nombre);
    if (!d) continue;
    for (let i = 0; i < out.length; i++) out[i] += w * d[i];
  }
  // La base del JSON ya está apoyada en el suelo; los morphs mueven los pies y
  // aplicarMorphs vuelve a apoyar la malla: se aplica el mismo corrimiento.
  for (let i = 1; i < out.length; i += 3) out[i] += desplazoY;
  return out;
}

function centroide(pos: Float32Array, vs: Uint32Array): Vec3 {
  let x = 0, y = 0, z = 0;
  for (const v of vs) {
    x += pos[v * 3];
    y += pos[v * 3 + 1];
    z += pos[v * 3 + 2];
  }
  return [x / vs.length, y / vs.length, z / vs.length];
}

/** Radio de la banda medido en el plano de corte (distancia máxima al centroide). */
function radioBanda(pos: Float32Array, vs: Uint32Array, c: Vec3, n: Vec3): number {
  let r = 0;
  for (const v of vs) {
    const dx = pos[v * 3] - c[0], dy = pos[v * 3 + 1] - c[1], dz = pos[v * 3 + 2] - c[2];
    const a = dx * n[0] + dy * n[1] + dz * n[2];
    r = Math.max(r, Math.sqrt(Math.max(0, dx * dx + dy * dy + dz * dz - a * a)));
  }
  return r;
}

/**
 * Mide la malla ya deformada. `pos` son las posiciones del cuerpo apoyado en el
 * suelo; `articulaciones` las de posicionesArticulaciones() con los mismos pesos.
 */
export function medir(
  cuerpo: CuerpoBase,
  prep: PrepMedicion,
  pos: Float32Array,
  articulaciones: Float32Array,
  conAnillos = false,
): { medidas: Medidas; anillos: Anillos } {
  const tris = cuerpo.indicesTriangulos;
  const volSeg = volumenesSegmento(pos, tris, prep.particion);
  const volumenSegmentoL: Record<string, number> = {};
  prep.nombresSegmento.forEach((n, i) => (volumenSegmentoL[n] = volSeg[i] * 1000));

  const circunferenciasCm: Record<string, number> = {};
  const anillos: Anillos = {};
  for (const c of prep.circunferencias) {
    const punto = centroide(pos, c.banda);
    if (c.bandaAltura) punto[1] = centroide(pos, c.bandaAltura)[1];
    let normal: Vec3 = [0, 1, 0];
    if (c.eje) {
      const [a, b] = c.eje;
      const d: Vec3 = [
        articulaciones[b * 3] - articulaciones[a * 3],
        articulaciones[b * 3 + 1] - articulaciones[a * 3 + 1],
        articulaciones[b * 3 + 2] - articulaciones[a * 3 + 2],
      ];
      const l = Math.hypot(...d);
      normal = [d[0] / l, d[1] / l, d[2] / l];
    }
    const radio = radioBanda(pos, c.banda, punto, normal) * c.holgura + 0.01;
    const contorno = contornoCinta(cortePlano(pos, tris, c.triangulos, punto, normal), punto, normal, radio);
    circunferenciasCm[c.nombre] = contorno.perimetro * 100;
    if (conAnillos) anillos[c.nombre] = contorno.anillo;
  }

  return {
    medidas: {
      estaturaCm: estatura(pos) * 100,
      entrepiernaCm: prep.vEntrepierna >= 0 ? pos[prep.vEntrepierna * 3 + 1] * 100 : NaN,
      volumenL: volumenMalla(pos, tris) * 1000,
      volumenSegmentoL,
      circunferenciasCm,
    },
    anillos,
  };
}
