import type { Borrador, ClaveEvaluacion, Evaluacion } from './cliente';

/**
 * Clientes de prueba para llenar el formulario de un clic. El primero es el
 * informe real del 21-09-2026 (sin nombre); los otros tres son los de la
 * especificación del proyecto.
 */
type Ejemplo = { titulo: string; borrador: Borrador };

const todo = (e: Evaluacion): Partial<Record<ClaveEvaluacion, Evaluacion>> => ({
  nut_proteina: e,
  nut_minerales: e,
  nut_grasa: e,
  peso_peso: e,
  peso_musculo: e,
  peso_grasa: e,
  obe_imc: e,
  obe_pct_grasa: e,
});

const seg = (m: [number, number, number | null, number, number], g: [number, number, number | null, number, number]) => {
  const claves = ['brazo_izq', 'brazo_der', 'tronco', 'pierna_izq', 'pierna_der'];
  const out: Record<string, string> = {};
  claves.forEach((k, i) => {
    if (m[i] !== null) out[`musculo_${k}`] = String(m[i]);
    if (g[i] !== null) out[`grasa_${k}`] = String(g[i]);
  });
  return out;
};

export const CLIENTES_EJEMPLO: Ejemplo[] = [
  {
    titulo: 'Informe 21-09 (hombre, 102,9 kg)',
    borrador: {
      nombre: '',
      sexo: 'M',
      valores: {
        edad: '23',
        estatura: '175.0',
        agua: '51.0',
        proteina: '13.9',
        minerales: '4.7',
        grasa: '33.3',
        plg: '69.6',
        peso: '102.9',
        masaMuscular: '39.8',
        imc: '33.6',
        pctGrasa: '32.4',
        cinturaCadera: '1.0',
        grasaSubcutanea: '28.8',
        ...seg([3.7, 3.6, 31.1, 10.8, 11.1], [2.0, 2.0, 17.3, 4.7, 4.6]),
        visceral: '13',
        pesoObjetivo: '67.4',
        controlPeso: '-21.0',
        controlGrasa: '-21.0',
        controlMuscular: '0.0',
        metabolismoBasal: '1873',
        evaluacionSalud: '71',
        edadCorporal: '15',
      },
      evaluacion: todo('alto'),
      diagnostico: 'Graso muscular',
    },
  },
  {
    titulo: 'Carlos Rodríguez (ejemplo)',
    borrador: {
      nombre: 'Carlos Rodríguez',
      sexo: 'M',
      valores: {
        edad: '28',
        estatura: '175',
        peso: '78.4',
        pctGrasa: '21.3',
        masaMuscular: '35.1',
        visceral: '8',
        cinturaCadera: '0.89',
        ...seg([3.62, 3.71, null, 9.85, 9.92], [1.12, 1.08, null, 2.64, 2.61]),
        controlGrasa: '-5.4',
        controlMuscular: '0.5',
      },
      evaluacion: {},
    },
  },
  {
    titulo: 'Laura Gómez (ejemplo)',
    borrador: {
      nombre: 'Laura Gómez',
      sexo: 'F',
      valores: {
        edad: '34',
        estatura: '162',
        peso: '64.8',
        pctGrasa: '37.7',
        masaMuscular: '21.6',
        visceral: '12',
        cinturaCadera: '0.92',
        ...seg([1.82, 1.86, null, 6.1, 6.2], [1.9, 1.9, null, 4.1, 4.2]),
        controlGrasa: '-9.6',
        controlMuscular: '2.0',
      },
      evaluacion: {},
    },
  },
  {
    titulo: 'Caso extremo (ejemplo)',
    borrador: {
      nombre: 'Caso extremo',
      sexo: 'M',
      valores: {
        edad: '45',
        estatura: '175',
        peso: '103',
        pctGrasa: '34',
        visceral: '16',
        cinturaCadera: '1.02',
        m_pecho: '112',
        m_cintura: '110',
        m_cadera: '108',
        ...seg([3.9, 4.0, null, 10.2, 10.3], [2.4, 2.4, null, 4.6, 4.6]),
      },
      evaluacion: {},
    },
  },
];
