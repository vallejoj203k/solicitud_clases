import crypto from 'node:crypto';

// Sin I, O, 0, 1 para que no se confundan al dictarlos en recepcion.
const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function generarCodigoReserva(longitud = 6) {
  const bytes = crypto.randomBytes(longitud);
  let salida = '';
  for (let i = 0; i < longitud; i += 1) {
    salida += ALFABETO[bytes[i] % ALFABETO.length];
  }
  return salida;
}

/** Normaliza un telefono colombiano a solo digitos, quitando +57 e indicativos. */
export function normalizarTelefono(valor) {
  const digitos = String(valor || '').replace(/\D/g, '');
  if (digitos.length === 12 && digitos.startsWith('57')) return digitos.slice(2);
  if (digitos.length === 11 && digitos.startsWith('57')) return digitos.slice(2);
  return digitos;
}
