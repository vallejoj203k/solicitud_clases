import { useEffect, useMemo } from 'react';
import { useThree } from '@react-three/fiber';
import { ContactShadows, Environment, Line, OrbitControls } from '@react-three/drei';
import {
  AlwaysStencilFunc,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  EqualStencilFunc,
  MeshPhysicalMaterial,
  NotEqualStencilFunc,
  ReplaceStencilOp,
  ShaderMaterial,
  SpriteMaterial,
  SRGBColorSpace,
  Vector3,
} from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { CIRCUNFERENCIAS, COLOR_GRASA, COLOR_MAGRO, COLOR_SEGMENTO, MAPA_CALOR } from './config';
import { useVisor } from './estado';
import type { Malla, ResultadoMotor } from './motor.worker';
import type { Estado, EstadoSegmento } from './resultados';
import type { SegmentoInforme } from './cliente';
import { normalesVertice } from './geometria';
import { atributoEscultura, esculturaDe, llevarAEscultura, posicionesEscultura, type Escultura } from './escultura';
import type { CuerpoBase } from './tipos';

/**
 * La escena 3D: iluminación de estudio (HDRI CC0 de Poly Haven, guardado junto a
 * los modelos), sombra de contacto, cámara orbital con límites y el cuerpo en el
 * modo de vista elegido.
 */

/** Lo que hace falta para dibujar un cuerpo (sale del Worker, o de mezclar dos). */
export interface DatosCuerpo {
  cuerpo: Malla;
  magro?: Malla;
  espesor?: Float32Array;
}

const OBJETIVO_CAMARA = [0, 0.9, 0] as const;
const SEPARACION_LADO = 0.62;

export function Escena(props: {
  cuerpo: CuerpoBase;
  actual: ResultadoMotor | null;
  objetivo: ResultadoMotor | null;
  estados: Record<SegmentoInforme, EstadoSegmento> | null;
}) {
  const { cuerpo, actual, objetivo, estados } = props;
  const vista = useVisor((s) => s.vista);
  const comparar = useVisor((s) => s.comparar);
  const verAnillos = useVisor((s) => s.verAnillos);
  const verSegmentos = useVisor((s) => s.verSegmentos);
  const colorCuerpo = useVisor((s) => s.colorCuerpo);
  const calorDe = useVisor((s) => s.calorDe);
  const mezcla = useVisor((s) => s.mezcla);
  const giro = useVisor((s) => s.giro);
  const lado = vista === 'comparar' && comparar === 'lado' && !!objetivo;

  // Mezcla actual -> objetivo para la transición de la vista fantasma (lineal:
  // los morphs lo son, así que es casi exactamente el cuerpo intermedio).
  const mezclado = useMemo<DatosCuerpo | null>(() => {
    if (vista !== 'comparar' || comparar !== 'fantasma' || !actual || !objetivo) return null;
    return mezclar(actual, objetivo, mezcla);
  }, [vista, comparar, actual, objetivo, mezcla]);

  // Los anillos se miden sobre el cuerpo de MakeHuman: se llevan a la escultura.
  const anillos = useMemo(() => {
    if (!actual || !verAnillos) return null;
    const e = esculturaDe(cuerpo.sexo);
    return Object.fromEntries(Object.entries(actual.anillos).map(([k, a]) => [k, llevarAEscultura(e, actual.cuerpo.pos, a)]));
  }, [actual, verAnillos, cuerpo.sexo]);

  let contenido: React.ReactNode = null;
  if (actual) {
    if (verSegmentos) {
      contenido = <CuerpoSolido cuerpo={cuerpo} malla={actual.cuerpo} colores={coloresSegmento(cuerpo)} />;
    } else if (vista === 'realista') {
      contenido = <CuerpoSolido cuerpo={cuerpo} malla={actual.cuerpo} color={colorCuerpo} />;
    } else if (vista === 'calor') {
      contenido = (
        <CuerpoSolido cuerpo={cuerpo} malla={actual.cuerpo} colores={coloresCalor(cuerpo, estados, calorDe)} />
      );
    } else if (lado && objetivo) {
      contenido = (
        <>
          <group position-x={-SEPARACION_LADO}>
            <CuerpoGrasa cuerpo={cuerpo} datos={actual} />
            <Etiqueta texto="Actual" posicion={[0, (actual.medidas.estaturaCm / 100) + 0.12, 0]} />
          </group>
          <group position-x={SEPARACION_LADO}>
            <CuerpoGrasa cuerpo={cuerpo} datos={objetivo} />
            <Etiqueta texto="Objetivo" posicion={[0, (objetivo.medidas.estaturaCm / 100) + 0.12, 0]} color="#B5E37A" />
          </group>
        </>
      );
    } else if (mezclado) {
      contenido = (
        <>
          <CuerpoGrasa cuerpo={cuerpo} datos={mezclado} />
          <Fantasma cuerpo={cuerpo} malla={actual.cuerpo} />
        </>
      );
    } else {
      contenido = <CuerpoGrasa cuerpo={cuerpo} datos={actual} />;
    }
  }

  return (
    <>
      <Fondo />
      <Environment files="/modelo3d/estudio.hdr" environmentIntensity={0.35} />
      {/* Luz de estudio: principal suave y casi de frente (sombras parejas en los
          dos lados del cuerpo), relleno del otro lado y dos luces de borde
          detrás que dibujan la silueta contra el fondo oscuro. */}
      {LUCES.map((l, i) => (
        <directionalLight key={i} position={l.posicion} intensity={l.intensidad} color={l.color} />
      ))}
      <group rotation-y={giro}>
        {contenido}
        {verAnillos && anillos && actual && !lado && <AnillosMedida anillos={anillos} medidas={actual.medidas.circunferenciasCm} />}
      </group>
      <ContactShadows position={[0, 0.001, 0]} scale={lado ? 4 : 2.4} blur={2.6} opacity={0.6} far={1.2} resolution={512} color="#000000" />
      <Piso radio={lado ? 1.8 : 1.1} />
      <Camara lado={lado} />
    </>
  );
}

