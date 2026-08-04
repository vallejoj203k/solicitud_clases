/**
 * Gestión de administradores desde la línea de comandos.
 *
 * El seed crea un admin, pero borra toda la base antes, así que no sirve para
 * arreglar el acceso en producción. Este script trabaja sobre los datos
 * existentes sin tocar nada más.
 *
 *   node server/scripts/admin.mjs listar
 *   node server/scripts/admin.mjs crear --telefono 3001234567 --password "clave" --nombre "Ana"
 *   node server/scripts/admin.mjs revisar-puestos
 *   node server/scripts/admin.mjs revisar-nombres
 *
 * En Railway:  railway run node server/scripts/admin.mjs listar
 */
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';
import '../src/config/env.js';
import { normalizarTelefono } from '../src/utils/codigo.js';
import { expandirLayout } from '../src/utils/layout.js';

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

/**
 * Busca reservas cuyo puesto ya no existe en el salón de su clase. Puede pasar
 * si se cambia la distribución del salón después de haber vendido cupos: la
 * reserva sigue siendo válida pero su puesto no se puede dibujar en el mapa.
 */
async function revisarPuestos() {
  const clases = await prisma.clase.findMany({
    include: {
      tipoClase: true,
      reservas: {
        where: { estado: { in: ['CONFIRMADA', 'ASISTIO', 'NO_SHOW'] } },
        include: { usuario: { select: { nombre: true, telefono: true } } },
      },
    },
  });

  const huerfanas = [];
  for (const clase of clases) {
    const { codigos } = expandirLayout(clase.layoutOverride ?? clase.tipoClase.layoutPuestos);
    for (const r of clase.reservas) {
      if (!codigos.includes(r.puestoCodigo)) {
        huerfanas.push({
          codigo: r.codigo,
          puesto: r.puestoCodigo,
          clase: `${clase.tipoClase.nombre} ${clase.inicioEn.toISOString().slice(0, 16).replace('T', ' ')}`,
          cliente: `${r.usuario.nombre} (${r.usuario.telefono})`,
        });
      }
    }
  }

  if (huerfanas.length === 0) {
    console.log('\n✔ Todas las reservas apuntan a un puesto que existe en su salón.\n');
    return;
  }

  console.log(`\n⚠ ${huerfanas.length} reserva(s) sobre puestos que ya no existen:\n`);
  for (const h of huerfanas) {
    console.log(`  ${h.codigo}  puesto ${h.puesto.padEnd(4)}  ${h.clase}  ${h.cliente}`);
  }
  console.log('\n  Estas reservas siguen contando para el cupo pero no se dibujan en el mapa.');
  console.log('  Contacta a cada persona y reubícala: cancela su reserva desde el panel');
  console.log('  (Clases → la clase → Cancelar) y vuelve a reservarle un puesto válido.\n');
}

/**
 * ¿Se colapsaron varias personas en un mismo cliente?
 *
 * EL PROBLEMA QUE DIAGNOSTICA. La identidad del cliente es el TELÉFONO
 * (`Usuario.telefono` es único) y `upsertCliente` hace un upsert sobre él. Si
 * al pasar al software las reservas que ya existían en papel se escribió el
 * mismo teléfono para todo el mundo -un relleno, porque el gimnasio no pide
 * número-, todas las reservas quedaron colgando del MISMO usuario y, peor, cada
 * una fue pisando su nombre con el siguiente que se escribiera. Por eso se
 * repite un nombre en muchos puestos.
 *
 * QUÉ MIRA. Solo lee, no toca nada. Informa de tres cosas:
 *   - qué clientes tienen un número de reservas desproporcionado, que es la
 *     firma del colapso;
 *   - si esas reservas traen `nombreInvitado`, que es donde SÍ sobreviviría el
 *     nombre real de cada persona (el campo "el puesto es para otra persona");
 *   - el orden en que se crearon, que nunca se pierde: está en `creadoEn`.
 */
