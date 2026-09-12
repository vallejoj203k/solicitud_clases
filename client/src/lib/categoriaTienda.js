/**
 * Colores por categoría de producto, para la etiqueta de cada tarjeta.
 *
 * Es texto libre en el admin -no un menú cerrado-, así que una categoría que
 * no está aquí simplemente sale en gris: nunca es un error, solo se ve más
 * discreta hasta que se agregue su color.
 */
const COLORES = {
  proteína: 'text-volt-500',
  proteina: 'text-volt-500',
  energía: 'text-amber-400',
  energia: 'text-amber-400',
  fuerza: 'text-aqua-500',
  snack: 'text-purple-400',
  recuperación: 'text-alerta',
  recuperacion: 'text-alerta',
  vitaminas: 'text-purple-400',
};

/** Categorías sugeridas al admin, en el orden en que se ven mejor juntas. */
export const CATEGORIAS_SUGERIDAS = ['Proteína', 'Energía', 'Fuerza', 'Snack', 'Recuperación', 'Vitaminas'];

export function colorCategoria(categoria) {
  if (!categoria) return 'text-humo-300';
  return COLORES[categoria.trim().toLowerCase()] ?? 'text-humo-300';
}