const LUCES: { posicion: [number, number, number]; intensidad: number; color: string }[] = [
  { posicion: [2.4, 3.4, 3.2], intensidad: 1.3, color: '#FFFFFF' },
  { posicion: [-3, 1.2, 2.5], intensidad: 0.35, color: '#FFFFFF' },
  { posicion: [-2.2, 2.6, -3], intensidad: 1.1, color: '#D6E6FF' },
  { posicion: [2.2, 2.6, -3], intensidad: 0.9, color: '#FFEBD6' },
];

/** Degradado radial de fondo (más claro detrás del cuerpo), en pantalla completa. */
function Fondo() {
  const textura = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 512;
    const ctx = c.getContext('2d')!;
    const g = ctx.createRadialGradient(256, 230, 20, 256, 256, 360);
    g.addColorStop(0, '#2B303B');
    g.addColorStop(0.55, '#171A21');
    g.addColorStop(1, '#0B0D11');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 512, 512);
    const t = new CanvasTexture(c);
    t.colorSpace = SRGBColorSpace;
    return t;
  }, []);
  useEffect(() => () => textura.dispose(), [textura]);
  return <primitive attach="background" object={textura} />;
}

/** Piso: un disco que se desvanece hacia el borde (sin un corte duro). */
function Piso({ radio }: { radio: number }) {
  const textura = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 256;
    const ctx = c.getContext('2d')!;
    const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
    g.addColorStop(0, 'rgba(58, 64, 78, 0.9)');
    g.addColorStop(0.6, 'rgba(40, 45, 56, 0.55)');
    g.addColorStop(1, 'rgba(24, 27, 34, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 256);
    const t = new CanvasTexture(c);
    t.colorSpace = SRGBColorSpace;
    return t;
  }, []);
  useEffect(() => () => textura.dispose(), [textura]);
  return (
    <mesh rotation-x={-Math.PI / 2} position-y={-0.002}>
      <circleGeometry args={[radio, 64]} />
      <meshBasicMaterial map={textura} transparent depthWrite={false} />
    </mesh>
  );
}

/** Controles de órbita con límites; se aleja un poco cuando hay dos cuerpos. */
function Camara({ lado }: { lado: boolean }) {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as unknown as OrbitControlsImpl | null;
  useEffect(() => {
    const t = controls ? controls.target.clone() : new Vector3(...OBJETIVO_CAMARA);
    const dir = camera.position.clone().sub(t);
    const actual = dir.length();
    const deseada = lado ? Math.max(actual, 4.6) : Math.min(actual, 3.6);
    camera.position.copy(dir.setLength(deseada).add(t));
    controls?.update();
  }, [lado, camera, controls]);
  return (
    <OrbitControls
      makeDefault
      target={[...OBJETIVO_CAMARA]}
      enablePan={false}
      minDistance={1.2}
      maxDistance={7}
      maxPolarAngle={Math.PI / 2 - 0.03}
    />
  );
}

