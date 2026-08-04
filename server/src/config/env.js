import dotenv from 'dotenv';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '../../..');

// El .env vive en la raiz del monorepo para compartirlo entre client y server.
// En Railway las variables llegan por el entorno y no hay archivo: dotenv
// simplemente no encuentra nada y no pisa lo ya definido.
for (const candidato of [path.join(rootDir, '.env'), path.join(rootDir, 'server/.env')]) {
  if (fs.existsSync(candidato)) dotenv.config({ path: candidato });
}

const requeridas = ['DATABASE_URL'];
const faltantes = requeridas.filter((k) => !process.env[k]);
if (faltantes.length) {
  console.error(`[config] Faltan variables de entorno obligatorias: ${faltantes.join(', ')}`);
  console.error('[config] Copia .env.example a .env y completalo.');
  process.exit(1);
}

// Railway define estas variables en todos sus despliegues. Las miramos para no
// depender de que alguien se acuerde de poner NODE_ENV=production: si no, la app
// arrancaria en modo desarrollo y firmaria los tokens con el secreto de ejemplo,
// que esta publicado en el repositorio y serviria para falsificar una sesion de
// administrador.
const enPlataforma = Boolean(
  process.env.RAILWAY_ENVIRONMENT ||
    process.env.RAILWAY_ENVIRONMENT_NAME ||
    process.env.RAILWAY_PROJECT_ID ||
    process.env.RAILWAY_SERVICE_ID
);

const esProduccion = process.env.NODE_ENV === 'production' || enPlataforma;

if (esProduccion && !process.env.JWT_SECRET) {
  console.error('');
  console.error('═════════════════════════════════════════════════════════════════');
  console.error(' [config] Falta JWT_SECRET y esto es un despliegue real.');
  console.error('');
  console.error(' Sin esa variable los tokens se firmarian con el secreto de');
  console.error(' ejemplo, que esta publicado en el repositorio: cualquiera podria');
  console.error(' falsificar una sesion de administrador. El servidor no arranca.');
  console.error('');
  console.error(' Genera uno y agregalo a las variables del servicio:');
  console.error("   node -e \"console.log(require('crypto').randomBytes(48).toString('hex'))\"");
  console.error('═════════════════════════════════════════════════════════════════');
  console.error('');
  process.exit(1);
}

