# Reservas de clases — Running & Spinning

App web full-stack para reservar puesto en clases de gimnasio. Mobile-first: desde la
pantalla principal una reserva son **3 toques** (horario → puesto → confirmar), y entrando
por la disciplina, 4.

- **Cliente**: sin registro ni contraseña. Elige horario, elige puesto en un mapa tipo
  cine/avión, deja nombre y teléfono la primera vez y listo. Recibe un código + QR para el
  check-in en recepción y puede agregar la clase a su calendario (`.ics`).
- **Administrador**: entra con contraseña desde el candado de la pantalla principal.
  Resumen del día, gestión de horarios, lista de inscritos por clase, registro manual de
  pagos, reporte exportable a CSV e historial de clientes.

---

## Stack

| Capa | Tecnología |
| --- | --- |
| Frontend | React 18 + Vite + TailwindCSS + React Router + TanStack Query |
| Backend | Node.js + Express (API REST) |
| Base de datos | PostgreSQL |
| ORM | Prisma |
| Auth | JWT (roles `CLIENTE` y `ADMIN`) |

Monorepo con npm workspaces: `client/` y `server/` tienen su propio `package.json` y se
instalan con un solo `npm install` desde la raíz.

---

## Puesta en marcha local

Requisitos: Node 20+ y un PostgreSQL accesible.

```bash
git clone <repo> && cd solicitud_clases
npm install                    # instala client + server y genera el Prisma Client

cp .env.example .env           # y edita DATABASE_URL
npm run db:migrate             # crea las tablas y los índices
npm run db:seed                # datos de prueba (clases, horarios, reservas)

npm run dev                    # API en :4000 y frontend en :5173
```

Abre <http://localhost:5173>.

**Credenciales del admin sembradas** (configurables en `.env`):

| Usuario | Contraseña |
| --- | --- |
| `3001234567` | `admin123` |

> El seed **borra todos los datos** antes de sembrar. Es para desarrollo, no lo corras en
> producción con datos reales.

### Scripts

| Comando | Qué hace |
| --- | --- |
| `npm run dev` | API + frontend en paralelo |
| `npm run build` | Compila el frontend y genera el Prisma Client |
| `npm start` | Aplica migraciones pendientes y arranca el servidor (producción) |
| `npm run db:migrate` | Crea/aplica migraciones en desarrollo |
| `npm run db:deploy` | Aplica migraciones existentes (producción) |
| `npm run db:seed` | Reinicia y siembra datos de prueba |
| `npm run db:reset` | Borra la base, re-migra y siembra |
| `npm run db:studio` | Prisma Studio |
| `npm run admin:listar` | Muestra los administradores que existen en la base |
| `npm run admin:crear -- --telefono <tel> --password "<clave>"` | Crea un admin o le cambia la contraseña |

> El `.env` vive en la raíz para compartirlo entre `client` y `server`. Como el CLI de
> Prisma solo busca el `.env` junto al schema, los scripts de base de datos pasan por
> `server/scripts/prisma.mjs`, que carga la configuración y luego delega en `prisma`.

---

## Modelo de datos

```
Usuario     id, nombre, telefono (único), email?, rol(CLIENTE|ADMIN), passwordHash?, notas
TipoClase   id, slug, nombre, descripcion, color, icono, layoutPuestos(JSON), precioCop, orden, activo
Instructor  id, nombre, foto?, activo
Clase       id, tipoClaseId, instructorId?, inicioEn(UTC), duracionMin, cupoMaximo,
            precioCop, layoutOverride(JSON)?, puestosBloqueados[], estado(ACTIVA|CANCELADA), notas
Reserva     id, codigo(único), claseId, usuarioId, puestoCodigo,
            estado(CONFIRMADA|CANCELADA|ASISTIO|NO_SHOW),
            estadoPago(PENDIENTE|PAGADO|RECHAZADO), montoCop, metodoPago?, pagoRef?,
            pagoPayload?, pagoActualizadoEn?, creadoEn, canceladoEn?
```

### No hay tabla `Puesto`

El mapa de puestos vive como JSON en `TipoClase.layoutPuestos` y la ocupación **se deriva
de las reservas activas**. Las razones:

1. **Una sola fuente de verdad.** Una columna `Puesto.estado = 'ocupado'` puede
   desincronizarse de la tabla `Reserva`; derivarla hace imposible esa inconsistencia.
2. **Menos filas.** No se generan 24 registros por cada clase creada.
3. **Sigue siendo flexible.** `Clase.puestosBloqueados` cubre "la bici B3 está dañada hoy",
   y `Clase.layoutOverride` cubre "esta clase se dicta en el salón grande".

Si más adelante hace falta metadata por puesto individual (precio distinto por fila, por
ejemplo), se puede añadir al JSON del layout sin migrar datos.

### Formato del layout