/* ------------------------------------------------------------ Geometrías */

/**
 * Geometría de un cuerpo: la escultura (escultura.ts), movida según el cuerpo
 * de MakeHuman que se mide (ese cuerpo no se muestra).
 */
function crearGeometria(cuerpo: CuerpoBase) {
  const e = esculturaDe(cuerpo.sexo);
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(Float32Array.from(e.original), 3));
  g.setAttribute('normal', new BufferAttribute(new Float32Array(e.nTotal * 3), 3));
  g.setIndex(new BufferAttribute(e.indices, 1));
  g.computeVertexNormals();
  g.userData.cuerpo = cuerpo;
  g.userData.escultura = e;
  return g;
}

function volcar(geometria: BufferGeometry, malla: Malla) {
  const cuerpo = geometria.userData.cuerpo as CuerpoBase;
  const e = geometria.userData.escultura as Escultura;
  const pos = geometria.getAttribute('position') as BufferAttribute;
  posicionesEscultura(e, cuerpo.indicesTriangulos, cuerpo.posiciones, malla.pos, pos.array as Float32Array<ArrayBuffer>);
  pos.needsUpdate = true;
  const nor = geometria.getAttribute('normal') as BufferAttribute;
  normalesVertice(pos.array as Float32Array, e.indices, nor.array as Float32Array);
  nor.needsUpdate = true;
  geometria.computeBoundingSphere();
}

/** Atributo por vértice del cuerpo (colores, espesor) llevado a la escultura. */
function ponerAtributo(geometria: BufferGeometry, nombre: string, valores: Float32Array, k: number) {
  const cuerpo = geometria.userData.cuerpo as CuerpoBase;
  const e = geometria.userData.escultura as Escultura;
  let attr = geometria.getAttribute(nombre) as BufferAttribute | undefined;
  if (!attr || attr.itemSize !== k) {
    attr = new BufferAttribute(new Float32Array(e.nTotal * k), k);
    geometria.setAttribute(nombre, attr);
  }
  atributoEscultura(e, cuerpo.indicesTriangulos, valores, k, attr.array as Float32Array<ArrayBuffer>);
  attr.needsUpdate = true;
}

/**
 * El canvas renderiza a demanda (solo cuando algo cambia): tras copiar datos a
 * una geometría hay que pedir un cuadro nuevo.
 */
function usarRedibujar() {
  return useThree((s) => s.invalidate);
}

function usarGeometria(cuerpo: CuerpoBase) {
  const g = useMemo(() => crearGeometria(cuerpo), [cuerpo]);
  useEffect(() => () => g.dispose(), [g]);
  return g;
}

function lerp(a: Float32Array, b: Float32Array, t: number) {
  const out = new Float32Array(a.length);
  for (let i = 0; i < a.length; i++) out[i] = a[i] + (b[i] - a[i]) * t;
  return out;
}

function lerpNormales(a: Float32Array, b: Float32Array, t: number) {
  const out = lerp(a, b, t);
  for (let i = 0; i < out.length; i += 3) {
    const l = Math.hypot(out[i], out[i + 1], out[i + 2]) || 1;
    out[i] /= l;
    out[i + 1] /= l;
    out[i + 2] /= l;
  }
  return out;
}

function mezclar(a: ResultadoMotor, b: ResultadoMotor, t: number): DatosCuerpo {
  const malla = (x: Malla, y: Malla): Malla => ({ pos: lerp(x.pos, y.pos, t), normales: lerpNormales(x.normales, y.normales, t) });
  return {
    cuerpo: malla(a.cuerpo, b.cuerpo),
    magro: a.magro && b.magro ? malla(a.magro, b.magro) : undefined,
    espesor: a.espesor && b.espesor ? lerp(a.espesor, b.espesor, t) : undefined,
  };
}

/* ------------------------------------------------------ Cuerpo realista */