export const env = {
  esProduccion,
  puerto: Number(process.env.PORT || 4000),
  databaseUrl: process.env.DATABASE_URL,
  jwtSecret: process.env.JWT_SECRET || 'dev-secret-no-usar-en-produccion',
  jwtExpiraAdmin: process.env.JWT_EXPIRES_ADMIN || '12h',
  jwtExpiraCliente: process.env.JWT_EXPIRES_CLIENTE || '90d',
  corsOrigins: (process.env.CORS_ORIGINS || 'http://localhost:5173')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),
  appUrl: process.env.APP_URL || 'http://localhost:5173',
  tzGimnasio: process.env.TZ_GIMNASIO || 'America/Bogota',
  rootDir,
  clientDist: path.join(rootDir, 'client/dist'),
  // Horas antes del inicio hasta las que el cliente puede cancelar solo.
  // Pasado ese punto tiene que hablar con recepcion; el admin siempre puede.
  // Ocho por decision del gimnasio: da margen a revender el puesto de una clase
  // de la manana avisando la noche anterior.
  horasLimiteCancelacion: Number(process.env.HORAS_LIMITE_CANCELACION ?? 8),

  // Cuantos puestos puede tomar una misma persona en una misma clase. Mas de
  // uno porque una pareja va junta y paga uno solo; con tope para que nadie
  // acapare el salon. Cada puesto es una reserva con su propio codigo.
  maxPuestosPorPersona: Math.max(1, Number(process.env.MAX_PUESTOS_POR_PERSONA ?? 4)),

  // Correo saliente. Si no esta configurado, las notificaciones se desactivan
  // solas y el resto de la app sigue funcionando igual.
  smtp: {
    host: process.env.SMTP_HOST || null,
    puerto: Number(process.env.SMTP_PORT || 587),
    usuario: process.env.SMTP_USER || null,
    password: process.env.SMTP_PASSWORD || null,
    remitente: process.env.SMTP_FROM || 'Reservas <no-reply@gimnasio.com>',
  },

  // Como se cobra. `modo`:
  //   "manual"        -> la reserva nace confirmada y se cobra en recepcion
  //   "wompi"         -> el cliente paga en la pasarela antes de confirmarse
  //   "transferencia" -> el cliente transfiere a la llave del gimnasio y
  //                      recepcion confirma; el puesto queda apartado mientras
  //                      tanto, igual que con la pasarela
  // Si se pide un modo pero falta su configuracion, se cae a "manual" para no
  // dejar la app sin poder reservar.
  pagos: {
    modo: ['wompi', 'transferencia'].includes(process.env.PAGO_MODO)
      ? process.env.PAGO_MODO
      : 'manual',
    // Minutos que se le guarda el puesto a quien esta pagando.
    minutosParaPagar: Number(process.env.MINUTOS_PARA_PAGAR ?? 15),
  },

  // Datos que se le muestran al cliente para transferir. La llave es lo unico
  // obligatorio: sin ella el modo "transferencia" no se activa.
  transferencia: {
    llave: process.env.TRANSFERENCIA_LLAVE || null,
    titular: process.env.TRANSFERENCIA_TITULAR || null,
    entidad: process.env.TRANSFERENCIA_ENTIDAD || null,
    // Ruta a la imagen del QR dentro de /public, p. ej. "/images/qr.jpg".
    qr: process.env.TRANSFERENCIA_QR || null,
  },

  wompi: {
    ambiente: process.env.WOMPI_AMBIENTE === 'produccion' ? 'produccion' : 'sandbox',
    llavePublica: process.env.WOMPI_LLAVE_PUBLICA || null,
    llavePrivada: process.env.WOMPI_LLAVE_PRIVADA || null,
    secretoIntegridad: process.env.WOMPI_SECRETO_INTEGRIDAD || null,
    secretoEventos: process.env.WOMPI_SECRETO_EVENTOS || null,
    // Solo para pruebas automatizadas: apunta la integracion a un Wompi simulado.
    urlBasePruebas: process.env.WOMPI_URL_PRUEBAS || null,
  },

  gimnasio: {
    nombre: process.env.GIMNASIO_NOMBRE || 'el gimnasio',
    direccion: process.env.GIMNASIO_DIRECCION || '',
    contacto: process.env.GIMNASIO_CONTACTO || '',
  },

  // Musica desde YouTube. Sin `apiKey` la busqueda se apaga sola y la pantalla
  // lo dice, en vez de fallar con un error tecnico.
  //
  // OJO CON LA CUOTA: la API gratuita da 10.000 unidades al dia y una busqueda
  // cuesta 100, o sea ~100 busquedas diarias. Por eso el servidor cachea por
  // texto normalizado (ver youtube.service.js) y el catalogo de la pantalla se
  // arma con listas de reproduccion, que cuestan 1.
  youtube: {
    apiKey: process.env.YOUTUBE_API_KEY || null,
    // Listas publicas cuyo contenido se muestra como catalogo para ojear.
    // Separadas por coma. Se ven sin buscar y casi no gastan cuota.
    listas: (process.env.YOUTUBE_LISTAS || '')
      .split(',')
      .map((l) => l.trim())
      .filter(Boolean),
    // Region para el ranking de resultados y para descartar los videos
    // bloqueados en el pais.
    region: process.env.YOUTUBE_REGION || 'CO',
    // Tope de duracion: sin esto se cuela un "mix de 2 horas" y la fila se
    // congela hasta que alguien la salte a mano.
    maxDuracionSeg: Number(process.env.YOUTUBE_MAX_DURACION_SEG ?? 600),
    // Solo para pruebas automatizadas: apunta a una API de YouTube simulada,
    // igual que WOMPI_URL_PRUEBAS con la pasarela.
    urlBasePruebas: process.env.YOUTUBE_URL_PRUEBAS || null,
  },

  admin: {
    telefono: process.env.ADMIN_TELEFONO || '3001234567',
    password: process.env.ADMIN_PASSWORD || 'admin123',
    nombre: process.env.ADMIN_NOMBRE || 'Administrador',
  },
};
