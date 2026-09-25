import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { componerCaptura, compartirODescargar } from './captura';
import { cargarCuerpo } from './cargar';
import { validar } from './cliente';
import { PCT_GRASA_POR_DEFECTO } from './config';
import { Escena } from './Escena';
import { useCliente } from './estadoCliente';
import { useVisor } from './estado';
import type { Medidas } from './medicion';
import { pctGrasaDe } from './objetivos';
import { Panel } from './Panel';
import { borradorObjetivo, estadoSegmentos, tarjetasDe } from './resultados';
import { usarAjuste, usarObjetivo } from './usarAjuste';
import { usarMotor } from './usarMotor';
import type { CuerpoBase } from './tipos';

/**
 * Resultado 3D: el entrenador escribe los datos del bodyscanner y el cuerpo se
 * ajusta solo (Worker); se ve en cuatro modos (grasa y músculo, realista, mapa de
 * calor, comparar con el objetivo), con tarjetas de resultado y captura PNG.
 *
 * Todo se calcula en el navegador y no se guarda nada.
 */

const NOMBRE_VISTA = { grasa: 'Grasa y músculo', realista: 'Realista', calor: 'Mapa de calor', comparar: 'Actual y objetivo' };

export default function PaginaModelo3D() {
  const sexo = useVisor((s) => s.sexo);
  const macro = useVisor((s) => s.macro);
  const locales = useVisor((s) => s.locales);
  const vista = useVisor((s) => s.vista);
  const verAnillos = useVisor((s) => s.verAnillos);
  const ajuste = useVisor((s) => s.ajuste);
  const objetivo = useVisor((s) => s.objetivo);
  const origen = useVisor((s) => s.origen);
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

  // Datos del formulario ya validados (tarjetas y mapa de calor).
  const nombre = useCliente((s) => s.nombre);
  const valores = useCliente((s) => s.valores);
  const evaluacion = useCliente((s) => s.evaluacion);
  const diagnostico = useCliente((s) => s.diagnostico);
  const borrador = useMemo(() => ({ nombre, sexo, valores, evaluacion, diagnostico }), [nombre, sexo, valores, evaluacion, diagnostico]);
  const cliente = useMemo(() => {
    const r = validar(borrador);
    return r.ok ? r.cliente : null;
  }, [borrador]);
  const tarjetas = useMemo(() => (cliente ? tarjetasDe(cliente) : []), [cliente]);
  const estados = useMemo(() => (cliente ? estadoSegmentos(cliente) : null), [cliente]);
  const resumenObjetivo = useMemo(() => {
    const o = borradorObjetivo(borrador);
    if (!o) return null;
    const cg = Number(valores.controlGrasa?.replace(',', '.') || 0);
    const cm = Number(valores.controlMuscular?.replace(',', '.') || 0);
    const kg = (x: number) => `${x > 0 ? '+' : x < 0 ? '−' : ''}${Math.abs(x).toFixed(1).replace('.', ',')} kg`;
    return `Objetivo: ${o.valores.peso.replace('.', ',')} kg con ${o.valores.pctGrasa.replace('.', ',')} % de grasa (grasa ${kg(cg)}, músculo ${kg(cm)}).`;
  }, [borrador, valores.controlGrasa, valores.controlMuscular]);

  // Ajustes (Worker): el cuerpo a los datos y, en "Comparar", el objetivo.
  const medidasModelo = useRef<Medidas | undefined>(undefined);
  usarAjuste(cuerpo, medidasModelo);
  usarObjetivo(cuerpo);

  // Cuerpo a mostrar: los controles del ajuste (o los movidos a mano) y, en las
  // vistas con grasa, el cuerpo sin grasa ajustado (o aproximado con el % de grasa).
  const conGrasa = vista === 'grasa' || vista === 'comparar';
  const pctGrasa = pctGrasaDe(borrador) ?? PCT_GRASA_POR_DEFECTO[sexo];
  const pedido = useMemo(() => {
    if (!cuerpo) return null;
    const magro = origen === 'ajuste' ? ajuste?.magro : null;
    const grasa = !conGrasa ? null : magro ? { controles: { macro: magro.macro, locales: magro.locales } } : { pctGrasa };
    return { cuerpo, macro, locales, grasa, conAnillos: verAnillos };
  }, [cuerpo, macro, locales, conGrasa, pctGrasa, verAnillos, ajuste, origen]);
  const pedidoObjetivo = useMemo(() => {
    if (!cuerpo || vista !== 'comparar' || !objetivo) return null;
    const m = objetivo.magro;
    const grasa = m ? { controles: { macro: m.macro, locales: m.locales } } : null;
    return { cuerpo, macro: objetivo.exterior.macro, locales: objetivo.exterior.locales, grasa, conAnillos: false };
  }, [cuerpo, vista, objetivo]);

  const { resultado, error: errorMotor } = usarMotor(pedido);
  const { resultado: resultadoObjetivo } = usarMotor(pedidoObjetivo);
  const vigente = resultado && cuerpo && resultado.sexo === cuerpo.sexo ? resultado : null;
  const objetivoVigente = vista === 'comparar' && resultadoObjetivo && cuerpo && resultadoObjetivo.sexo === cuerpo.sexo ? resultadoObjetivo : null;
  medidasModelo.current = vigente?.medidas;

  // Captura PNG
  const lienzo = useRef<HTMLCanvasElement | null>(null);
  const [capturando, setCapturando] = useState<string | null>(null);
  const capturar = async () => {
    if (!lienzo.current) return;
    setCapturando('Preparando imagen…');
    try {
      const blob = await componerCaptura(lienzo.current, { nombre: cliente?.nombre, vista: NOMBRE_VISTA[vista], tarjetas });
      const archivo = `resultado-3d${cliente?.nombre ? `-${cliente.nombre.toLowerCase().replace(/[^a-z0-9áéíóúñ]+/gi, '-')}` : ''}.png`;
      const como = await compartirODescargar(blob, archivo);
      setCapturando(como === 'descargada' ? 'Imagen descargada' : null);
    } catch (e) {
      setCapturando(`No se pudo guardar: ${(e as Error).message}`);
    }
    setTimeout(() => setCapturando(null), 2500);
  };

  return (
    <div className="h-dvh flex flex-col md:landscape:flex-row overflow-hidden bg-carbon-900">
      <div className="relative h-[55%] md:landscape:h-full md:landscape:flex-1 min-h-0">
        {cuerpo ? (
          <Canvas
            camera={{ position: [0, 1.0, 3.4], fov: 35 }}
            dpr={[1, 2]}
            gl={{ stencil: true, preserveDrawingBuffer: true }}
            onCreated={({ gl }) => (lienzo.current = gl.domElement)}
          >
            <Escena cuerpo={cuerpo} actual={vigente} objetivo={objetivoVigente} estados={estados} />
          </Canvas>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-humo-500">
            {error ? `No se pudo cargar el modelo: ${error}` : 'Cargando modelo…'}
          </div>
        )}
        {cuerpo && (
          <button
            type="button"
            onClick={capturar}
            disabled={!vigente}
            className="absolute right-3 top-3 rounded-xl border border-carbon-600 bg-carbon-900/80 px-3 py-2 text-xs font-semibold text-humo-100 backdrop-blur hover:border-[#8CC63F] disabled:opacity-50"
          >
            Guardar imagen
          </button>
        )}
        {capturando && (
          <p className="absolute right-3 top-14 rounded-lg bg-carbon-900/90 px-3 py-1.5 text-xs text-humo-300" role="status">
            {capturando}
          </p>
        )}
        {errorMotor && (
          <p className="absolute bottom-3 left-3 right-3 rounded-xl bg-red-900/80 px-3 py-2 text-xs">Error del motor: {errorMotor}</p>
        )}
      </div>

      <Panel
        cuerpo={cuerpo}
        resultado={vigente}
        cliente={cliente}
        tarjetas={tarjetas}
        estados={estados}
        resumenObjetivo={resumenObjetivo}
      />
    </div>
  );
}
