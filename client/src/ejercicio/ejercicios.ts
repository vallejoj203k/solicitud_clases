/**
 * Ejercicios con conteo por cámara. Cada uno tiene su dirección
 * (`/ejercicio/<slug>`), que es la que lleva el código QR pegado en la máquina
 * (se imprimen desde Admin → Ejercicios).
 */
export interface Ejercicio {
  slug: string;
  nombre: string;
  /** Dónde se pega el QR. */
  equipo: string;
  /** Cómo poner el celular y pararse, en pasos cortos. */
  preparacion: string[];
}

export const EJERCICIOS: Ejercicio[] = [
  {
    slug: 'sentadilla',
    nombre: 'Sentadilla libre',
    equipo: 'Rack de sentadilla libre',
    preparacion: [
      'Pon el celular vertical en el soporte, a la altura de la cadera, a unos 2,5 a 3 metros del rack.',
      'Párate de lado a la cámara (de perfil): así se mide mejor la profundidad y la espalda.',
      'Que se vea tu cuerpo entero, de los pies a la cabeza, también con la barra.',
      'Cuando la pantalla diga «¡Listo!», haz tu serie. Al terminar, quédate de pie unos segundos o toca «Terminar serie».',
    ],
  },
];

export const ejercicioDe = (slug: string | undefined) => EJERCICIOS.find((e) => e.slug === slug);