function CuerpoSolido({ cuerpo, malla, color, colores }: { cuerpo: CuerpoBase; malla: Malla; color?: string; colores?: Float32Array }) {
  const g = usarGeometria(cuerpo);
  const redibujar = usarRedibujar();
  useEffect(() => {
    volcar(g, malla);
    redibujar();
  }, [g, malla, redibujar]);
  useEffect(() => {
    if (!colores) return;
    ponerAtributo(g, 'color', colores, 3);
    redibujar();
  }, [g, colores, redibujar]);
  const material = useMemo(() => crearMaterialPiel(colores ? '#ffffff' : color ?? '#ffffff', !!colores), [color, colores]);
  useEffect(() => () => material.dispose(), [material]);
  return <mesh geometry={g} material={material} />;
}

/**
 * Porcelana satinada: base algo rugosa, una capa de barniz muy suave y un
 * brillo aterciopelado en el contorno (sheen) que redondea la silueta.
 */
function crearMaterialPiel(color: string, vertexColors: boolean) {
  return new MeshPhysicalMaterial({
    color,
    vertexColors,
    roughness: 0.6,
    metalness: 0,
    clearcoat: 0.2,
    clearcoatRoughness: 0.5,
    sheen: 0.6,
    sheenRoughness: 0.5,
    sheenColor: '#ffffff',
    envMapIntensity: 0.6,
  });
}

function coloresPorSegmento(cuerpo: CuerpoBase, colorDe: (segmento: string) => string) {
  const out = new Float32Array(cuerpo.segmentos.length * 3);
  const c = new Color();
  const nombres = cuerpo.meta.segmentos.nombres;
  cuerpo.segmentos.forEach((s, i) => {
    c.set(colorDe(nombres[s]));
    out.set([c.r, c.g, c.b], i * 3);
  });
  return out;
}

const coloresSegmento = (cuerpo: CuerpoBase) => coloresPorSegmento(cuerpo, (s) => COLOR_SEGMENTO[s] ?? '#ffffff');

function coloresCalor(cuerpo: CuerpoBase, estados: Record<SegmentoInforme, EstadoSegmento> | null, de: 'grasa' | 'musculo') {
  const col = MAPA_CALOR.colores;
  return coloresPorSegmento(cuerpo, (s) => {
    const e = estados?.[s as SegmentoInforme];
    if (!e) return col.sinDato; // cabeza, o sin datos del scanner
    return col[(de === 'grasa' ? e.grasa.estado : e.musculo.estado) as Estado];
  });
}

/* --------------------------------------------- Grasa sobre músculo */

/**
 * Vista "grasa sobre músculo": el cuerpo sin grasa (rojo) queda dentro y la
 * grasa lo cubre como una capa amarilla translúcida, iluminada como un objeto
 * más, para que se lea que está por encima.
 *
 * - Donde la capa tapa al cuerpo sin grasa, su opacidad crece con el grosor de
 *   grasa de ese punto: la barriga se ve amarilla y maciza, las canillas casi
 *   transparentes, y donde no hay grasa desaparece (el músculo sigue rojo).
 * - Donde sobresale del contorno del cuerpo sin grasa (el stencil lo marca) se
 *   pinta casi opaca: es la silueta amarilla del dibujo de referencia, vista
 *   desde cualquier ángulo.
 */
