/**
 * Valores diarios de referencia (%VD) para la ficha nutricional: los mismos
 * de cualquier etiqueta real (Res. 810/2021 - FDA), no un número inventado
 * por producto. Sirven para la columna "%VD" de la tabla y para el largo de
 * las barras de proteína/carbohidratos/grasas.
 */
const VD = {
  caloriasKcal: 2000,
  proteinaG: 50,
  carbohidratosG: 300,
  azucaresG: 50,
  grasasTotalesG: 78,
  sodioMg: 2300,
};

/** `null` si el dato no viene o el campo no tiene un valor diario definido. */
export function porcentajeVD(campo, valor) {
  const referencia = VD[campo];
  if (!referencia || valor == null) return null;
  return Math.round((valor / referencia) * 100);
}
