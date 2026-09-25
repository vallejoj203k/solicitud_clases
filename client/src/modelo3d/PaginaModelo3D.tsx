import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Canvas } from '@react-three/fiber';
import { Line, OrbitControls } from '@react-three/drei';
import {
  AlwaysStencilFunc,
  BufferAttribute,
  BufferGeometry,
  Color,
  EqualStencilFunc,
  MeshStandardMaterial,
  NotEqualStencilFunc,
  ReplaceStencilOp,
  ShaderMaterial,
} from 'three';
import { IconoAtras } from '../components/Iconos.jsx';
import { cargarCuerpo } from './cargar';
import { controlesLocales, pesosLocales, pesosMacro, type ControlLocal, type ControlesMacro } from './controles';
import { CIRCUNFERENCIAS, COLOR_GRASA, COLOR_MAGRO, COLOR_SEGMENTO } from './config';
import { useVisor } from './estado';
import { usarMotor } from './usarMotor';
import { FormularioMedidas, FormularioScanner } from './FormularioScanner';
import type { ResultadoMotor } from './motor.worker';
import type { CuerpoBase, Sexo } from './tipos';

/**
 * Visor de prueba (fases 1 y 2): carga los GLB exportados de MakeHuman, deja
 * mover cada morph a mano y muestra en vivo lo que mide el motor (estatura,
 * volumen total y por segmento, circunferencias). Los morphs y las medidas se
 * calculan en un Worker. Todavía sin solver ni datos del scanner.
 *
 * Todo se calcula en el navegador y no se guarda nada.
 */
export default function PaginaModelo3D() {
  const sexo = useVisor((s) => s.sexo);
  const macro = useVisor((s) => s.macro);
  const locales = useVisor((s) => s.locales);
  const verGrasa = useVisor((s) => s.verGrasa);
  const verAnillos = useVisor((s) => s.verAnillos);
  const [cuerpo, setCuerpo] = useState<CuerpoBase | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    setCuerpo(null);
    setError(null);
    cargarCuerpo(sexo)
      .then((c) => vivo && setCuerpo(c))
      .catch((e: Error) => vivo && setError(e.message));
    return () => {
      vivo = false;
    };
  }, [sexo]);

  const controles = useMemo(() => (cuerpo ? controlesLocales(cuerpo.meta) : []), [cuerpo]);
  const pedido = useMemo(() => {
    if (!cuerpo) return null;
    const pesos = { ...pesosMacro(macro, cuerpo.sexo), ...pesosLocales(locales, controles) };
    let pesosMagro = null;
    if (verGrasa) {
      const m = controlesMagros(macro, locales, controles);
      pesosMagro = { ...pesosMacro(m.macro, cuerpo.sexo), ...pesosLocales(m.locales, controles) };
    }
    return { cuerpo, pesos, pesosMagro, conAnillos: verAnillos };
  }, [cuerpo, macro, locales, controles, verGrasa, verAnillos]);
  const { resultado, error: errorMotor } = usarMotor(pedido);
  const vigente = resultado && cuerpo && resultado.sexo === cuerpo.sexo ? resultado : null;

  return (
    <div className="h-dvh flex flex-col md:landscape:flex-row overflow-hidden bg-carbon-900">
      <div className="relative h-[55%] md:landscape:h-full md:landscape:flex-1 min-h-0">
        {cuerpo ? (
          <Canvas camera={{ position: [0, 1.0, 3.4], fov: 35 }} dpr={[1, 2]} gl={{ stencil: true }}>
            <color attach="background" args={['#0F1115']} />
            <hemisphereLight args={['#ffffff', '#3a3f4a', 0.9]} />
            <directionalLight position={[2.5, 4, 3]} intensity={1.6} />
            <directionalLight position={[-3, 2, -2]} intensity={0.5} />
            <Cuerpo cuerpo={cuerpo} resultado={vigente} />
            {verAnillos && vigente && <AnillosMedida anillos={vigente.anillos} />}
            <mesh rotation-x={-Math.PI / 2} position-y={-0.001}>
              <circleGeometry args={[0.9, 48]} />
              <meshStandardMaterial color="#1C2028" roughness={1} />
            </mesh>
            <OrbitControls
              target={[0, 0.9, 0]}
              enablePan={false}
              minDistance={1.2}
              maxDistance={6}
              maxPolarAngle={Math.PI / 2 - 0.03}
            />
          </Canvas>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-humo-500">
            {error ? `No se pudo cargar el modelo: ${error}` : 'Cargando modelo…'}
          </div>
        )}
        {errorMotor && (
          <p className="absolute bottom-3 left-3 right-3 rounded-xl bg-red-900/80 px-3 py-2 text-xs">
            Error del motor: {errorMotor}
          </p>
        )}
      </div>

      <Panel cuerpo={cuerpo} resultado={vigente} />
    </div>
  );
}

