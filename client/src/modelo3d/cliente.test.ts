import { describe, expect, it } from 'vitest';
import { leerNumero, revisarCoherencia, validar, type Borrador } from './cliente';
import { CLIENTES_EJEMPLO } from './clientesEjemplo';

const informe = CLIENTES_EJEMPLO[0].borrador;
const con = (b: Borrador, valores: Record<string, string>): Borrador => ({ ...b, valores: { ...b.valores, ...valores } });

describe('leerNumero', () => {
  it('acepta coma o punto decimal, signo y espacios', () => {
    expect(leerNumero('51,0')).toBe(51);
    expect(leerNumero(' 102.9 ')).toBe(102.9);
    expect(leerNumero('-21,0')).toBe(-21);
    expect(leerNumero('')).toBeUndefined();
    expect(leerNumero('12a')).toBeNaN();
  });
});

describe('validar', () => {
  it('el informe del 21-09 es válido y respeta los valores escritos', () => {
    const r = validar(informe);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const c = r.cliente;
    expect(c.peso).toBe(102.9);
    expect(c.grasa).toBe(33.3);
    expect(c.plg).toBe(69.6);
    expect(c.segmental.musculo.tronco).toBe(31.1);
    expect(c.segmental.troncoCalculado).toBe(false);
    expect(c.control).toEqual({ pesoObjetivo: 67.4, peso: -21, grasa: -21, musculo: 0 });
    expect(c.diagnostico).toBe('Graso muscular');
    expect(c.evaluacion.obe_imc).toBe('alto');
  });

  it('los ejemplos sin tronco lo calculan como resto (y sin porcentaje, lo derivan)', () => {
    const r = validar(CLIENTES_EJEMPLO[1].borrador);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.cliente.segmental.troncoCalculado).toBe(true);
    expect(r.cliente.grasa).toBeCloseTo(78.4 * 0.213, 6);
    expect(r.cliente.segmental.musculo.tronco).toBeGreaterThan(10);
    expect(r.cliente.segmental.grasa.tronco).toBeGreaterThan(3);
    expect(r.cliente.imc).toBeCloseTo(78.4 / 1.75 ** 2, 6);
  });

  it('marca obligatorios, texto que no es número y valores fuera de rango', () => {
    const r = validar(con(informe, { peso: '', estatura: 'ciento', agua: '500' }));
    expect(r.ok).toBe(false);
    expect(r.errores.peso).toBe('Obligatorio');
    expect(r.errores.estatura).toBe('Escribe un número');
    expect(r.errores.agua).toMatch(/entre 5 y 120/);
  });

  it('pide grasa en kg o en porcentaje', () => {
    const r = validar(con(informe, { grasa: '', pctGrasa: '' }));
    expect(r.ok).toBe(false);
    expect(r.errores.grasa).toMatch(/grasa corporal/);
  });

  it('la edad y el metabolismo basal son enteros', () => {
    const r = validar(con(informe, { edad: '23,5' }));
    expect(r.errores.edad).toMatch(/entero/);
  });
});

describe('revisarCoherencia', () => {
  const avisos = (b: Borrador) => {
    const r = validar(b);
    if (!r.ok) throw new Error(JSON.stringify(r.errores));
    return revisarCoherencia(r.cliente, b);
  };

  it('en el informe real solo avisa del peso objetivo imposible', () => {
    const a = avisos(informe);
    expect(a).toHaveLength(1);
    expect(a[0].campos).toEqual(['pesoObjetivo']);
    expect(a[0].texto).toMatch(/67,4 kg.*69,6 kg/);
  });

  it('un número mal tipeado rompe una suma y se avisa', () => {
    // 51,0 escrito como 15,0
    const a = avisos(con(informe, { agua: '15.0' }));
    expect(a.some((x) => x.campos.includes('agua') && /peso libre de grasa/.test(x.texto))).toBe(true);
    // peso con un dígito cambiado
    const b = avisos(con(informe, { peso: '112.9' }));
    expect(b.some((x) => x.campos.includes('peso'))).toBe(true);
  });

  it('avisa si el músculo segmental suma más que el peso libre de grasa', () => {
    const a = avisos(con(informe, { musculo_tronco: '61.1' }));
    expect(a.some((x) => /músculo segmental/.test(x.texto))).toBe(true);
  });

  it('compara cintura/cadera de la cinta con el índice del informe', () => {
    const a = avisos(con(informe, { m_cintura: '80', m_cadera: '110' }));
    expect(a.some((x) => x.campos.includes('cinturaCadera'))).toBe(true);
    const b = avisos(con(informe, { m_cintura: '110', m_cadera: '108' }));
    expect(b.some((x) => x.campos.includes('cinturaCadera'))).toBe(false);
  });
});
