import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../config/prisma.js';
import { asyncHandler, AppError } from '../utils/errores.js';
import { firmarToken } from '../middleware/auth.js';
import { normalizarTelefono } from '../utils/codigo.js';

export const authRouter = Router();

const loginSchema = z.object({
  usuario: z.string().trim().min(3), // telefono o email del admin
  password: z.string().min(4),
});

authRouter.post(
  '/admin/login',
  asyncHandler(async (req, res) => {
    const { usuario, password } = loginSchema.parse(req.body);
    const telefono = normalizarTelefono(usuario);

    const admin = await prisma.usuario.findFirst({
      where: {
        rol: 'ADMIN',
        OR: [{ telefono: telefono || '__no__' }, { email: usuario.toLowerCase() }],
      },
    });

    // Mismo mensaje para usuario inexistente y password incorrecta: no revelamos
    // cuales telefonos existen.
    const ok = admin?.passwordHash ? await bcrypt.compare(password, admin.passwordHash) : false;
    if (!ok) throw new AppError('Usuario o contraseña incorrectos.', 401, 'CREDENCIALES_INVALIDAS');

    res.json({
      token: firmarToken({ sub: admin.id, rol: 'ADMIN', nombre: admin.nombre }, 'ADMIN'),
      usuario: { id: admin.id, nombre: admin.nombre, rol: admin.rol },
    });
  })
);

authRouter.get(
  '/me',
  asyncHandler(async (req, res) => {
    if (!req.usuario?.sub) return res.status(401).json({ error: 'No autenticado.', codigo: 'NO_AUTENTICADO' });
    const usuario = await prisma.usuario.findUnique({
      where: { id: req.usuario.sub },
      select: { id: true, nombre: true, rol: true, telefono: true },
    });
    if (!usuario) return res.status(401).json({ error: 'No autenticado.', codigo: 'NO_AUTENTICADO' });
    res.json(usuario);
  })
);