/* ------------------------------------------------------------- Cuerpo 3D */

/** Geometría con el orden de vértices de MakeHuman; `color` = segmento. */
function crearGeometria(cuerpo: CuerpoBase) {
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(cuerpo.posiciones), 3));
  g.setIndex(new BufferAttribute(cuerpo.indicesTriangulos, 1));
  const colores = new Float32Array(cuerpo.segmentos.length * 3);
  const c = new Color();
  cuerpo.segmentos.forEach((s, i) => {
    c.set(COLOR_SEGMENTO[cuerpo.meta.segmentos.nombres[s]] ?? '#ffffff');
    colores.set([c.r, c.g, c.b], i * 3);
  });
  g.setAttribute('color', new BufferAttribute(colores, 3));
  return g;
}

/** Copia posiciones y normales calculadas en el Worker a la geometría. */
function volcar(geometria: BufferGeometry, malla: { pos: Float32Array; normales: Float32Array }) {
  const pos = geometria.getAttribute('position') as BufferAttribute;
  (pos.array as Float32Array).set(malla.pos);
  pos.needsUpdate = true;
  let nor = geometria.getAttribute('normal') as BufferAttribute | undefined;
  if (!nor) {
    nor = new BufferAttribute(new Float32Array(malla.normales.length), 3);
    geometria.setAttribute('normal', nor);
  }
  (nor.array as Float32Array).set(malla.normales);
  nor.needsUpdate = true;
  geometria.computeBoundingSphere();
}

/**
 * PROTOTIPO del cuerpo sin grasa: los mismos controles, con el peso de
 * MakeHuman al mínimo y los controles de grasa sin aumentar. En la fase 2 lo
 * reemplaza el solver, alimentado con la masa libre de grasa del scanner.
 */
const MEDIDAS_DE_GRASA = new Set(['cintura', 'cadera', 'pecho', 'cuello', 'barriga']);
function controlesMagros(macro: ControlesMacro, locales: Record<string, number>, controles: ControlLocal[]) {
  const l: Record<string, number> = {};
  for (const c of controles) {
    const v = locales[c.clave] ?? 0;
    const esGrasa = c.grupo === 'grasa' || c.clave.endsWith('_grasa') || MEDIDAS_DE_GRASA.has(c.clave);
    l[c.clave] = esGrasa ? Math.min(v, 0) : v;
  }
  return { macro: { ...macro, peso: 0 }, locales: l };
}

/**
 * Vista "grasa sobre músculo", la versión 3D de la silueta negra con borde
 * amarillo: el cuerpo sin grasa marca el stencil; la capa de grasa se pinta
 * casi opaca donde NO hay cuerpo sin grasa detrás (el borde que sobresale del
 * contorno, desde cualquier ángulo) y muy tenue por encima de él.
 */
