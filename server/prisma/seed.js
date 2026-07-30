/**
 * Datos de prueba para poder recorrer el flujo completo apenas se levanta el
 * proyecto: dos disciplinas, instructores, clases de los proximos 10 dias y
 * algunas reservas ya hechas para que el mapa de puestos no se vea vacio.
 *
 *   npm run db:seed
 */
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';
import { env } from '../src/config/env.js';
import { desdeFechaHoraLocal, proximosDias } from '../src/utils/fechas.js';
import { expandirLayout } from '../src/utils/layout.js';
import { generarCodigoReserva } from '../src/utils/codigo.js';

const prisma = new PrismaClient();

const LAYOUT_SPINNING = {
  titulo: 'TARIMA · INSTRUCTOR',
  numeracion: 'porFila',
  pasilloDespuesDeCol: 3, // pasillo central entre la columna 3 y la 4
  filas: [
    { label: 'A', puestos: 6, nota: 'Primera fila' },
    { label: 'B', puestos: 6 },
    { label: 'C', puestos: 6 },
    { label: 'D', puestos: 6 },
  ],
};

const LAYOUT_RUNNING = {
  titulo: 'PANTALLAS · FRENTE',
  numeracion: 'continua', // trotadoras numeradas 1..12
  filas: [
    { label: 'F1', puestos: 4, nota: 'Frente' },
    { label: 'F2', puestos: 4 },
    { label: 'F3', puestos: 4 },
  ],
};

const CLIENTES_DEMO = [
  { nombre: 'Laura Gómez', telefono: '3101234567' },
  { nombre: 'Andrés Rincón', telefono: '3129876543' },
  { nombre: 'Mariana Ruiz', telefono: '3005558899' },
  { nombre: 'Camilo Pérez', telefono: '3157772211' },
  { nombre: 'Valentina Torres', telefono: '3183334455' },
  { nombre: 'Sebastián Díaz', telefono: '3216667788' },
  { nombre: 'Daniela Moreno', telefono: '3012223344' },
  { nombre: 'Juan Esteban Cruz', telefono: '3145556677' },
  { nombre: 'Paula Cárdenas', telefono: '3023334455' },
  { nombre: 'Felipe Navarro', telefono: '3116669900' },
  { nombre: 'Isabella Quintero', telefono: '3138881122' },
  { nombre: 'Tomás Restrepo', telefono: '3171114488' },
  { nombre: 'Sofía Bermúdez', telefono: '3194447733' },
  { nombre: 'Ricardo Salgado', telefono: '3202225566' },
  { nombre: 'Natalia Osorio', telefono: '3229997744' },
  { nombre: 'Miguel Ángel Fajardo', telefono: '3243336611' },
  { nombre: 'Carolina Vélez', telefono: '3105558822' },
  { nombre: 'Esteban Lozano', telefono: '3122229944' },
  { nombre: 'Gabriela Pineda', telefono: '3007773355' },
  { nombre: 'Julián Cortés', telefono: '3164441199' },
];

// Generador pseudoaleatorio con semilla fija: el seed produce siempre los
// mismos datos, lo que hace reproducibles las pruebas manuales.
let semilla = 20260730;
function aleatorio() {
  semilla = (semilla * 1664525 + 1013904223) % 4294967296;
  return semilla / 4294967296;
}