```jsonc
{
  "titulo": "TARIMA · INSTRUCTOR",     // rótulo que se dibuja arriba del mapa
  "numeracion": "porFila",             // "porFila" → A1, A2…  |  "continua" → 1, 2, 3…
  "pasilloDespuesDeCol": 3,            // separador visual entre la columna 3 y la 4
  "filas": [
    { "label": "A", "puestos": 6, "nota": "Primera fila" },
    { "label": "B", "puestos": 6, "offset": 1 }   // offset = columnas vacías al inicio
  ]
}
```

El componente `MapaPuestos` **no interpreta este JSON**: el servidor lo expande
(`server/src/utils/layout.js`) y envía las filas con el código y el estado de cada puesto
ya resueltos. Añadir un salón con otra distribución es cambiar el JSON, sin tocar código
del frontend. Para previsualizar un layout: `POST /api/admin/layouts/preview`.

---

## Concurrencia: dos personas tocando el mismo puesto

Hay dos candados, a propósito:

1. **Lock de fila sobre la clase.** `crearReserva` abre una transacción y hace
   `SELECT id FROM "Clase" WHERE id = $1 FOR UPDATE`. Eso serializa las reservas *de esa
   misma clase*, de modo que el conteo de cupo no queda obsoleto entre el `SELECT` y el
   `INSERT`. Reservas de clases distintas no se bloquean entre sí.

2. **Índice único parcial en Postgres** (`prisma/migrations/*_indice_puesto_unico`):

   ```sql
   CREATE UNIQUE INDEX "reserva_puesto_activo_unico"
     ON "Reserva" ("claseId", "puestoCodigo")
     WHERE "estado" <> 'CANCELADA';
   ```

   Es la línea de defensa real: aunque alguien escriba por fuera del servicio, la base
   rechaza el duplicado. Prisma reporta `P2002` y el middleware lo traduce a
   `409 PUESTO_OCUPADO`; el frontend refresca el mapa y muestra el puesto ya tomado.
   El `WHERE` hace que cancelar una reserva libere el puesto automáticamente.

Verificado con 10 peticiones simultáneas al mismo puesto: 1 × `201`, 9 × `409`, una sola
fila en la base.

---

## Pagos

No hay pasarela conectada. El cliente paga en recepción y el administrador marca el pago
desde el panel (`efectivo`, `transferencia`, `datáfono`, `cortesía`).

La estructura ya está lista para enchufar **Wompi** o **Stripe** sin migrar datos:
`Reserva` guarda `estadoPago`, `metodoPago`, `pagoRef` (id de la transacción externa) y
`pagoPayload` (respuesta cruda del proveedor). En `server/src/services/pago.service.js`
están los dos puntos de extensión:

- `iniciarPagoOnline()` — crear la transacción y devolver la URL de checkout.
- `registrarResultadoExterno()` — lo que llamaría el webhook tras validar la firma.

El panel, los reportes y el CSV ya leen de esos mismos campos.

---

## Estructura

```
├── client/
│   └── src/
│       ├── api/client.js          Cliente HTTP + manejo de errores
│       ├── components/
│       │   ├── MapaPuestos.jsx    Mapa de puestos reutilizable (grid dinámico)
│       │   ├── CarruselDias.jsx   Carrusel horizontal de 7 días
│       │   ├── TarjetaHorario.jsx Horario con barra de ocupación
│       │   ├── Iconos.jsx         SVG en línea, sin dependencias
│       │   └── ui.jsx             Botón, Chip, Hoja inferior, Insignia, inputs…
│       ├── lib/{sesion,formato}.js
│       └── pages/
│           ├── Home · Reservar · Reserva · MisReservas
│           └── admin/ Login · Layout · Dashboard · Clases · ClaseDetalle · Pagos · Clientes
└── server/
    ├── prisma/{schema.prisma, migrations/, seed.js}
    └── src/
        ├── config/{env,prisma}.js
        ├── middleware/{auth,errores}.js
        ├── routes/{public,auth,admin}.routes.js
        ├── services/
        │   ├── reserva.service.js         Creación de reservas y concurrencia
        │   ├── disponibilidad.service.js  Cupos y expansión del mapa
        │   ├── clase.service.js           CRUD de horarios (incluye creación en lote)
        │   ├── pago.service.js            Pagos (extensible a Wompi/Stripe)
        │   └── reporte.service.js         Dashboard, reportes, clientes
        └── utils/{fechas,layout,ics,csv,codigo,errores}.js
```

### Zona horaria

Las clases se guardan en UTC y se muestran en `TZ_GIMNASIO` (por defecto
`America/Bogota`). `server/src/utils/fechas.js` calcula el desplazamiento con `Intl` en vez
de asumir `-05:00`, así que el código sigue siendo correcto si el gimnasio opera en una
zona con horario de verano.

---

## API

### Público