function crearMaterialesGrasa() {
  const magro = new MeshStandardMaterial({ color: COLOR_MAGRO, roughness: 0.6, metalness: 0 });
  magro.stencilWrite = true;
  magro.stencilRef = 1;
  magro.stencilFunc = AlwaysStencilFunc;
  magro.stencilZPass = ReplaceStencilOp;

  const capa = (opacidad: number, borde: number, dentro: boolean) => {
    const m = new ShaderMaterial({
      uniforms: { color: { value: new Color(COLOR_GRASA) }, opacidad: { value: opacidad }, borde: { value: borde } },
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
        uniform float opacidad;
        uniform float borde;
        varying vec3 vN;
        varying vec3 vV;
        void main() {
          float f = 1.0 - abs(dot(normalize(vN), normalize(vV)));
          float luz = 0.72 + 0.28 * max(dot(normalize(vN), normalize(vec3(0.4, 0.8, 0.6))), 0.0);
          gl_FragColor = vec4(color * luz, mix(opacidad, borde, pow(f, 2.0)));
          #include <colorspace_fragment>
        }`,
      transparent: true,
      depthWrite: false,
    });
    m.stencilWrite = true; // en three, activa la prueba de stencil
    m.stencilRef = 1;
    m.stencilFunc = dentro ? EqualStencilFunc : NotEqualStencilFunc;
    return m;
  };

  return { magro, fuera: capa(0.9, 1.0, false), encima: capa(0.07, 0.35, true) };
}

function Cuerpo({ cuerpo, resultado }: { cuerpo: CuerpoBase; resultado: ResultadoMotor | null }) {
  const verSegmentos = useVisor((s) => s.verSegmentos);
  const verGrasa = useVisor((s) => s.verGrasa);
  const geometria = useMemo(() => crearGeometria(cuerpo), [cuerpo]);
  const geometriaMagra = useMemo(() => crearGeometria(cuerpo), [cuerpo]);
  const materiales = useMemo(crearMaterialesGrasa, []);
  useEffect(() => () => geometria.dispose(), [geometria]);
  useEffect(() => () => geometriaMagra.dispose(), [geometriaMagra]);
  useEffect(
    () => () => {
      materiales.magro.dispose();
      materiales.fuera.dispose();
      materiales.encima.dispose();
    },
    [materiales],
  );

  // Antes del primer resultado del Worker se ve la malla base con sus normales.
  useEffect(() => {
    if (!geometria.getAttribute('normal')) geometria.computeVertexNormals();
  }, [geometria]);

  useEffect(() => {
    if (!resultado) return;
    volcar(geometria, resultado.cuerpo);
    if (resultado.magro) volcar(geometriaMagra, resultado.magro);
  }, [resultado, geometria, geometriaMagra]);

  if (verGrasa && resultado?.magro) {
    return (
      <>
        <mesh geometry={geometriaMagra} material={materiales.magro} />
        <mesh geometry={geometria} material={materiales.fuera} renderOrder={1} />
        <mesh geometry={geometria} material={materiales.encima} renderOrder={2} />
      </>
    );
  }

  return (
    <mesh geometry={geometria}>
      <meshStandardMaterial
        key={verSegmentos ? 'seg' : 'gris'}
        color={verSegmentos ? '#ffffff' : '#B9B9B9'}
        vertexColors={verSegmentos}
        roughness={0.85}
        metalness={0}
      />
    </mesh>
  );
}

/** Contornos de cinta métrica donde se mide cada circunferencia. */
function AnillosMedida({ anillos }: { anillos: Record<string, Float32Array> }) {
  return (
    <>
      {Object.entries(anillos).map(([nombre, a]) => {
        if (a.length < 9) return null;
        const puntos: [number, number, number][] = [];
        for (let i = 0; i < a.length; i += 3) puntos.push([a[i], a[i + 1], a[i + 2]]);
        puntos.push(puntos[0]);
        return <Line key={nombre} points={puntos} color="#8CC63F" lineWidth={2} depthTest={false} renderOrder={3} />;
      })}
    </>
  );
}

/* ------------------------------------------------------------------ Panel */

const TITULO_GRUPO: Record<string, string> = {
  segmento: 'Segmentos (grasa / músculo)',
  torso: 'Torso',
  medida: 'Medidas',
  musculo: 'Músculo',
  grasa: 'Grasa',
};

type Pestana = 'scanner' | 'medidas' | 'manual';
const PESTANAS: [Pestana, string][] = [
  ['scanner', 'Datos del scanner'],
  ['medidas', 'Medidas'],
  ['manual', 'Ajuste manual'],
];

function Panel({ cuerpo, resultado }: { cuerpo: CuerpoBase | null; resultado: ResultadoMotor | null }) {
  const {
    sexo,
    macro,
    locales,
    verSegmentos,
    verGrasa,
    verAnillos,
    setSexo,
    setMacro,
    setLocal,
    setVerSegmentos,
    setVerGrasa,
    setVerAnillos,
    reiniciar,
  } = useVisor();
  const [pestana, setPestana] = useState<Pestana>('scanner');
  const controles = useMemo(() => (cuerpo ? controlesLocales(cuerpo.meta) : []), [cuerpo]);
  const grupos = useMemo(() => {
    const g: Record<string, ControlLocal[]> = {};
    for (const c of controles) (g[c.grupo] ??= []).push(c);
    return g;
  }, [controles]);

  return (
    <aside className="flex-1 md:landscape:flex-none md:landscape:w-[26rem] min-h-0 overflow-y-auto border-t md:landscape:border-t-0 md:landscape:border-l border-carbon-700 bg-carbon-800">
      <div className="p-5 space-y-6">
        <header className="flex items-center gap-3">
          <Link
            to="/composicion-corporal"
            aria-label="Volver a composición corporal"
            className="p-2 -ml-2 rounded-xl text-humo-300 hover:bg-carbon-700"
          >
            <IconoAtras />
          </Link>
          <div className="min-w-0">
            <h1 className="text-lg font-extrabold tracking-tightest">Resultado 3D</h1>
            <p className="text-xs text-humo-500">Datos del scanner · visor de prueba (fase 2)</p>
          </div>
        </header>

        <div className="grid grid-cols-2 gap-2" role="group" aria-label="Sexo">
          {(['M', 'F'] as Sexo[]).map((s) => (
            <button
              key={s}
              onClick={() => setSexo(s)}
              aria-pressed={sexo === s}
              className={`rounded-xl py-2.5 text-sm font-semibold border ${
                sexo === s ? 'bg-volt-500 text-carbon-900 border-volt-500' : 'border-carbon-600 text-humo-300'
              }`}
            >
              {s === 'M' ? 'Hombre' : 'Mujer'}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-3 gap-1 rounded-xl bg-carbon-900 p-1" role="tablist" aria-label="Secciones del panel">
          {PESTANAS.map(([clave, titulo]) => (
            <button
              key={clave}
              role="tab"
              aria-selected={pestana === clave}
              onClick={() => setPestana(clave)}
              className={`rounded-lg px-1 py-2 text-xs font-semibold ${
                pestana === clave ? 'bg-carbon-600 text-humo-100' : 'text-humo-500 hover:text-humo-300'
              }`}
            >
              {titulo}
            </button>
          ))}
        </div>

        {pestana === 'scanner' && <FormularioScanner />}
        {pestana === 'medidas' && <FormularioMedidas />}

        {pestana === 'manual' && (
          <>
            {cuerpo && resultado && <PanelMedidas cuerpo={cuerpo} resultado={resultado} />}

            <label className="flex items-center gap-3 text-sm">
              <input type="checkbox" checked={verAnillos} onChange={(e) => setVerAnillos(e.target.checked)} />
              Anillos de medida
            </label>

            <label className="flex items-center gap-3 text-sm">
              <input type="checkbox" checked={verSegmentos} onChange={(e) => setVerSegmentos(e.target.checked)} />
              Ver segmentos
            </label>
            {verSegmentos && cuerpo && (
              <ul className="grid grid-cols-2 gap-1.5 text-xs">
                {cuerpo.meta.segmentos.nombres.map((n) => (
                  <li key={n} className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-sm" style={{ background: COLOR_SEGMENTO[n] }} />
                    {n.replace('_', ' ')} ({cuerpo.meta.segmentos.conteo[n]})
                  </li>
                ))}
              </ul>
            )}

            <label className="flex items-center gap-3 text-sm">
              <input type="checkbox" checked={verGrasa} onChange={(e) => setVerGrasa(e.target.checked)} />
              Grasa sobre músculo (prototipo)
            </label>
            {verGrasa && (
              <div className="space-y-1.5 text-xs text-humo-300">
                <p className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-sm border border-carbon-600" style={{ background: COLOR_MAGRO }} />
                  Cuerpo sin grasa (músculo, hueso, órganos)
                </p>
                <p className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-sm" style={{ background: COLOR_GRASA }} />
                  Grasa
                </p>
                <p className="text-[11px] text-humo-500">
                  Por ahora el cuerpo sin grasa se aproxima con el peso al mínimo. Con el ajuste (fases 3 y 4) saldrá de la masa
                  libre de grasa del scanner.
                </p>
              </div>
            )}

            <Seccion titulo="Macro (MakeHuman)">
              <Deslizador
                etiqueta="Músculo"
                min={0}
                max={1}
                paso={0.01}
                valor={macro.musculo}
                onChange={(v) => setMacro('musculo', v)}
              />
              <Deslizador etiqueta="Peso" min={0} max={1} paso={0.01} valor={macro.peso} onChange={(v) => setMacro('peso', v)} />
              <Deslizador
                etiqueta="Edad (años)"
                min={25}
                max={90}
                paso={1}
                valor={macro.edad}
                onChange={(v) => setMacro('edad', v)}
              />
              <Deslizador
                etiqueta="Altura"
                min={0}
                max={1}
                paso={0.01}
                valor={macro.altura}
                onChange={(v) => setMacro('altura', v)}
              />
              <Deslizador
                etiqueta="Proporciones ideales"
                min={0}
                max={1}
                paso={0.01}
                valor={macro.proporciones}
                onChange={(v) => setMacro('proporciones', v)}
              />
              {sexo === 'F' && (
                <Deslizador
                  etiqueta="Copa"
                  min={0}
                  max={1}
                  paso={0.01}
                  valor={macro.copa}
                  onChange={(v) => setMacro('copa', v)}
                />
              )}
            </Seccion>

            {Object.entries(grupos).map(([grupo, lista]) => (
              <Seccion key={grupo} titulo={TITULO_GRUPO[grupo] ?? grupo}>
                {lista.map((c) => (
                  <Deslizador
                    key={c.clave}
                    etiqueta={c.etiqueta}
                    min={c.bipolar ? -1 : 0}
                    max={1}
                    paso={0.01}
                    valor={locales[c.clave] ?? 0}
                    onChange={(v) => setLocal(c.clave, v)}
                  />
                ))}
              </Seccion>
            ))}

            <button
              onClick={reiniciar}
              className="w-full rounded-xl py-2.5 text-sm font-semibold border border-carbon-600 text-humo-300 hover:text-humo-100"
            >
              Reiniciar valores
            </button>
          </>
        )}

        <p className="text-[11px] text-humo-500">Datos de referencia deportiva, no para fines médicos.</p>
      </div>
    </aside>
  );
}

/** Lo que mide el motor, en vivo. */
function PanelMedidas({ cuerpo, resultado }: { cuerpo: CuerpoBase; resultado: ResultadoMotor }) {
  const m = resultado.medidas;
  const fila = (etiqueta: string, valor: string) => (
    <div key={etiqueta} className="flex justify-between gap-2 py-0.5">
      <dt className="text-humo-300">{etiqueta}</dt>
      <dd className="tabular-nums font-semibold">{valor}</dd>
    </div>
  );
  return (
    <div className="space-y-3">
      <dl className="grid grid-cols-3 gap-2 text-center">
        <Dato titulo="Estatura" valor={`${m.estaturaCm.toFixed(1)} cm`} />
        <Dato titulo="Volumen" valor={`${m.volumenL.toFixed(2)} L`} />
        <Dato titulo="Cálculo" valor={`${resultado.ms.toFixed(1)} ms`} />
      </dl>
      <details className="rounded-xl bg-carbon-700/60 px-3 py-2 text-xs" open>
        <summary className="cursor-pointer font-semibold text-humo-100">Circunferencias y entrepierna</summary>
        <dl className="mt-2" data-medidas="circunferencias">
          {Object.entries(m.circunferenciasCm).map(([n, cm]) => fila(CIRCUNFERENCIAS[n]?.etiqueta ?? n, `${cm.toFixed(1)} cm`))}
          {fila('Entrepierna', `${m.entrepiernaCm.toFixed(1)} cm`)}
        </dl>
      </details>
      <details className="rounded-xl bg-carbon-700/60 px-3 py-2 text-xs">
        <summary className="cursor-pointer font-semibold text-humo-100">Volumen por segmento</summary>
        <dl className="mt-2" data-medidas="segmentos">
          {Object.entries(m.volumenSegmentoL).map(([n, l]) => fila(n.replace('_', ' '), `${l.toFixed(2)} L`))}
          {fila(
            'Suma',
            `${Object.values(m.volumenSegmentoL)
              .reduce((a, b) => a + b, 0)
              .toFixed(2)} L`,
          )}
        </dl>
      </details>
      <p className="text-[11px] text-humo-500">
        {cuerpo.morphs.length} morphs · morphs {resultado.msMorphs.toFixed(1)} ms · cálculo total en el Worker{' '}
        {resultado.ms.toFixed(1)} ms
      </p>
    </div>
  );
}

function Seccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="etiqueta">{titulo}</h2>
      {children}
    </section>
  );
}

function Dato({ titulo, valor }: { titulo: string; valor: string }) {
  return (
    <div className="rounded-xl bg-carbon-700 px-2 py-2">
      <dt className="text-[10px] uppercase tracking-wider text-humo-500">{titulo}</dt>
      <dd className="text-sm font-bold tabular-nums">{valor}</dd>
    </div>
  );
}

function Deslizador(props: {
  etiqueta: string;
  min: number;
  max: number;
  paso: number;
  valor: number;
  onChange: (v: number) => void;
}) {
  const { etiqueta, min, max, paso, valor, onChange } = props;
  const decimales = Number.isInteger(paso) ? 0 : 2;
  const mostrado = valor.toFixed(decimales).replace('.', ',');
  const [texto, setTexto] = useState<string | null>(null);
  // Se escribe con el teclado; se aplica al salir del campo o con Enter.
  const aplicar = () => {
    if (texto === null) return;
    const n = Number(texto.replace(',', '.'));
    if (texto.trim() !== '' && Number.isFinite(n)) onChange(Math.min(max, Math.max(min, n)));
    setTexto(null);
  };
  return (
    <div data-deslizador className="block">
      <span className="flex items-center justify-between gap-2 text-xs text-humo-300">
        <span className="truncate pr-2">{etiqueta}</span>
        <input
          type="text"
          inputMode={min < 0 ? 'text' : 'decimal'}
          aria-label={`${etiqueta}: valor`}
          value={texto ?? mostrado}
          onFocus={(e) => {
            setTexto(mostrado);
            e.target.select();
          }}
          onChange={(e) => setTexto(e.target.value)}
          onBlur={aplicar}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            if (e.key === 'Escape') setTexto(null);
          }}
          className="w-16 rounded-md border border-carbon-600 bg-carbon-900 px-1.5 py-0.5 text-right tabular-nums text-humo-100 outline-none focus:border-[#8CC63F]"
        />
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={paso}
        value={valor}
        aria-label={etiqueta}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-[#8CC63F]"
      />
    </div>
  );
}