function crearMaterialesGrasa() {
  const magro = new MeshPhysicalMaterial({
    color: COLOR_MAGRO,
    roughness: 0.55,
    metalness: 0,
    clearcoat: 0.15,
    clearcoatRoughness: 0.5,
    sheen: 0.4,
    sheenRoughness: 0.5,
    sheenColor: '#FFB0A0',
    envMapIntensity: 0.7,
  });
  magro.stencilWrite = true;
  magro.stencilRef = 1;
  magro.stencilFunc = AlwaysStencilFunc;
  magro.stencilZPass = ReplaceStencilOp;
  // Donde casi no hay grasa las dos superficies se tocan: el cuerpo sin grasa se
  // corre un poco hacia atrás en profundidad para que no asome por la capa.
  magro.polygonOffset = true;
  magro.polygonOffsetFactor = 2;
  magro.polygonOffsetUnits = 8;

  const capa = (encima: boolean) => {
    const m = new ShaderMaterial({
      uniforms: {
        color: { value: new Color(COLOR_GRASA) },
        // Opacidad según el grosor de grasa: 0 sin grasa (se ve el músculo tal cual),
        // `minima` apenas hay grasa y `maxima` desde `lleno` metros.
        minima: { value: encima ? 0.08 : 0.72 },
        maxima: { value: encima ? 0.42 : 0.88 },
        lleno: { value: 0.05 },
      },
      vertexShader: `
        attribute float espesor;
        varying vec3 vNm;
        varying vec3 vVm;
        varying float vEsp;
        void main() {
          vec4 mundo = modelMatrix * vec4(position, 1.0);
          vNm = normalize(mat3(modelMatrix) * normal);
          vVm = normalize(cameraPosition - mundo.xyz);
          vEsp = espesor;
          gl_Position = projectionMatrix * viewMatrix * mundo;
        }`,
      fragmentShader: `
        uniform vec3 color;
        uniform float minima;
        uniform float maxima;
        uniform float lleno;
        varying vec3 vNm;
        varying vec3 vVm;
        varying float vEsp;
        void main() {
          vec3 n = normalize(vNm);
          vec3 v = normalize(vVm);
          // Las luces de la escena: principal casi de frente y relleno del otro lado.
          vec3 principal = normalize(vec3(2.4, 3.4, 3.2));
          float luz = 0.5 + 0.55 * max(dot(n, principal), 0.0) + 0.18 * max(dot(n, normalize(vec3(-3.0, 1.2, 2.5))), 0.0);
          float f = 1.0 - abs(dot(n, v));
          // Brillo de la luz principal: la capa se lee como un gel encima del músculo.
          float brillo = 0.28 * pow(max(dot(n, normalize(principal + v)), 0.0), 50.0);
          // Menos de ~1,5 mm de grasa: la capa desaparece y el músculo conserva su color.
          float hay = smoothstep(0.0005, 0.0025, vEsp);
          float a = mix(minima, maxima, smoothstep(0.0, lleno, vEsp));
          a = hay * clamp(a + 0.35 * pow(f, 2.0) + brillo, 0.0, 1.0);
          vec3 c = color * luz + vec3(1.0, 0.96, 0.85) * (brillo + 0.2 * pow(f, 3.0));
          gl_FragColor = vec4(c, a);
          #include <colorspace_fragment>
        }`,
      transparent: true,
      depthWrite: false,
    });
    m.stencilWrite = true; // en three, activa la prueba de stencil
    m.stencilRef = 1;
    m.stencilFunc = encima ? EqualStencilFunc : NotEqualStencilFunc;
    return m;
  };

  return { magro, fuera: capa(false), encima: capa(true) };
}

function CuerpoGrasa({ cuerpo, datos }: { cuerpo: CuerpoBase; datos: DatosCuerpo }) {
  const exterior = usarGeometria(cuerpo);
  const magro = usarGeometria(cuerpo);
  const materiales = useMemo(crearMaterialesGrasa, []);
  const redibujar = usarRedibujar();
  useEffect(
    () => () => {
      materiales.magro.dispose();
      materiales.fuera.dispose();
      materiales.encima.dispose();
    },
    [materiales],
  );
  useEffect(() => {
    redibujar();
    volcar(exterior, datos.cuerpo);
    if (datos.magro) volcar(magro, datos.magro);
    if (datos.espesor) ponerAtributo(exterior, 'espesor', datos.espesor, 1);
  }, [datos, exterior, magro, redibujar]);

  if (!datos.magro) {
    return (
      <mesh geometry={exterior}>
        <meshStandardMaterial color="#B9B9B9" roughness={0.8} />
      </mesh>
    );
  }
  return (
    <>
      <mesh geometry={magro} material={materiales.magro} />
      <mesh geometry={exterior} material={materiales.fuera} renderOrder={1} />
      <mesh geometry={exterior} material={materiales.encima} renderOrder={2} />
    </>
  );
}

/** El cuerpo actual como un fantasma translúcido (vista comparar). */
function Fantasma({ cuerpo, malla }: { cuerpo: CuerpoBase; malla: Malla }) {
  const g = usarGeometria(cuerpo);
  const redibujar = usarRedibujar();
  useEffect(() => {
    volcar(g, malla);
    redibujar();
  }, [g, malla, redibujar]);
  const material = useMemo(
    () =>
      new ShaderMaterial({
        uniforms: { color: { value: new Color('#E6ECF5') } },
        vertexShader: `
          varying vec3 vN;
          varying vec3 vV;
          void main() {
            vec4 mv = modelViewMatrix * vec4(position, 1.0);
            vN = normalize(normalMatrix * normal);
            vV = normalize(-mv.xyz);
            gl_Position = projectionMatrix * mv;
          }`,
        fragmentShader: `
          uniform vec3 color;
          varying vec3 vN;
          varying vec3 vV;
          void main() {
            float f = 1.0 - abs(dot(normalize(vN), normalize(vV)));
            gl_FragColor = vec4(color, 0.05 + 0.55 * pow(f, 2.2));
            #include <colorspace_fragment>
          }`,
        transparent: true,
        depthWrite: false,
      }),
    [],
  );
  useEffect(() => () => material.dispose(), [material]);
  return <mesh geometry={g} material={material} renderOrder={4} />;
}