| Método | Ruta | Descripción |
| --- | --- | --- |
| `GET` | `/api/inicio` | Disciplinas con sus próximos horarios + los 7 días |
| `GET` | `/api/tipos-clase` | Catálogo de disciplinas |
| `GET` | `/api/clases?tipo=&desde=&hasta=` | Clases con cupos |
| `GET` | `/api/clases/:id/disponibilidad` | Mapa de puestos con el estado de cada uno |
| `POST` | `/api/reservas` | Crear reserva → devuelve la reserva y el token del cliente |
| `GET` | `/api/reservas/:codigo` | Detalle por código |
| `GET` | `/api/reservas/:codigo/calendario.ics` | Archivo de calendario |
| `GET` | `/api/mis-reservas` | Reservas del dispositivo (token de cliente) |
| `POST` | `/api/reservas/:codigo/cancelar` | Cancelar la propia reserva |
| `GET` | `/api/salud` | Healthcheck (lo usa Railway) |

### Admin — requiere `Authorization: Bearer <token>` de rol `ADMIN`

| Método | Ruta | Descripción |
| --- | --- | --- |
| `POST` | `/api/auth/admin/login` | Login |
| `GET` | `/api/admin/dashboard` | Métricas del día, próximas clases y alertas |
| `GET/POST` | `/api/admin/clases` | Listar / crear |
| `POST` | `/api/admin/clases/lote` | Crear una programación semanal completa |
| `PATCH/DELETE` | `/api/admin/clases/:id` | Editar / eliminar (solo sin reservas) |
| `POST` | `/api/admin/clases/:id/cancelar` | Cancelar clase y sus reservas |
| `GET` | `/api/admin/clases/:id/reservas` | Inscritos con puesto y estado de pago |
| `PATCH` | `/api/admin/reservas/:id/pago` | Marcar pago |
| `POST` | `/api/admin/reservas/:id/cancelar` | Cancelar reserva |
| `POST` | `/api/admin/reservas/:id/asistencia` | Check-in |
| `GET` | `/api/admin/reportes/pagos[.csv]` | Reporte filtrable y exportación |
| `GET` | `/api/admin/clientes[/:id]` | Clientes e historial |

### Sesiones

- **Cliente**: al reservar por primera vez recibe un JWT de larga duración (90 días) que
  queda en `localStorage`. No hay contraseña; ese token es lo único que le permite ver y
  cancelar *sus* reservas, y lo que evita volver a pedirle nombre y teléfono.
- **Admin**: JWT de 12 horas obtenido con usuario y contraseña.

Una persona no puede tener dos puestos activos en la misma clase (evita reservas
duplicadas por doble toque y el acaparamiento de bicicletas).

---

## Despliegue en Railway

La configuración por defecto es **un solo servicio**: Express sirve el build estático de
React. Un dominio, sin CORS, sin variable de API, más barato.

### Pasos

1. **Crea el proyecto** en Railway desde el repositorio de GitHub.
2. **Agrega PostgreSQL**: *New → Database → Add PostgreSQL*.
3. **Enlaza la base al servicio**. En las variables del servicio de la app:

   ```
   DATABASE_URL = ${{Postgres.DATABASE_URL}}
   ```

4. **Configura el resto de variables**:

   | Variable | Valor |
   | --- | --- |
   | `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` |
   | `JWT_SECRET` | cadena larga y aleatoria (**obligatoria en producción**) |
   | `NODE_ENV` | `production` |
   | `APP_URL` | `https://tu-app.up.railway.app` |
   | `TZ_GIMNASIO` | `America/Bogota` |
   | `ADMIN_TELEFONO` | teléfono del administrador |
   | `ADMIN_PASSWORD` | contraseña del administrador |
   | `ADMIN_NOMBRE` | nombre del administrador |

   Genera el secreto con:

   ```bash
   node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
   ```

   `PORT` lo inyecta Railway; no lo definas a mano.

5. **Comandos** (ya vienen en `railway.json`, no hay que tocarlos):

   | | |
   | --- | --- |
   | Build | `npm run build` |
   | Start | `npm start` |
   | Healthcheck | `/api/salud` |

   `npm start` corre `prisma migrate deploy` antes de levantar el servidor, así que **cada
   despliegue aplica las migraciones pendientes solo**.

   > El build **no** debe repetir `npm ci`: Nixpacks ya instala las dependencias en su
   > propia fase, y un segundo `npm ci` falla con `EBUSY` al intentar borrar
   > `node_modules/.cache`, que el builder tiene montado como caché.
   >
   > Vite y Tailwind son devDependencies y con `NODE_ENV=production` npm las omitiría, así
   > que el `.npmrc` de la raíz lleva `include=dev` para forzar su instalación.

6. **Genera el dominio**: *Settings → Networking → Generate Domain*.