async function revisarNombres({ desde, tope = 1 }) {
  const limite = Math.max(1, Number(tope));
  const reservas = await prisma.reserva.findMany({
    where: {
      estado: { notIn: ['CANCELADA', 'EXPIRADA'] },
      ...(desde ? { creadoEn: { gte: new Date(desde) } } : {}),
    },
    include: {
      usuario: { select: { id: true, nombre: true, telefono: true } },
      clase: { select: { id: true, inicioEn: true, tipoClase: { select: { nombre: true } } } },
    },
    orderBy: { creadoEn: 'asc' },
  });

  if (!reservas.length) {
    console.log('\nNo hay reservas activas que revisar.\n');
    return;
  }

  // La señal del colapso es MISMA PERSONA + MISMA CLASE. Que alguien tenga
  // veinte reservas repartidas en veinte clases distintas es un cliente fiel,
  // no un problema; que tenga cuatro puestos en la clase del martes a las 6 es
  // que ahí se metieron cuatro personas distintas bajo un mismo teléfono.
  const grupos = new Map();
  for (const r of reservas) {
    const llave = `${r.clase.id}|${r.usuarioId}`;
    const grupo = grupos.get(llave) ?? [];
    grupo.push(r);
    grupos.set(llave, grupo);
  }

  const conNombreInvitado = reservas.filter((r) => r.nombreInvitado).length;
  const sospechosos = [...grupos.values()]
    .filter((g) => g.length > limite)
    .sort((a, b) => b.length - a.length);

  const afectadas = sospechosos.reduce((n, g) => n + g.length, 0);

  console.log(`\n${reservas.length} reservas activas.`);
  console.log(`Con nombre guardado aparte (campo de acompañante): ${conNombreInvitado}.\n`);

  if (!sospechosos.length) {
    console.log(`✔ Nadie tiene más de ${limite} puesto(s) en una misma clase.`);
    console.log('  No hay señal de nombres colapsados bajo un mismo teléfono.\n');
    return;
  }

  console.log(`⚠ ${sospechosos.length} caso(s) de una misma persona con varios puestos en la misma clase`);
  console.log(`  (${afectadas} reservas en total):\n`);

  for (const g of sospechosos) {
    const u = g[0].usuario;
    const clase = `${g[0].clase.tipoClase.nombre} ${g[0].clase.inicioEn.toISOString().slice(0, 16).replace('T', ' ')}`;
    const conNombre = g.filter((r) => r.nombreInvitado).length;
    console.log(`  ${clase}  ·  ${u.nombre} (tel ${u.telefono})  ·  ${g.length} puestos`);
    for (const r of g) {
      const cuando = r.creadoEn.toISOString().slice(0, 16).replace('T', ' ');
      console.log(
        `      ${cuando}  ${r.codigo}  puesto ${String(r.puestoCodigo).padEnd(4)}` +
          (r.nombreInvitado ? `  → ${r.nombreInvitado}` : '')
      );
    }
    if (conNombre) console.log(`      (${conNombre} de ${g.length} conservan el nombre real)`);
    console.log('');
  }

  if (conNombreInvitado > 0) {
    console.log('  HAY NOMBRES RECUPERABLES: las líneas con "→" guardan para quién es el puesto.');
    console.log('  Esas no hay que volver a preguntarlas.\n');
  } else {
    console.log('  LOS NOMBRES NO ESTÁN EN LA BASE. Al compartir teléfono, cada reserva pisó');
    console.log('  el nombre de la anterior y solo sobrevivió el último que se escribió.');
    console.log('');
    console.log('  Lo que SÍ está intacto: la clase, el puesto y el orden en que se agregaron');
    console.log('  (la fecha de cada línea). No hay que rehacer las reservas: basta con poner');
    console.log('  el nombre correcto en cada una, y ese orden dice cuál fue cuál.\n');
  }
}

const [comando, ...resto] = process.argv.slice(2);
const args = leerArgumentos(resto);

const comandos = {
  listar,
  crear,
  'revisar-puestos': revisarPuestos,
  'revisar-nombres': revisarNombres,
};

if (!comandos[comando]) {
  console.log('\nUso:');
  console.log('  node server/scripts/admin.mjs listar');
  console.log('  node server/scripts/admin.mjs crear --telefono <tel> --password "<clave>" [--nombre "<nombre>"] [--email <correo>]');
  console.log('  node server/scripts/admin.mjs revisar-puestos');
  console.log('  node server/scripts/admin.mjs revisar-nombres [--tope 3] [--desde 2026-08-01]\n');
  process.exit(comando ? 1 : 0);
}

comandos[comando](args)
  .catch((e) => {
    console.error(`\n✖ ${e.message}\n`);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
