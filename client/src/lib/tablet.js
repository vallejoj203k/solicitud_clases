/**
 * La pantalla de la tablet del salón.
 *
 * QUÉ ES: el mismo inicio de siempre —Running, Spinning y Música— pero servido
 * en una dirección que no aparece enlazada en ninguna parte. El inicio público
 * ya no lleva a la música: pedir canciones dejó de hacerse desde casa y pasó a
 * hacerse en el salón, en la tablet que el gimnasio deja puesta.
 *
 * HASTA DÓNDE PROTEGE: hasta donde protege no estar enlazada, y ni un paso más.
 * Cualquier dirección del cliente viaja dentro del JavaScript que se le manda a
 * todo el mundo, así que quien se ponga a mirarlo la encuentra. Es suficiente
 * para lo que hay en juego —lo peor que puede pasar si alguien la descubre es
 * que pida una canción— y a cambio no le pone ninguna puerta a quien sí está en
 * el salón: llega, busca y pide. Si algún día hiciera falta de verdad, la forma
 * correcta no es una dirección más larga, es un PIN.
 *
 * Para cambiarla, se cambia aquí y se vuelve a abrir en la tablet.
 */
export const RUTA_TABLET = 'salon-k7m3q9';

/** El inicio de la tablet: el que sí tiene Música. */
export const INICIO_TABLET = `/${RUTA_TABLET}`;

/** Buscar y pedir canciones, colgando del inicio de la tablet. */
export const MUSICA_TABLET = `/${RUTA_TABLET}/musica`;

const CLAVE_TABLET = 'gimnasioEsTablet';

/**
 * Recuerda, en ESTE dispositivo, que su inicio es el de la tablet del salón.
 *
 * POR QUÉ HACE FALTA: desde el inicio de la tablet se navega a pantallas que
 * también usa cualquier cliente desde su casa -reservar una clase, ver la
 * tienda, sus reservas-, y esas pantallas tienen un solo botón de "volver al
 * inicio" para las dos audiencias. Sin esta marca, ese botón siempre manda a
 * "/" y la tablet pierde su inicio -con Música- cada vez que alguien entra a
 * una clase o a la tienda. Con la marca puesta, `rutaInicio()` sabe volver
 * adonde salió.
 *
 * Se guarda en `localStorage` -no en la sesión- porque es una propiedad del
 * dispositivo, no de una visita: la tablet se queda encendida días enteros y
 * el navegador se puede reiniciar sin que deje de ser la tablet del salón.
 */
export function marcarTablet() {
  try {
    localStorage.setItem(CLAVE_TABLET, '1');
  } catch {
    // Sin localStorage (privado, bloqueado): "volver" cae al inicio público,
    // que sigue siendo una pantalla válida, solo sin el atajo a Música.
  }
}

function esTablet() {
  try {
    return localStorage.getItem(CLAVE_TABLET) === '1';
  } catch {
    return false;
  }
}

/** El inicio al que debe volver "volver al inicio" desde cualquier pantalla. */
export function rutaInicio() {
  return esTablet() ? INICIO_TABLET : '/';
}
