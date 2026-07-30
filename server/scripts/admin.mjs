/**
 * Gestión de administradores desde la línea de comandos.
 *
 * El seed crea un admin, pero borra toda la base antes, así que no sirve para
 * arreglar el acceso en producción. Este script trabaja sobre los datos
 * existentes sin tocar nada más.
 *
 *   node server/scripts/admin.mjs listar
 *   node server/scripts/admin.mjs crear --telefono 3001234567 --password "clave" --nombre "Ana"
 *
 * En Railway:  railway run node server/scripts/admin.mjs listar
 */
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';
import '../src/config/env.js';
import { normalizarTelefono } from '../src/utils/codigo.js';

const prisma = new PrismaClient();

/** Convierte --clave valor en un objeto. */
function leerArgumentos(argv) {
  const salida = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (!argv[i].startsWith('--')) continue;
    const clave = argv[i].slice(2);
    const valor = argv[i + 1];
    if (valor === undefined || valor.startsWith('--')) {
      salida[clave] = true;
    } else {
      salida[clave] = valor;
      i += 1;
    }
  }
  return salida;
}

async function listar() {
  const [admins, totalUsuarios] = await Promise.all([
    prisma.usuario.findMany({
      where: { rol: 'ADMIN' },
      select: { id: true, nombre: true, telefono: true, email: true, passwordHash: true, creadoEn: true },
      orderBy: { creadoEn: 'asc' },
    }),
    prisma.usuario.count(),
  ]);

  if (admins.length === 0) {
    console.log('\n⚠ No hay ningún usuario con rol ADMIN en esta base de datos.');
    console.log(`  (la base tiene ${totalUsuarios} usuario(s) en total)`);
    console.log('\n  Por eso el login responde "usuario o contraseña incorrectos":');
    console.log('  no existe a quién autenticar. Crea uno con:\n');
    console.log('    node server/scripts/admin.mjs crear --telefono 3001234567 --password "TU_CLAVE"\n');
    return;
  }

  console.log(`\n${admins.length} administrador(es):\n`);
  for (const a of admins) {
    console.log(`  Nombre    : ${a.nombre}`);
    console.log(`  Usuario   : ${a.telefono}${a.email ? `  ó  ${a.email}` : ''}`);
    console.log(`  Contraseña: ${a.passwordHash ? 'definida (no se puede leer, está hasheada)' : '⚠ SIN DEFINIR — no puede entrar'}`);
    console.log(`  Creado    : ${a.creadoEn.toISOString().slice(0, 16).replace('T', ' ')}`);
    console.log('');
  }
  console.log('  La contraseña está hasheada y no es recuperable. Si no la recuerdas,');
  console.log('  vuelve a correr `crear` con el mismo teléfono para reemplazarla.\n');
}

async function crear(args) {
  const telefono = normalizarTelefono(args.telefono ?? '');
  const password = typeof args.password === 'string' ? args.password : '';

  if (!telefono || telefono.length < 7) {
    throw new Error('Falta --telefono (mínimo 7 dígitos).');
  }
  if (password.length < 6) {
    throw new Error('Falta --password (mínimo 6 caracteres). Enciérralo en comillas si tiene espacios.');
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const nombre = typeof args.nombre === 'string' ? args.nombre : 'Administrador';
  const email = typeof args.email === 'string' ? args.email.toLowerCase() : undefined;

  const existente = await prisma.usuario.findUnique({ where: { telefono } });

  const usuario = await prisma.usuario.upsert({
    where: { telefono },
    // Si el teléfono ya existía (incluso como cliente) lo promovemos a ADMIN y
    // le ponemos la contraseña nueva. Sus reservas anteriores no se tocan.
    update: { rol: 'ADMIN', passwordHash, nombre, ...(email ? { email } : {}) },
    create: { rol: 'ADMIN', passwordHash, nombre, telefono, email },
  });

  const accion = existente
    ? existente.rol === 'ADMIN'
      ? 'Contraseña actualizada'
      : 'Usuario promovido a ADMIN'
    : 'Administrador creado';

  console.log(`\n✔ ${accion}\n`);
  console.log(`  Usuario   : ${usuario.telefono}${usuario.email ? `  ó  ${usuario.email}` : ''}`);
  console.log(`  Nombre    : ${usuario.nombre}`);
  console.log('\n  Ya puedes entrar en /admin/login.\n');
}

const [comando, ...resto] = process.argv.slice(2);
const args = leerArgumentos(resto);

const comandos = { listar, crear };

if (!comandos[comando]) {
  console.log('\nUso:');
  console.log('  node server/scripts/admin.mjs listar');
  console.log('  node server/scripts/admin.mjs crear --telefono <tel> --password "<clave>" [--nombre "<nombre>"] [--email <correo>]\n');
  process.exit(comando ? 1 : 0);
}

comandos[comando](args)
  .catch((e) => {
    console.error(`\n✖ ${e.message}\n`);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
