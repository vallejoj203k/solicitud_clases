/**
 * Reduce una foto a una URI de datos (base64) antes de mandarla al servidor.
 *
 * NO HAY SUBIDA A UN BUCKET: la foto viaja dentro del JSON y se guarda tal
 * cual en la fila del producto. Para que eso no pese ni tarde, se reduce en
 * el propio navegador -como cualquier foto de celular puede pasar de 4000px
 * de lado, sin esto un solo producto pesaría varios megabytes-.
 */
const LADO_MAXIMO = 1000;
const CALIDAD = 0.82;

/** @param {File} archivo @returns {Promise<string>} data:image/webp;base64,... */
export async function archivoAFotoReducida(archivo) {
  const bitmap = await createImageBitmap(archivo);
  try {
    const escala = Math.min(1, LADO_MAXIMO / Math.max(bitmap.width, bitmap.height));
    const ancho = Math.max(1, Math.round(bitmap.width * escala));
    const alto = Math.max(1, Math.round(bitmap.height * escala));

    const lienzo = document.createElement('canvas');
    lienzo.width = ancho;
    lienzo.height = alto;
    lienzo.getContext('2d').drawImage(bitmap, 0, 0, ancho, alto);

    return lienzo.toDataURL('image/webp', CALIDAD);
  } finally {
    bitmap.close?.();
  }
}
