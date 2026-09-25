import { useEffect, useMemo, useRef } from 'react';
import { useCliente } from './estadoCliente';
import { useVisor } from './estado';
import { entradaAjusteDe } from './objetivos';
import { iniciar, obtenerMotor } from './usarMotor';
import type { CuerpoBase } from './tipos';

/** Espera tras la última tecla antes de ajustar (el ajuste tarda hasta ~300 ms). */
const ESPERA_MS = 250;

/**
 * Ajusta el cuerpo a lo escrito en el formulario: cada vez que cambia un dato
 * que el solver usa (y ya hay estatura y peso), pide el ajuste al Worker y
 * vuelca el resultado en los controles del visor.
 */
export function usarAjuste(cuerpo: CuerpoBase | null) {
  const sexo = useVisor((s) => s.sexo);
  const aplicarAjuste = useVisor((s) => s.aplicarAjuste);
  const setAjustando = useVisor((s) => s.setAjustando);
  const valores = useCliente((s) => s.valores);
  const entrada = useMemo(() => entradaAjusteDe({ nombre: '', sexo, valores, evaluacion: {} }), [sexo, valores]);
  // Solo se vuelve a ajustar si cambian los objetivos, no cualquier campo del formulario.
  const clave = JSON.stringify(entrada);
  const turno = useRef(0);

  useEffect(() => {
    const mio = ++turno.current;
    if (!cuerpo || cuerpo.sexo !== sexo) return;
    if (!entrada) {
      aplicarAjuste(null);
      return;
    }
    const t = setTimeout(async () => {
      setAjustando(true);
      try {
        await iniciar(cuerpo);
        const r = await obtenerMotor().ajustar(sexo, entrada);
        if (mio === turno.current) aplicarAjuste(r);
      } finally {
        if (mio === turno.current) setAjustando(false);
      }
    }, ESPERA_MS);
    return () => clearTimeout(t);
    // `clave` resume `entrada`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave, cuerpo, sexo]);
}
