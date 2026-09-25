import { describe, expect, it } from 'vitest';
import { validar, type Borrador } from './cliente';
import { CLIENTES_EJEMPLO } from './clientesEjemplo';
import { borradorObjetivo, estadoSegmentos, tarjetasDe, tramoDe } from './resultados';
import { ESCALA_IMC } from './config';

const informe = CLIENTES_EJEMPLO[0].borrador;
const cliente = (b: Borrador) => {
  const r = validar(b);
  if (!r.ok) throw new Error(JSON.stringify(r.errores));
  return r.cliente;
};

describe('tarjetas', () => {
  it('IMC en su tramo de la OMS', () => {
    expect(tramoDe(ESCALA_IMC, 17).etiqueta).toBe('Bajo peso');
    expect(tramoDe(ESCALA_IMC, 22).etiqueta).toBe('Normal');
    expect(tramoDe(ESCALA_IMC, 33.6).etiqueta).toBe('Obesidad I');
    expect(tramoDe(ESCALA_IMC, 41).etiqueta).toBe('Obesidad III');
  });

  it('el informe del 21-09 da las seis tarjetas con sus valores', () => {
    const t = Object.fromEntries(tarjetasDe(cliente(informe)).map((x) => [x.clave, x]));
    expect(t.imc.valor).toBe('33,6');
    expect(t.grasa.tramo?.etiqueta).toBe('Alto');
    expect(t.visceral.tramo?.etiqueta).toBe('Alto');
    expect(t.cc.tramo?.etiqueta).toBe('Riesgo alto');
    expect(t.masas.valor).toBe('33,3 · 69,6');
    expect(t.edad.detalle).toBe('8 años menos que la edad real');
  });

  it('la cinta manda sobre el índice cintura-cadera del informe', () => {
    const b = { ...informe, valores: { ...informe.valores, m_cintura: '85', m_cadera: '100' } };
    const t = tarjetasDe(cliente(b)).find((x) => x.clave === 'cc')!;
    expect(t.valor).toBe('0,85');
    expect(t.tramo?.etiqueta).toBe('Normal');
  });
});

describe('mapa de calor', () => {
  it('el informe: grasa alta en todo, músculo de las piernas no bajo', () => {
    const e = estadoSegmentos(cliente(informe));
    for (const s of Object.values(e)) expect(s.grasa.estado).toBe('alto');
    expect(e.pierna_izq.musculo.estado).not.toBe('bajo');
  });

  it('Laura: grasa alta en los brazos', () => {
    const e = estadoSegmentos(cliente(CLIENTES_EJEMPLO[2].borrador));
    expect(e.brazo_izq.grasa.estado).toBe('alto');
    expect(e.brazo_izq.grasa.pct).toBeGreaterThan(45);
  });
});

describe('cuerpo objetivo', () => {
  it('el informe: −21 kg de grasa repartidos en proporción, sin tocar el músculo', () => {
    const o = borradorObjetivo(informe)!;
    expect(Number(o.valores.peso)).toBeCloseTo(81.9, 1);
    expect(Number(o.valores.grasa)).toBeCloseTo(12.3, 1);
    expect(Number(o.valores.pctGrasa)).toBeCloseTo(15.0, 1);
    expect(Number(o.valores.plg)).toBeCloseTo(69.6, 1);
    // 12,3 / 33,3 = 37 % de la grasa de cada segmento
    expect(Number(o.valores.grasa_tronco)).toBeCloseTo(17.3 * (12.3 / 33.3), 1);
    expect(Number(o.valores.musculo_brazo_izq)).toBeCloseTo(3.7, 2);
    expect(Number(o.valores.visceral)).toBeLessThan(13);
    expect(o.valores.m_cintura).toBeUndefined();
    expect(validar(o).ok).toBe(true);
  });

  it('Laura: baja grasa y sube músculo', () => {
    const o = borradorObjetivo(CLIENTES_EJEMPLO[2].borrador)!;
    expect(Number(o.valores.peso)).toBeCloseTo(64.8 - 9.6 + 2, 1);
    expect(Number(o.valores.musculo_pierna_izq)).toBeGreaterThan(6.1);
  });

  it('sin controles no hay objetivo', () => {
    expect(borradorObjetivo(CLIENTES_EJEMPLO[3].borrador)).toBeNull();
  });
});
