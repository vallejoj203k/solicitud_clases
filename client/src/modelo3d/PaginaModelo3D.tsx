import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { BufferAttribute, BufferGeometry, Color } from 'three';
import { IconoAtras } from '../components/Iconos.jsx';
import { cargarCuerpo } from './cargar';
import { aplicarMorphs, estatura } from './motor';
import { controlesLocales, pesosLocales, pesosMacro, type ControlLocal } from './controles';
import { COLOR_SEGMENTO } from './config';
import { useVisor } from './estado';
import type { CuerpoBase, Sexo } from './tipos';

/**
 * Visor mínimo de la fase 1: carga los GLB exportados de MakeHuman y deja mover
 * cada morph a mano para revisarlos. Todavía sin solver ni datos del scanner.
 *
 * Todo se calcula en el navegador y no se guarda nada.
 */
export default function PaginaModelo3D() {
  const sexo = useVisor((s) => s.sexo);
  const [cuerpo, setCuerpo] = useState<CuerpoBase | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [medida, setMedida] = useState({ ms: 0, estaturaCm: 0 });

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

  return (
    <div className="h-dvh flex flex-col md:landscape:flex-row overflow-hidden bg-carbon-900">
      <div className="relative h-[55%] md:landscape:h-full md:landscape:flex-1 min-h-0">
        {cuerpo ? (
          <Canvas camera={{ position: [0, 1.0, 3.4], fov: 35 }} dpr={[1, 2]}>
            <color attach="background" args={['#0F1115']} />
            <hemisphereLight args={['#ffffff', '#3a3f4a', 0.9]} />
            <directionalLight position={[2.5, 4, 3]} intensity={1.6} />
            <directionalLight position={[-3, 2, -2]} intensity={0.5} />
            <Cuerpo cuerpo={cuerpo} onMedida={setMedida} />
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
      </div>

      <Panel cuerpo={cuerpo} medida={medida} />
    </div>
  );
}

/* ------------------------------------------------------------- Cuerpo 3D */

function Cuerpo({ cuerpo, onMedida }: { cuerpo: CuerpoBase; onMedida: (m: { ms: number; estaturaCm: number }) => void }) {
  const macro = useVisor((s) => s.macro);
  const locales = useVisor((s) => s.locales);
  const verSegmentos = useVisor((s) => s.verSegmentos);
  const controles = useMemo(() => controlesLocales(cuerpo.meta), [cuerpo]);
  const destino = useRef<Float32Array>(new Float32Array(cuerpo.posiciones.length));

  const geometria = useMemo(() => {
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
    destino.current = new Float32Array(cuerpo.posiciones.length);
    return g;
  }, [cuerpo]);

  useEffect(() => () => geometria.dispose(), [geometria]);

  useEffect(() => {
    const t0 = performance.now();
    const pesos = { ...pesosMacro(macro, cuerpo.sexo), ...pesosLocales(locales, controles) };
    const pos = aplicarMorphs(cuerpo, pesos, destino.current);
    const attr = geometria.getAttribute('position') as BufferAttribute;
    (attr.array as Float32Array).set(pos);
    attr.needsUpdate = true;
    geometria.computeVertexNormals();
    geometria.computeBoundingSphere();
    onMedida({ ms: performance.now() - t0, estaturaCm: estatura(pos) * 100 });
  }, [cuerpo, geometria, macro, locales, controles, onMedida]);

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

/* ------------------------------------------------------------------ Panel */

const TITULO_GRUPO: Record<string, string> = {
  segmento: 'Segmentos (grasa / músculo)',
  torso: 'Torso',
  medida: 'Medidas',
  musculo: 'Músculo',
  grasa: 'Grasa',
};

function Panel({ cuerpo, medida }: { cuerpo: CuerpoBase | null; medida: { ms: number; estaturaCm: number } }) {
  const { sexo, macro, locales, verSegmentos, setSexo, setMacro, setLocal, setVerSegmentos, reiniciar } = useVisor();
  const controles = useMemo(() => (cuerpo ? controlesLocales(cuerpo.meta) : []), [cuerpo]);
  const grupos = useMemo(() => {
    const g: Record<string, ControlLocal[]> = {};
    for (const c of controles) (g[c.grupo] ??= []).push(c);
    return g;
  }, [controles]);

  return (
    <aside className="flex-1 md:landscape:flex-none md:landscape:w-96 min-h-0 overflow-y-auto border-t md:landscape:border-t-0 md:landscape:border-l border-carbon-700 bg-carbon-800">
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
            <p className="text-xs text-humo-500">Visor de prueba · fase 1</p>
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

        {cuerpo && (
          <dl className="grid grid-cols-3 gap-2 text-center">
            <Dato titulo="Estatura" valor={`${medida.estaturaCm.toFixed(1)} cm`} />
            <Dato titulo="Ajuste" valor={`${medida.ms.toFixed(1)} ms`} />
            <Dato titulo="Morphs" valor={String(cuerpo.morphs.length)} />
          </dl>
        )}

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

        <Seccion titulo="Macro (MakeHuman)">
          <Deslizador etiqueta="Músculo" min={0} max={1} paso={0.01} valor={macro.musculo} onChange={(v) => setMacro('musculo', v)} />
          <Deslizador etiqueta="Peso" min={0} max={1} paso={0.01} valor={macro.peso} onChange={(v) => setMacro('peso', v)} />
          <Deslizador etiqueta="Edad (años)" min={25} max={90} paso={1} valor={macro.edad} onChange={(v) => setMacro('edad', v)} />
          <Deslizador etiqueta="Altura" min={0} max={1} paso={0.01} valor={macro.altura} onChange={(v) => setMacro('altura', v)} />
          <Deslizador etiqueta="Proporciones ideales" min={0} max={1} paso={0.01} valor={macro.proporciones} onChange={(v) => setMacro('proporciones', v)} />
          {sexo === 'F' && (
            <Deslizador etiqueta="Copa" min={0} max={1} paso={0.01} valor={macro.copa} onChange={(v) => setMacro('copa', v)} />
          )}
        </Seccion>

        <Seccion titulo="Etnia (se normaliza a 100 %)">
          {(['asiatica', 'caucasica', 'africana'] as const).map((e) => (
            <Deslizador
              key={e}
              etiqueta={{ asiatica: 'Asiática', caucasica: 'Caucásica', africana: 'Africana' }[e]}
              min={0}
              max={1}
              paso={0.01}
              valor={macro.etnia[e]}
              onChange={(v) => setMacro('etnia', { ...macro.etnia, [e]: v })}
            />
          ))}
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

        <p className="text-[11px] text-humo-500">Datos de referencia deportiva, no para fines médicos.</p>
      </div>
    </aside>
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
  return (
    <label className="block">
      <span className="flex justify-between text-xs text-humo-300">
        <span className="truncate pr-2">{etiqueta}</span>
        <span className="tabular-nums text-humo-500">{Number.isInteger(paso) ? valor : valor.toFixed(2)}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={paso}
        value={valor}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-[#8CC63F]"
      />
    </label>
  );
}