7. **Listo.** En el primer arranque, si la base está vacía, la app crea sola las dos
   disciplinas y un usuario administrador. Las credenciales quedan impresas en los logs
   del servicio:

   ```
   ══════════════════════════════════════════════════════════════
    [inicio] No había ningún administrador: se creó uno.

      Usuario    : 3001234567
      Contraseña : EjWCGDQeLeZV
   ══════════════════════════════════════════════════════════════
   ```

   Si definiste `ADMIN_TELEFONO` y `ADMIN_PASSWORD` se usan esos valores; si no, la
   contraseña se genera al azar (nunca queda una contraseña por defecto conocida en un
   sitio público). Esta preparación es **solo-inserción**: se puede reiniciar las veces
   que sea sin duplicar ni sobrescribir nada.

   Con eso ya puedes entrar a `/admin` y crear tu programación. No hace falta el CLI de
   Railway ni correr el seed.

8. **Opcional — datos de demostración.** Si quieres las 40+ clases de prueba, con el CLI
   de Railway (`npm i -g @railway/cli && railway login && railway link`):

   ```bash
   railway run node server/prisma/seed.js
   ```

   ⚠️ El seed **borra todo** antes de sembrar. Solo sobre una base sin datos reales.

9. **Si no puedes entrar al panel**, revisa qué administradores existen:

   ```bash
   railway run node server/scripts/admin.mjs listar
   ```

   El login responde siempre "usuario o contraseña incorrectos" —tanto si el usuario no
   existe como si la clave está mal— para no revelar qué teléfonos hay registrados, así
   que este comando es la forma de saber cuál de los dos casos es. Para cambiar la
   contraseña sin borrar datos:

   ```bash
   railway run node server/scripts/admin.mjs crear \
     --telefono 3001234567 --password "TU_CLAVE" --nombre "Tu Nombre"
   ```

   `ADMIN_PASSWORD` solo se lee cuando **no existe todavía** ningún administrador:
   cambiar esa variable después no cambia la contraseña, porque el hash ya está en la base.

### Alternativa: dos servicios separados

Si prefieres escalar el frontend por su cuenta:

| | Servicio API | Servicio Frontend |
| --- | --- | --- |
| Root Directory | `server` | `client` |
| Build | `npm run build` | `npm run build` |
| Start | `npm start` | servir `dist/` como sitio estático |
| Variables | las de arriba + `CORS_ORIGINS=https://tu-frontend.up.railway.app` | `VITE_API_URL=https://tu-api.up.railway.app` |

El cliente ya está preparado: si `VITE_API_URL` está vacío usa rutas relativas (mismo
origen); si tiene valor, apunta ahí. El servidor solo envía cabeceras CORS a los orígenes
listados en `CORS_ORIGINS` y a su propio dominio.

---

## Variables de entorno

Ver `.env.example`. Las imprescindibles:

> El servidor se considera en producción si `NODE_ENV=production` **o** si detecta las
> variables que Railway inyecta (`RAILWAY_ENVIRONMENT` y compañía), y en ese caso **se
> niega a arrancar sin `JWT_SECRET`**. Es a propósito: sin esa variable firmaría los
> tokens con el secreto de ejemplo, que está en el repositorio, y cualquiera podría
> falsificar una sesión de administrador.

| Variable | Obligatoria | Por defecto |
| --- | --- | --- |
| `DATABASE_URL` | sí | — |
| `JWT_SECRET` | sí en cualquier despliegue | valor de desarrollo (solo en local) |
| `PORT` | no | `4000` |
| `NODE_ENV` | no | `development` |
| `APP_URL` | no | `http://localhost:5173` |
| `TZ_GIMNASIO` | no | `America/Bogota` |
| `CORS_ORIGINS` | solo con servicios separados | `http://localhost:5173` |
| `VITE_API_URL` | solo con servicios separados | vacío (mismo origen) |

---

## Diseño

Paleta **Volt**: base carbón (`#0F1115`) con acento lima eléctrico (`#C8F751`) para
Running y cian (`#4CE0E0`) para Spinning. El color de cada disciplina viene de
`TipoClase.color` en la base de datos, así que se cambia sin tocar código.

Decisiones pensadas para el uso con una mano:

- Objetivos táctiles de 44–52 px; los puestos del mapa nunca bajan de 38 px y no necesitan
  zoom.
- El CTA principal siempre fijo abajo, en la zona del pulgar, sobre un degradado.
- La confirmación es una hoja inferior, no otra pantalla: el flujo se siente más corto.
- Inputs de 16 px para que iOS no haga zoom automático al enfocarlos.
- `env(safe-area-inset-bottom)` para no quedar bajo la barra de gestos del iPhone.
- La barra de ocupación se llena y cambia de color (lima → ámbar → rojo) a la vez: largo y
  color dicen lo mismo.
- Se respeta `prefers-reduced-motion`.
