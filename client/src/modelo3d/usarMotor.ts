import { useEffect, useRef, useState } from 'react';
import { wrap, type Remote } from 'comlink';
import type { ApiMotor, PedidoGrasa, ResultadoMotor } from './motor.worker';
import type { ControlesMacro } from './controles';
import type { CuerpoBase } from './tipos';

let motor: Remote<ApiMotor> | null = null;
const iniciados = new WeakMap<CuerpoBase, Promise<void>>();

/** Un solo Worker para toda la página (se crea al primer uso). */
export function obtenerMotor(): Remote<ApiMotor> {
  if (!motor) {
    const w = new Worker(new URL('./motor.worker.ts', import.meta.url), { type: 'module' });
    motor = wrap<ApiMotor>(w);
  }
  return motor;
}

export function iniciar(cuerpo: CuerpoBase): Promise<void> {
  let p = iniciados.get(cuerpo);
  if (!p) {
    p = obtenerMotor().iniciar(cuerpo);
    iniciados.set(cuerpo, p);
  }
  return p;
}

interface Pedido {
  cuerpo: CuerpoBase;
  macro: ControlesMacro;
  locales: Record<string, number>;
  /** null: sin cuerpo sin grasa (la vista de grasa está apagada). */
  grasa: PedidoGrasa | null;
  conAnillos: boolean;
}

/**
 * Pide al Worker el cuerpo deformado y sus medidas cada vez que cambian los
 * pesos. Si llegan cambios mientras hay un cálculo en curso (un deslizador que
 * se arrastra), se guarda solo el último y se calcula al terminar: nunca hay
 * más de un pedido en vuelo.
 */
export function usarMotor(pedido: Pedido | null): { resultado: ResultadoMotor | null; error: string | null } {
  const [resultado, setResultado] = useState<ResultadoMotor | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pendiente = useRef<Pedido | null>(null);
  const enVuelo = useRef(false);
  const vivo = useRef(true);

  useEffect(() => {
    vivo.current = true;
    return () => {
      vivo.current = false;
    };
  }, []);

  useEffect(() => {
    if (!pedido) return;
    pendiente.current = pedido;
    if (enVuelo.current) return;

    const lanzar = async () => {
      enVuelo.current = true;
      while (pendiente.current) {
        const p = pendiente.current;
        pendiente.current = null;
        try {
          await iniciar(p.cuerpo);
          const r = await obtenerMotor().calcular(p.cuerpo.sexo, p.macro, p.locales, p.grasa, p.conAnillos);
          if (vivo.current) {
            setResultado(r);
            setError(null);
          }
        } catch (e) {
          if (vivo.current) setError((e as Error).message);
        }
      }
      enVuelo.current = false;
    };
    void lanzar();
    // El pedido se arma con useMemo en quien llama: cambia solo cuando cambia algo.
  }, [pedido]);

  return { resultado, error };
}
