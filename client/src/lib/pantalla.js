import { useCallback, useEffect, useState } from 'react';

/**
 * Pantalla completa.
 *
 * PARA QUÉ. La app vive en la tablet del mostrador y en el televisor del salón,
 * abierta todo el día. La barra de direcciones de Chrome se come una franja de
 * alto que en esta app cuesta caro: la pantalla principal está calculada para
 * caber sin desplazarse, y esa franja es justo lo que la obliga a hacerlo en un
 * teléfono corto.
 *
 * SOLO DONDE EXISTE. En Android hay API de pantalla completa; en el iPhone no
 * -Safari nunca la implementó fuera del vídeo-, así que ahí `disponible` es
 * falso y el botón sencillamente no se dibuja. Es mejor que un botón que no
 * hace nada.
 *
 * Se mira `fullscreenEnabled` y no solo si el método existe, porque dentro de
 * un iframe sin permiso el método está pero la llamada se rechaza.
 */

const raiz = () => document.documentElement;

const pedir = (el) => el.requestFullscreen ?? el.webkitRequestFullscreen;
const soltar = () => document.exitFullscreen ?? document.webkitExitFullscreen;

const activaAhora = () =>
  Boolean(document.fullscreenElement ?? document.webkitFullscreenElement);

const sePuede = () =>
  Boolean(
    (document.fullscreenEnabled ?? document.webkitFullscreenEnabled) && pedir(raiz())
  );

export function usePantallaCompleta() {
  // Se resuelve en el primer render y no cambia: el navegador es el que es.
  const [disponible] = useState(sePuede);
  const [activa, setActiva] = useState(activaAhora);

  // El estado no se puede llevar solo con lo que hace el botón: en Android se
  // sale de pantalla completa con el botón atrás del sistema, y sin escuchar
  // el evento el icono se quedaría al revés.
  useEffect(() => {
    const alCambiar = () => setActiva(activaAhora());
    document.addEventListener('fullscreenchange', alCambiar);
    document.addEventListener('webkitfullscreenchange', alCambiar);
    return () => {
      document.removeEventListener('fullscreenchange', alCambiar);
      document.removeEventListener('webkitfullscreenchange', alCambiar);
    };
  }, []);

  const alternar = useCallback(() => {
    // La promesa se rechaza si el navegador no lo considera un gesto de quien
    // está delante. No hay nada que hacer al respecto y menos que reportar: el
    // botón simplemente no surte efecto.
    if (activaAhora()) soltar()?.call(document)?.catch?.(() => {});
    else pedir(raiz())?.call(raiz())?.catch?.(() => {});
  }, []);

  return { disponible, activa, alternar };
}