async function main() {
  console.log('› Limpiando datos anteriores...');
  await prisma.reserva.deleteMany();
  await prisma.clase.deleteMany();
  await prisma.instructor.deleteMany();
  await prisma.tipoClase.deleteMany();
  await prisma.usuario.deleteMany();

  console.log('› Creando administrador...');
  await prisma.usuario.create({
    data: {
      nombre: env.admin.nombre,
      telefono: env.admin.telefono,
      email: 'admin@gimnasio.com',
      rol: 'ADMIN',
      passwordHash: await bcrypt.hash(env.admin.password, 10),
    },
  });

  console.log('› Creando tipos de clase...');
  const spinning = await prisma.tipoClase.create({
    data: {
      slug: 'spinning',
      nombre: 'Spinning',
      descripcion: 'Ritmo, música alta y 45 minutos que se sienten como 10.',
      color: '#4CE0E0',
      icono: 'bike',
      precioCop: 25000,
      orden: 1,
      layoutPuestos: LAYOUT_SPINNING,
    },
  });

  const running = await prisma.tipoClase.create({
    data: {
      slug: 'running',
      nombre: 'Running',
      descripcion: 'Series, cuestas y trote continuo guiado por un coach.',
      color: '#C8F751',
      icono: 'run',
      precioCop: 22000,
      orden: 0,
      layoutPuestos: LAYOUT_RUNNING,
    },
  });

  console.log('› Creando instructores...');
  const instructores = await Promise.all(
    ['Sara Villalba', 'Nicolás Ospina', 'Kelly Mendoza', 'Diego Ariza'].map((nombre) =>
      prisma.instructor.create({ data: { nombre } })
    )
  );

  console.log('› Creando clientes de prueba...');
  const clientes = await Promise.all(
    CLIENTES_DEMO.map((c) => prisma.usuario.create({ data: { ...c, rol: 'CLIENTE' } }))
  );

  console.log('› Programando clases de los próximos 10 días...');
  const dias = proximosDias(10);
  const programacion = [
    { tipo: running, horas: ['06:00', '18:30'], cupo: 12, duracion: 60 },
    { tipo: spinning, horas: ['07:00', '12:15', '19:00'], cupo: 24, duracion: 45 },
  ];

  const clasesCreadas = [];
  for (const fecha of dias) {
    const [a, m, d] = fecha.split('-').map(Number);
    const diaSemana = new Date(Date.UTC(a, m - 1, d)).getUTCDay();
    if (diaSemana === 0) continue; // domingo cerrado

    for (const { tipo, horas, cupo, duracion } of programacion) {
      for (const hora of horas) {
        const inicioEn = desdeFechaHoraLocal(fecha, hora);
        if (inicioEn.getTime() <= Date.now()) continue; // no sembrar clases pasadas

        clasesCreadas.push(
          await prisma.clase.create({
            data: {
              tipoClaseId: tipo.id,
              instructorId: instructores[Math.floor(aleatorio() * instructores.length)].id,
              inicioEn,
              duracionMin: duracion,
              cupoMaximo: cupo,
              precioCop: tipo.precioCop,
              // Un puesto fuera de servicio en algunas clases para ver el estado
              // "bloqueado" en el mapa.
              puestosBloqueados: aleatorio() < 0.2 ? [tipo.slug === 'spinning' ? 'C4' : '7'] : [],
            },
          })
        );
      }
    }
  }

  console.log(`› ${clasesCreadas.length} clases creadas. Sembrando reservas...`);
  const layouts = {
    [spinning.id]: expandirLayout(LAYOUT_SPINNING).codigos,
    [running.id]: expandirLayout(LAYOUT_RUNNING).codigos,
  };

  let reservas = 0;
  for (const clase of clasesCreadas) {
    // Ocupacion variable (0% a 75%) para que se vean clases vacias, medias y casi llenas.
    const objetivo = Math.floor(aleatorio() * clase.cupoMaximo * 0.75);
    const disponibles = layouts[clase.tipoClaseId].filter(
      (c) => !clase.puestosBloqueados.includes(c)
    );
    const barajado = [...disponibles].sort(() => aleatorio() - 0.5);
    const elegidos = barajado.slice(0, objetivo);
    const clientesBarajados = [...clientes].sort(() => aleatorio() - 0.5);

    for (let i = 0; i < elegidos.length && i < clientesBarajados.length; i += 1) {
      const pagado = aleatorio() < 0.65;
      await prisma.reserva.create({
        data: {
          codigo: generarCodigoReserva(),
          claseId: clase.id,
          usuarioId: clientesBarajados[i].id,
          puestoCodigo: elegidos[i],
          montoCop: clase.precioCop,
          estadoPago: pagado ? 'PAGADO' : 'PENDIENTE',
          metodoPago: pagado ? (aleatorio() < 0.5 ? 'efectivo' : 'transferencia') : null,
          pagoActualizadoEn: pagado ? new Date() : null,
        },
      });
      reservas += 1;
    }
  }

  console.log(`✔ Listo: ${clasesCreadas.length} clases y ${reservas} reservas.`);
  console.log(`  Admin → usuario: ${env.admin.telefono}  contraseña: ${env.admin.password}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
