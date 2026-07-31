import crypto from 'node:crypto';
import { env } from '../config/env.js';
import { AppError } from '../utils/errores.js';

/**
 * Integración con Wompi (pasarela colombiana: PSE, Nequi, Bancolombia, tarjetas).
 *
 * Se implementa contra el contrato documentado por Wompi:
 *
 *  - Checkout web: se redirige a `${checkoutUrl}` con los datos de la
 *    transacción y una FIRMA DE INTEGRIDAD que impide que alguien cambie el
 *    monto en la URL.
 *        firma = SHA256("<referencia><montoEnCentavos><moneda><secretoIntegridad>")
 *
 *  - Eventos (webhook): Wompi hace POST con el resultado. El cuerpo trae
 *    `signature.properties` (rutas dentro del evento), `timestamp` y
 *    `signature.checksum`.
 *        checksum = SHA256("<valores de las properties concatenados><timestamp><secretoEventos>")
 *    Sin validar esto, cualquiera podría anunciar "ya pagué".
 *
 *  - Consulta directa: GET /v1/transactions/:id para no depender solo del
 *    webhook si se demora o se pierde.
 *
 * Todo lo específico del proveedor vive en este archivo; el resto de la app
 * habla en términos de "aprobado / rechazado / pendiente".
 */

const AMBIENTES = {
  sandbox: { api: 'https://sandbox.wompi.co/v1', checkout: 'https://checkout.wompi.co/p/' },
  produccion: { api: 'https://production.wompi.co/v1', checkout: 'https://checkout.wompi.co/p/' },
};

export function wompiConfigurado() {
  const { llavePublica, secretoIntegridad, secretoEventos } = env.wompi;
  return Boolean(llavePublica && secretoIntegridad && secretoEventos);
}

function urls() {
  // En pruebas automatizadas se levanta un Wompi simulado que habla el mismo
  // contrato; asi se puede verificar el flujo completo sin llaves reales.
  if (env.wompi.urlBasePruebas) {
    return { api: `${env.wompi.urlBasePruebas}/v1`, checkout: `${env.wompi.urlBasePruebas}/checkout` };
  }
  return AMBIENTES[env.wompi.ambiente] ?? AMBIENTES.sandbox;
}

const sha256 = (texto) => crypto.createHash('sha256').update(texto, 'utf8').digest('hex');

/**
 * Firma de integridad del checkout. Wompi la recalcula de su lado y rechaza la
 * transacción si no coincide, así que nadie puede pagar $1.000 por una clase de
 * $25.000 editando la URL.
 */
export function firmaIntegridad({ referencia, montoEnCentavos, moneda = 'COP' }) {
  return sha256(`${referencia}${montoEnCentavos}${moneda}${env.wompi.secretoIntegridad}`);
}

/** Arma la URL del checkout a la que se manda al cliente. */
export function construirCheckout({ referencia, montoCop, correo, urlRetorno }) {
  if (!wompiConfigurado()) {
    throw new AppError('Los pagos en línea no están configurados.', 503, 'WOMPI_NO_CONFIGURADO');
  }

  const montoEnCentavos = Math.round(montoCop * 100);
  const params = new URLSearchParams({
    'public-key': env.wompi.llavePublica,
    currency: 'COP',
    'amount-in-cents': String(montoEnCentavos),
    reference: referencia,
    'signature:integrity': firmaIntegridad({ referencia, montoEnCentavos }),
    'redirect-url': urlRetorno,
  });
  if (correo) params.set('customer-data:email', correo);

  return { url: `${urls().checkout}?${params.toString()}`, montoEnCentavos };
}

/** Lee una ruta tipo "transaction.status" dentro del evento. */
function valorEnRuta(objeto, ruta) {
  return ruta.split('.').reduce((acc, clave) => (acc == null ? acc : acc[clave]), objeto);
}

/**
 * Comprueba que el evento venga de verdad de Wompi.
 * Devuelve true/false; nunca lanza, para que el webhook pueda responder 401 sin
 * exponer detalles.
 */
export function verificarFirmaEvento(evento) {
  const propiedades = evento?.signature?.properties;
  const checksumRecibido = evento?.signature?.checksum;
  const timestamp = evento?.timestamp;
  if (!Array.isArray(propiedades) || !checksumRecibido || timestamp === undefined) return false;

  const concatenado = propiedades.map((ruta) => valorEnRuta(evento.data, ruta) ?? '').join('');
  const esperado = sha256(`${concatenado}${timestamp}${env.wompi.secretoEventos}`);

  // Comparación en tiempo constante: evita filtrar el secreto por temporización.
  const a = Buffer.from(esperado, 'utf8');
  const b = Buffer.from(String(checksumRecibido).toLowerCase(), 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Traduce el estado de Wompi al vocabulario de la app. */
export function traducirEstado(estadoWompi) {
  switch (estadoWompi) {
    case 'APPROVED':
      return 'PAGADO';
    case 'DECLINED':
    case 'ERROR':
    case 'VOIDED':
      return 'RECHAZADO';
    default: // PENDING y cualquier estado nuevo que agreguen
      return 'PENDIENTE';
  }
}

/**
 * Consulta una transacción directamente en la API de Wompi.
 *
 * Se usa cuando el cliente vuelve del checkout: es más rápido y más confiable
 * que esperar el webhook, que puede demorarse o perderse. El webhook sigue
 * siendo la fuente autoritativa para los casos en que el cliente cierra el
 * navegador antes de volver.
 */
export async function consultarTransaccion(idTransaccion) {
  const respuesta = await fetch(`${urls().api}/transactions/${idTransaccion}`, {
    headers: env.wompi.llavePrivada ? { Authorization: `Bearer ${env.wompi.llavePrivada}` } : {},
  });
  if (!respuesta.ok) {
    throw new AppError('No pudimos consultar el pago.', 502, 'WOMPI_NO_RESPONDE');
  }
  const { data } = await respuesta.json();
  return data;
}
