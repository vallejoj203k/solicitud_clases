import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { prisma } from './prisma.js';
import { env } from './env.js';
import { TIPOS_CLASE } from './catalogoInicial.js';
import { normalizarTelefono } from '../utils/codigo.js';

/**
 * Preparación de primer arranque.
 *
 * Un despliegue nuevo levanta con la base vacía: sin disciplinas la pantalla
 * principal no muestra nada y sin un usuario ADMIN el panel es inaccesible.
 * Antes eso solo se arreglaba corriendo el seed a mano, lo que obliga a
 * instalar el CLI de la plataforma; ahora la app se prepara sola al arrancar.
 *
 * Es SOLO-INSERCIÓN e idempotente: nunca borra ni sobrescribe nada, así que
 * correrlo en cada reinicio no toca los datos reales. A diferencia del seed,
 * que borra todo antes de sembrar y por eso no sirve en producción.
 */
export async function bootstrap() {
  const resumen = { tiposCreados: 0, adminCreado: null };

  // --- Disciplinas ---------------------------------------------------------
  // Solo se crean las que falten, comparando por slug: si el administrador
  // editó los precios o los textos desde el panel, se respetan.
  for (const tipo of TIPOS_CLASE) {
    const existe = await prisma.tipoClase.findUnique({ where: { slug: tipo.slug } });
    if (existe) continue;
    await prisma.tipoClase.create({ data: tipo });
    resumen.tiposCreados += 1;
  }

  // --- Administrador -------------------------------------------------------
  const yaHayAdmin = await prisma.usuario.count({ where: { rol: 'ADMIN' } });
  if (yaHayAdmin === 0) {
    const telefono = normalizarTelefono(env.admin.telefono);

    // Si no se configuró ADMIN_PASSWORD generamos una al azar en vez de usar la
    // de ejemplo: dejar "admin123" en un sitio público sería una puerta abierta.
    // Queda impresa en los logs del servicio, que es donde el dueño puede verla.
    const password = process.env.ADMIN_PASSWORD || crypto.randomBytes(9).toString('base64url');
    const generada = !process.env.ADMIN_PASSWORD;

    // El teléfono podría existir ya como cliente; en ese caso lo promovemos.
    await prisma.usuario.upsert({
      where: { telefono },
      update: { rol: 'ADMIN', passwordHash: await bcrypt.hash(password, 10) },
      create: {
        nombre: env.admin.nombre,
        telefono,
        rol: 'ADMIN',
        passwordHash: await bcrypt.hash(password, 10),
      },
    });

    resumen.adminCreado = { telefono, password, generada };
  }

  return resumen;
}

/** Imprime en el log lo que hizo el bootstrap, para poder leerlo desde la consola del hosting. */
export function reportarBootstrap({ tiposCreados, adminCreado }) {
  if (tiposCreados > 0) {
    console.log(`[inicio] Se crearon ${tiposCreados} disciplina(s) por defecto (Running y Spinning).`);
  }

  if (!adminCreado) return;

  const linea = '═'.repeat(62);
  console.log('');
  console.log(linea);
  console.log(' [inicio] No había ningún administrador: se creó uno.');
  console.log('');
  console.log(`   Usuario    : ${adminCreado.telefono}`);
  console.log(`   Contraseña : ${adminCreado.password}`);
  console.log('');
  if (adminCreado.generada) {
    console.log('   Esta contraseña se generó al azar porque no definiste');
    console.log('   ADMIN_PASSWORD. Anótala: no se vuelve a mostrar.');
  }
  console.log('   Entra en /admin/login. Para cambiarla después:');
  console.log('     node server/scripts/admin.mjs crear --telefono <tel> --password "<nueva>"');
  console.log(linea);
  console.log('');
}
