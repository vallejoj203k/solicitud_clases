/**
 * Foto del salón como cabecera de la pantalla de reserva.
 *
 * El archivo se resuelve por el slug de la disciplina: `spinning` →
 * /images/spinning.jpg, `running` → /images/running.jpg. Una disciplina nueva
 * solo necesita su foto con el mismo nombre en la carpeta /images de la raíz;
 * si no existe, el `url()` falla en silencio y queda el fondo oscuro de siempre
 * (no aparece un ícono de imagen rota).
 *
 * Decisiones deliberadas:
 *  - Ocupa solo la franja superior y se funde con el fondo, en vez de teñir toda
 *    la pantalla. Las dos fotos tienen mucho contraste y detrás del mapa de
 *    puestos dejaban los números difíciles de leer.
 *  - Por eso la franja es más baja al elegir puesto (`altura="banda"`): termina
 *    justo encima de la cuadrícula, que necesita fondo limpio.
 *  - Es `absolute`, no `fixed`: se va con el scroll. Si se quedara pegada, el
 *    mapa terminaría pasando por encima de la foto al bajar.
 */
const ALTURAS = {
  hero: 'h-[44vh] max-h-[380px]',
  banda: 'h-[188px]',
};

export default function FondoDisciplina({ slug, altura = 'hero' }) {
  if (!slug) return null;

  return (
    <div
      aria-hidden="true"
      className={`absolute inset-x-0 top-0 -z-10 overflow-hidden pointer-events-none ${ALTURAS[altura]}`}
    >
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: `url(/images/${slug}.jpg)` }}
      />
      <div className="absolute inset-0 bg-gradient-to-b from-carbon-900/35 via-carbon-900/65 to-carbon-900" />
    </div>
  );
}
