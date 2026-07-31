import nodemailer from 'nodemailer';
import { env } from '../config/env.js';
import { formatearLargo } from '../utils/fechas.js';

/**
 * Envío de correos.
 *
 * Si no hay SMTP configurado el servicio queda inactivo: no falla, solo avisa
 * una vez al arrancar. Así el gimnasio puede operar sin correo desde el primer
 * día y activarlo después pegando credenciales, sin tocar código.
 *
 * Un correo que no sale NUNCA debe tumbar una reserva: todos los envíos se
 * hacen "best effort" y los errores se registran, no se propagan.
 */

let transporte = null;
let avisado = false;

function obtenerTransporte() {
  const { host, puerto, usuario, password } = env.smtp;
  if (!host || !usuario || !password) {
    if (!avisado) {
      console.warn('[correo] SMTP no configurado: no se enviarán confirmaciones por correo.');
      avisado = true;
    }
    return null;
  }
  transporte ??= nodemailer.createTransport({
    host,
    port: puerto,
    secure: puerto === 465,
    auth: { user: usuario, pass: password },
  });
  return transporte;
}

export const correoActivo = () => Boolean(env.smtp.host && env.smtp.usuario && env.smtp.password);

async function enviar({ para, asunto, html, texto, adjuntos }) {
  const tx = obtenerTransporte();
  if (!tx || !para) return { enviado: false, motivo: tx ? 'sin-destinatario' : 'sin-configuracion' };

  try {
    await tx.sendMail({
      from: env.smtp.remitente,
      to: para,
      subject: asunto,
      text: texto,
      html,
      attachments: adjuntos,
    });
    return { enviado: true };
  } catch (e) {
    // No se relanza: el correo es un extra, la reserva ya está hecha.
    console.error('[correo] Falló el envío:', e.message);
    return { enviado: false, motivo: e.message };
  }
}

const estilos = {
  cuerpo: 'font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;background:#0F1115;color:#EDEFF3;padding:24px;',
  tarjeta: 'max-width:520px;margin:0 auto;background:#1C2028;border-radius:20px;padding:28px;',
  codigo: 'font-size:34px;font-weight:800;letter-spacing:6px;margin:8px 0 0;color:#C8F751;',
  tenue: 'color:#8A93A3;font-size:13px;margin:0;',
};

/** Confirmación de reserva, con el código de ingreso y el archivo de calendario. */
export async function enviarConfirmacionReserva(reserva, ics) {
  const email = reserva.usuario?.email;
  if (!email) return { enviado: false, motivo: 'sin-destinatario' };

  const cuando = formatearLargo(reserva.clase.inicioEn);
  const clase = reserva.clase.tipoClase.nombre;
  const enlace = `${env.appUrl}/reserva/${reserva.codigo}`;

  const html = `
    <div style="${estilos.cuerpo}">
      <div style="${estilos.tarjeta}">
        <p style="${estilos.tenue}">RESERVA CONFIRMADA</p>
        <h1 style="margin:6px 0 2px;font-size:24px;">${clase}</h1>
        <p style="margin:0 0 18px;font-size:16px;">${cuando}</p>
        <p style="${estilos.tenue}">Tu puesto</p>
        <p style="font-size:22px;font-weight:700;margin:2px 0 18px;">${reserva.puestoCodigo}</p>
        <p style="${estilos.tenue}">Muestra este código en recepción</p>
        <p style="${estilos.codigo}">${reserva.codigo}</p>
        <p style="margin:22px 0 0;">
          <a href="${enlace}" style="color:#C8F751;">Ver o cancelar tu reserva</a>
        </p>
        ${env.gimnasio.direccion ? `<p style="${estilos.tenue}margin-top:18px;">${env.gimnasio.direccion}</p>` : ''}
      </div>
    </div>`;

  const texto = [
    `Reserva confirmada — ${clase}`,
    cuando,
    `Puesto: ${reserva.puestoCodigo}`,
    `Código de ingreso: ${reserva.codigo}`,
    enlace,
  ].join('\n');

  return enviar({
    para: email,
    asunto: `Reserva confirmada · ${clase} · ${cuando}`,
    html,
    texto,
    adjuntos: ics
      ? [{ filename: `clase-${reserva.codigo}.ics`, content: ics, contentType: 'text/calendar' }]
      : undefined,
  });
}

/** Aviso de que una reserva quedó cancelada (por el cliente o por el gimnasio). */
export async function enviarCancelacion(reserva, { porGimnasio = false } = {}) {
  const email = reserva.usuario?.email;
  if (!email) return { enviado: false, motivo: 'sin-destinatario' };

  const cuando = formatearLargo(reserva.clase.inicioEn);
  const clase = reserva.clase.tipoClase.nombre;
  const motivo = porGimnasio
    ? `Lamentamos avisarte que ${env.gimnasio.nombre} canceló esta clase.`
    : 'Cancelaste esta reserva. Tu puesto quedó libre para otra persona.';

  const html = `
    <div style="${estilos.cuerpo}">
      <div style="${estilos.tarjeta}">
        <p style="${estilos.tenue}">RESERVA CANCELADA</p>
        <h1 style="margin:6px 0 2px;font-size:24px;">${clase}</h1>
        <p style="margin:0 0 18px;font-size:16px;">${cuando}</p>
        <p style="margin:0;">${motivo}</p>
        ${
          porGimnasio && env.gimnasio.contacto
            ? `<p style="${estilos.tenue}margin-top:16px;">Escríbenos a ${env.gimnasio.contacto} si necesitas ayuda.</p>`
            : ''
        }
        <p style="margin:22px 0 0;"><a href="${env.appUrl}" style="color:#C8F751;">Reservar otra clase</a></p>
      </div>
    </div>`;

  return enviar({
    para: email,
    asunto: `Reserva cancelada · ${clase} · ${cuando}`,
    html,
    texto: `${motivo}\n${clase} — ${cuando}\n${env.appUrl}`,
  });
}
