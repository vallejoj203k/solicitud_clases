import { useEffect, useMemo, useRef, type MutableRefObject } from 'react';
import { useCliente } from './estadoCliente';
import { useVisor } from './estado';
import type { Medidas } from './medicion';
import { entradaAjusteDe } from './objetivos';
import { borradorObjetivo } from './resultados';
import { iniciar, obtenerMotor } from './usarMotor';
import type { CuerpoBase } from './tipos';

/** Campos que no son objetivos pero cambian el ajuste (cuerpo sin grasa y prior de músculo). */
const CAMPOS_COMPOSICION = /^(musculo_|grasa_|plg$|masaMuscular$|grasa$|pctGrasa$)/;
const datosDeComposicion = (v: Record<string, string>) => Object.entries(v).filter(([k]) => CAMPOS_COMPOSICION.test(k));

/** Espera tras la última tecla antes de ajustar (el ajuste tarda hasta ~300 ms). */
const ESPERA_MS = 250;

/** Medidas del modelo que "Editar un valor" sostiene al cambiar otra. */
function medidasParaMantener(m: Medidas | undefined): Record<string, number> | undefined {
  if (!m) return undefined;
  const out: Record<string, number> = { hombros: m.hombrosCm, entrepierna: m.entrepiernaCm };
  for (const [n, cm] of Object.entries(m.circunferenciasCm)) out[`circ:${n}`] = cm;
  return out;
}

/**
 * Ajusta el cuerpo a lo escrito en el formulario: cada vez que cambia un dato
 * que el solver usa (y ya hay estatura y peso), pide el ajuste al Worker y
 * vuelca el resultado en los controles del visor.
 *
 * `medidasModelo` apunta a las medidas del cuerpo que se está mostrando: en el
 * modo "Editar un valor" se toman en el momento del cambio para sostenerlas.
 */
export function usarAjuste(cuerpo: CuerpoBase | null, medidasModelo: MutableRefObject<Medidas | undefined>) {
  const sexo = useVisor((s) => s.sexo);
  const aplicarAjuste = useVisor((s) => s.aplicarAjuste);
  const setAjustando = useVisor((s) => s.setAjustando);
  const valores = useCliente((s) => s.valores);
  const entrada = useMemo(() => entradaAjusteDe({ nombre: '', sexo, valores, evaluacion: {} }), [sexo, valores]);
  // Solo se vuelve a ajustar si cambian los datos que usa el ajuste (objetivos y
  // composición), no cualquier campo del formulario.
  const clave = JSON.stringify(entrada) + JSON.stringify(datosDeComposicion(valores));
  const turno = useRef(0);

  useEffect(() => {
    const mio = ++turno.current;
    if (!cuerpo || cuerpo.sexo !== sexo) return;
    if (!entrada) {
      aplicarAjuste(null);
      return;
    }
    // Se toman ya (antes del ajuste nuevo): son las del cuerpo que el entrenador está viendo.
    const { modoMedidas, origen } = useVisor.getState();
    const mantener = modoMedidas === 'editar' && origen === 'ajuste' ? medidasParaMantener(medidasModelo.current) : undefined;
    const t = setTimeout(async () => {
      setAjustando(true);
      try {
        await iniciar(cuerpo);
        // En dos pasos: el cuerpo completo se muestra apenas está (en un teléfono
        // lento se nota) y el cuerpo sin grasa llega después a refinar la vista.
        const borrador = { nombre: '', sexo, valores, evaluacion: {} };
        const exterior = await obtenerMotor().ajustarExterior(borrador, mantener);
        if (mio !== turno.current) return;
        if (!exterior) return aplicarAjuste(null);
        aplicarAjuste(exterior);
        const completo = await obtenerMotor().ajustarSinGrasa(borrador, exterior);
        if (mio === turno.current) aplicarAjuste(completo);
      } finally {
        if (mio === turno.current) setAjustando(false);
      }
    }, ESPERA_MS);
    return () => clearTimeout(t);
    // `clave` resume `entrada`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave, cuerpo, sexo]);
}

/**
 * Cuerpo objetivo para "Comparar": los mismos datos con los controles de grasa y
 * músculo del informe aplicados (ver borradorObjetivo). Solo se calcula en esa vista.
 */
export function usarObjetivo(cuerpo: CuerpoBase | null) {
  const sexo = useVisor((s) => s.sexo);
  const vista = useVisor((s) => s.vista);
  const setObjetivo = useVisor((s) => s.setObjetivo);
  const valores = useCliente((s) => s.valores);
  const borrador = useMemo(() => borradorObjetivo({ nombre: '', sexo, valores, evaluacion: {} }), [sexo, valores]);
  const clave = JSON.stringify(borrador);
  const turno = useRef(0);

  useEffect(() => {
    const mio = ++turno.current;
    if (vista !== 'comparar' || !cuerpo || cuerpo.sexo !== sexo) return;
    if (!borrador) {
      setObjetivo(null);
      return;
    }
    const t = setTimeout(async () => {
      await iniciar(cuerpo);
      const r = await obtenerMotor().ajustarCliente(borrador);
      if (mio === turno.current) setObjetivo(r);
    }, ESPERA_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave, cuerpo, sexo, vista]);
}
