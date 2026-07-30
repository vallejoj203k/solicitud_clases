import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { AppError } from '../utils/errores.js';

export function firmarToken(payload, rol) {
  return jwt.sign(payload, env.jwtSecret, {
    expiresIn: rol === 'ADMIN' ? env.jwtExpiraAdmin : env.jwtExpiraCliente,
  });
}

function leerToken(req) {
  const cabecera = req.headers.authorization || '';
  if (cabecera.startsWith('Bearer ')) return cabecera.slice(7).trim();
  return null;
}

/** Adjunta req.usuario si hay un token valido. No falla si no lo hay. */
export function auth(req, _res, next) {
  const token = leerToken(req);
  if (!token) return next();
  try {
    req.usuario = jwt.verify(token, env.jwtSecret);
  } catch {
    // Token invalido o vencido: se trata como visitante anonimo.
  }
  next();
}

export function requiereAdmin(req, _res, next) {
  if (!req.usuario) return next(new AppError('Debes iniciar sesión.', 401, 'NO_AUTENTICADO'));
  if (req.usuario.rol !== 'ADMIN') return next(new AppError('No tienes permisos.', 403, 'SIN_PERMISO'));
  next();
}

/**
 * El cliente no tiene contrasena: al reservar por primera vez recibe un token
 * de larga duracion que queda en su dispositivo. Ese token es lo unico que le
 * permite ver y cancelar sus propias reservas.
 */
export function requiereCliente(req, _res, next) {
  if (!req.usuario?.sub) return next(new AppError('Sesión no encontrada.', 401, 'NO_AUTENTICADO'));
  next();
}