/* ------------------------------------------------------------ Anillos */

/**
 * Circunferencias con etiqueta (un lado basta: la otra es simétrica). Las del
 * torso van a la izquierda de la pantalla y las de brazos y piernas a la
 * derecha, para que no se encimen.
 */
const CON_ETIQUETA = ['cuello', 'pecho', 'cintura', 'cadera', 'brazo_izq', 'muslo_izq', 'pantorrilla_izq'];
const DEL_TORSO = new Set(['cuello', 'pecho', 'cintura', 'cadera']);

function AnillosMedida({ anillos, medidas }: { anillos: Record<string, Float32Array>; medidas: Record<string, number> }) {
  return (
    <>
      {Object.entries(anillos).map(([nombre, a]) => {
        if (a.length < 9) return null;
        const puntos: [number, number, number][] = [];
        let derecha = 0;
        let izquierda = 0;
        for (let i = 0; i < a.length; i += 3) {
          puntos.push([a[i], a[i + 1], a[i + 2]]);
          if (a[i] > a[derecha]) derecha = i;
          if (a[i] < a[izquierda]) izquierda = i;
        }
        puntos.push(puntos[0]);
        const def = CIRCUNFERENCIAS[nombre];
        const texto = `${(def?.etiqueta ?? nombre).replace(/ izq\.| \(ombligo\)/, '')} ${medidas[nombre].toFixed(1).replace('.', ',')} cm`;
        const torso = DEL_TORSO.has(nombre);
        const k = torso ? izquierda : derecha;
        return (
          <group key={nombre}>
            <Line points={puntos} color="#8CC63F" lineWidth={2} depthTest={false} renderOrder={5} />
            {CON_ETIQUETA.includes(nombre) && (
              <Etiqueta texto={texto} posicion={[a[k] + (torso ? -0.03 : 0.03), a[k + 1], a[k + 2]]} ancla={torso ? 'derecha' : 'izquierda'} />
            )}
          </group>
        );
      })}
    </>
  );
}

/**
 * Texto dibujado en un canvas como sprite: queda dentro de la imagen WebGL (sale
 * en la captura PNG, a diferencia de un rótulo HTML encima del canvas).
 */
function Etiqueta(props: { texto: string; posicion: [number, number, number]; color?: string; ancla?: 'centro' | 'izquierda' | 'derecha' }) {
  const { texto, posicion, color = '#EDEFF3', ancla = 'centro' } = props;
  const { material, ancho } = useMemo(() => {
    const px = 48;
    const lienzo = document.createElement('canvas');
    const ctx = lienzo.getContext('2d')!;
    ctx.font = `600 ${px}px Inter, system-ui, sans-serif`;
    const w = Math.ceil(ctx.measureText(texto).width) + px;
    lienzo.width = w;
    lienzo.height = px * 1.6;
    ctx.font = `600 ${px}px Inter, system-ui, sans-serif`;
    ctx.fillStyle = 'rgba(15,17,21,0.78)';
    ctx.beginPath();
    ctx.roundRect(0, 0, lienzo.width, lienzo.height, px * 0.4);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.textBaseline = 'middle';
    ctx.fillText(texto, px / 2, lienzo.height / 2);
    const tex = new CanvasTexture(lienzo);
    tex.colorSpace = SRGBColorSpace;
    const m = new SpriteMaterial({ map: tex, depthTest: false, transparent: true });
    return { material: m, ancho: w / lienzo.height };
  }, [texto, color]);
  useEffect(() => () => (material.map?.dispose(), material.dispose()), [material]);
  const alto = 0.05;
  const medio = (alto * ancho) / 2;
  const x = ancla === 'izquierda' ? posicion[0] + medio : ancla === 'derecha' ? posicion[0] - medio : posicion[0];
  return <sprite material={material} position={[x, posicion[1], posicion[2]]} scale={[alto * ancho, alto, 1]} renderOrder={6} />;
}
