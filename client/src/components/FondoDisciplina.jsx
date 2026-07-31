/**
 * Foto del salón como fondo de la pantalla de reserva.
 *
 * El archivo se resuelve por el slug de la disciplina: `spinning` →
 * /images/spinning.jpg, `running` → /images/running.jpg. Una disciplina nueva
 * solo necesita su foto con el mismo nombre en la carpeta /images de la raíz;
 * si no existe, el `url()` falla en silencio y queda el fondo oscuro de siempre
 * (no aparece un ícono de imagen rota).
 *
 * Cubre toda la pantalla y es `fixed`, así que no se mueve con el scroll: la
 * foto se comporta como un tapiz detrás del contenido.
 *
 * Encima va un velo oscuro parejo. No es decorativo: las dos fotos tienen mucho
 * contraste y sin él los números de los puestos quedarían ilegibles. Si se
 * quiere ver más la foto, subir OPACIDAD_VELO es el único ajuste necesario.
 */
const OPACIDAD_VELO = 'bg-carbon-900/[0.82]';

export default function FondoDisciplina({ slug }) {
  if (!slug) return null;

  return (
    <div aria-hidden="true" className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
      <div
        className="absolute inset-0 bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: `url(/images/${slug}.jpg)` }}
      />
      <div className={`absolute inset-0 ${OPACIDAD_VELO}`} />
    </div>
  );
}
