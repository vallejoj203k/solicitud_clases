/**
 * Carga del reproductor incrustado de YouTube.
 *
 * El script se trae una sola vez por pestaña, aunque la pantalla se monte y se
 * desmonte varias veces: YouTube expone una única función global de aviso
 * (`onYouTubeIframeAPIReady`) y volver a pedir el script la pisaría.
 */
let promesa = null;

export function cargarApiYoutube() {
  if (promesa) return promesa;

  promesa = new Promise((resolver, rechazar) => {
    if (window.YT?.Player) return resolver(window.YT);

    const anterior = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      anterior?.();
      resolver(window.YT);
    };

    const etiqueta = document.createElement('script');
    etiqueta.src = 'https://www.youtube.com/iframe_api';
    etiqueta.async = true;
    // Si el gimnasio se queda sin internet -o una red corporativa bloquea
    // YouTube- la pantalla tiene que poder decirlo en vez de quedarse en
    // "cargando" para siempre.
    etiqueta.onerror = () => {
      promesa = null;
      rechazar(new Error('No pudimos cargar el reproductor de YouTube.'));
    };
    document.head.appendChild(etiqueta);
  });

  return promesa;
}

/** 213 -> "3:33". */
export function duracion(segundos) {
  if (!segundos) return '';
  const m = Math.floor(segundos / 60);
  const s = Math.floor(segundos % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}
