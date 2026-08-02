# Reservas de clases — Running & Spinning

App web full-stack para reservar puesto en clases de gimnasio. Mobile-first: desde la
pantalla principal una reserva son **3 toques** (horario → puesto → confirmar), y entrando
por la disciplina, 4.

- **Cliente**: sin registro ni contraseña. Elige disciplina, día en un calendario, horario,
  puesto en un mapa tipo cine/avión, deja nombre y teléfono la primera vez y listo. Recibe un código + QR para el
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
| `node server/scripts/admin.mjs revisar-puestos` | Busca reservas cuyo puesto ya no existe en su salón |
| `npm run db:backup` | Copia comprimida de la base en `respaldos/` (requiere `pg_dump`) |

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
            estado(PENDIENTE_PAGO|CONFIRMADA|CANCELADA|EXPIRADA|ASISTIO|NO_SHOW),
            expiraEn?, avisoPagoEn?, notasPago?, nombreInvitado?,
            estadoPago(PENDIENTE|PAGADO|RECHAZADO), montoCop, metodoPago?, pagoRef?,
            pagoPayload?, pagoActualizadoEn?, creadoEn, canceladoEn?
Cancion       id, titulo, artista?, videoId(único)?, canal?, duracionSeg?, miniatura?,
              momento?, deLaCasa, activa, creadoEn
PedidoMusica  id, claseId, cancionId, usuarioId, turno, estado(EN_FILA|SONANDO|SONO),
              creadoEn, sonoEn?                        (único: claseId+cancionId+usuarioId)
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

Los salones actuales: **Spinning** 18 bicicletas en 6 columnas × 3 filas (`A1`…`C6`) y
**Running** 6 trotadoras en 3 columnas × 2 filas (`1`…`6`). Se definen en
`server/src/config/catalogoInicial.js`; cambiarlos en una base que ya existe requiere una
migración de datos (ver `migrations/*_salon_real` y `*_salon_transpuesto`), porque el
bootstrap de arranque solo inserta lo que falta y nunca sobrescribe.

Cuando el cambio altera el **conjunto de códigos** —como al trasponer el salón de
Spinning, donde `A1`…`F3` pasa a ser `A1`…`C6`— la migración tiene que mover las reservas
o la mitad quedarían apuntando a un puesto inexistente. La transposición se hace en dos
pasos con un prefijo temporal: el índice único parcial de puesto activo se evalúa fila a
fila, y un intercambio directo (`A2`→`B1` mientras `B1`→`A2`) chocaría consigo mismo a
mitad de camino.

Al crear una clase, el campo **Cupo** se rellena solo con el tamaño del salón (18 o 6) y
se puede bajar; no se puede subir por encima del salón (`422 CUPO_EXCEDE_LAYOUT`).

El layout describe el **salón completo**; `Clase.cupoMaximo` decide cuántos de esos
puestos se ponen a la venta en cada clase. El mapa dibuja exactamente `cupoMaximo`
puestos: si el salón tiene 12 trotadoras y la clase abre 6, se ven 6 cuadros, no 12 con
la mitad apagada. Los ya reservados se muestran siempre y los bloqueados aparecen
marcados sin consumir cupo (ver `puestosEnJuego` en `disponibilidad.service.js`). La API
rechaza con `409 PUESTO_FUERA_DE_CUPO` un puesto que no esté entre los ofrecidos.

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

## Operación

**Recuperar una reserva.** El cliente no tiene contraseña: su sesión vive en el navegador.
En `/recuperar` la recupera con **código + teléfono**. Se piden los dos a propósito: con el
teléfono solo se podrían enumerar números y ver quién va a qué clase; con el código solo,
bastaría con ver el QR de otra persona.

**Check-in.** `/admin/recepcion` abre con la agenda: todas las clases de la más cercana a
la más lejana (desde una hora atrás, para que la que está en curso no desaparezca),
agrupadas por día y marcadas con «En curso». Al abrir una clase se ve el mapa del salón con
los puestos reservados; tocando uno se despliega la ficha de quien lo reservó —nombre,
teléfono, código, estado y pago— y desde ahí se marca asistencia y se cobra en efectivo.
Arriba sigue la búsqueda por código, teléfono o nombre, con las mismas dos acciones, para
quien llega con su QR.

**Precios.** Hay dos y conviene no confundirlos. El de la **disciplina**
(`TipoClase.precioCop`) es la plantilla: el precio con el que nace cada clase nueva. Se
cambia en `/admin/clases`, en la tarjeta «Precio por disciplina», y el cliente nunca lo ve.
El de la **clase** (`Clase.precioCop`) es el que se cobra de verdad, se edita en el
formulario de esa clase y es el único que se le muestra al cliente: al abrir la clase,
junto al mapa de puestos, y otra vez en la confirmación. La pantalla principal **no anuncia
ningún precio**, precisamente porque cada clase puede tener el suyo y un número solo en la
portada terminaba contradiciendo lo que después se cobraba. Al subir el precio de una disciplina se ofrece aplicarlo a las clases ya
programadas: solo alcanza a las futuras que aún tenían el precio anterior, nunca a las que
ya pasaron —su precio es parte del historial de pagos— ni a las que tengan un precio propio,
que se cuentan aparte para que una promoción no desaparezca sin avisar.

**Varios puestos por persona.** Una pareja va junta y paga una sola: la misma persona
puede tomar hasta `MAX_PUESTOS_POR_PERSONA` puestos en una clase (4 por defecto). Cada
puesto es **una reserva independiente**, con su código y su pago —el tope existe para que
nadie acapare el salón—. Desde la pantalla de éxito, «Reservar otro puesto en esta clase»
lleva directo al mapa sin volver a pedir los datos, y pregunta el nombre del acompañante:
sin eso recepción vería el mismo nombre repetido y no sabría a quién está recibiendo. Ese
nombre es opcional y aparece en la ficha del puesto, en la lista de inscritos, en la
búsqueda y en el CSV, en la columna «Quién asiste».

**La agenda del mostrador mira 7 días, pero nunca dice que no hay clases.** Si en esa
ventana no hay ninguna, Recepción muestra las siguientes que existan con un aviso que lo
explica. Antes respondía «No hay clases programadas» mientras el calendario y la app del
cliente mostraban clases de dentro de dos semanas, y eso parecía que los datos estuvieran
rotos cuando solo eran dos horizontes distintos.

**Calendario del cliente.** Tras elegir disciplina, `/reservar/:slug` muestra un calendario
del mes en vez del carrusel de siete días: con la programación repartida en varias semanas,
el carrusel obligaba a arrastrar a ciegas para descubrir si había clase el jueves siguiente.
Los días sin clase no se pueden tocar, los que sí llevan un punto del color de la disciplina
y al entrar se preselecciona el primer día con cupo, así que en el caso normal no cuesta un
toque de más. La rejilla se arma con aritmética en UTC —construirla con fechas locales corre
un día en cuanto el navegador está en otra zona horaria que el gimnasio— y vive en
`components/CalendarioDias.jsx`.

**Calendario de clases.** `/admin/clases` abre en un calendario del mes con las clases de
cada día —en escritorio con sus horas, en el teléfono con un punto por disciplina y el
conteo—. Al tocar un día se elige disciplina (si ese día solo hay una, se salta el paso) y
después la clase, que abre el **mismo salón que usa Recepción**: tocando un puesto ocupado
sale quién lo reservó y se puede marcar asistencia o cobrar ahí mismo. Esa vista vive en
`components/SalonClase.jsx` justamente para que las dos pantallas compartan código. La
pestaña **Lista** es la de siempre: crear, editar, cancelar y borrar.

**Borrar un rango.** Un lote semanal deja treinta clases y borrarlas de a una es absurdo,
así que el calendario tiene «Borrar rango»: fechas, disciplina opcional y una **simulación**
que dice en números qué va a pasar antes de tocar nada (`simular: true`). Las que tengan
reservas confirmadas o pagos no se borran nunca; se ofrece cancelarlas, que las saca de la
vista del cliente sin perder el registro.

**Las canceladas se ven en el panel, no en la app.** `listarClases` filtra por `ACTIVA`
salvo que se le pase `incluirCanceladas`, que solo hace la ruta del admin. Antes el panel
tampoco las veía, y como el botón «Eliminar» solo aparecía para las canceladas, borrar una
clase era imposible: al cancelarla desaparecía de la lista.

**Borrar una clase.** Lo que impide borrarla es el **historial**, no que existan filas:
se niega si tiene reservas confirmadas o con pago registrado (`409 CLASE_CON_HISTORIAL`) y
en ese caso lo correcto es cancelarla, que deja de verse para los clientes. Las canceladas,
expiradas y las que nunca se pagaron se van con la clase. Una clase activa **sin inscritos**
—la típica creada a la hora equivocada— se borra directo, sin tener que cancelarla primero.

**Plazo de cancelación.** El cliente cancela por su cuenta hasta `HORAS_LIMITE_CANCELACION`
horas antes (2 por defecto); después la app se lo dice y no le ofrece el botón. El
administrador puede cancelar siempre.

**Correos.** Confirmación (con el `.ics` adjunto) y aviso de cancelación. Si no hay
`SMTP_*` configurado, el servicio se apaga solo y avisa en los logs; nada más se rompe. Un
correo que falla nunca tumba una reserva.

**Habeas data (Ley 1581).** El formulario exige marcar la autorización antes de guardar
datos de alguien nuevo; queda sellada con fecha en `Usuario.aceptoDatosEn`. El texto está
en `/privacidad` y se alimenta de `GIMNASIO_NOMBRE`, `GIMNASIO_DIRECCION` y
`GIMNASIO_CONTACTO`.

**Respaldos.** Railway hace los suyos según el plan; `npm run db:backup` genera una copia
propia. Restaurar: `gunzip -c respaldos/ARCHIVO.sql.gz | psql "$DATABASE_URL"`.

---

## Música

**La música suena de verdad, desde YouTube.** El cliente busca en todo YouTube desde su
teléfono, la canción entra a una fila y suena en **una sola pantalla**: la del gimnasio,
conectada a los parlantes. De los teléfonos no sale sonido —con veinte celulares sonando a
destiempo no habría clase—, y por eso «si ya hay una sonando, la tuya espera» tiene
sentido: hay un único sitio donde suena.

La app **no aloja ni descarga audio**. Guarda el id del video y lo pone con el reproductor
incrustado oficial de YouTube (IFrame Player API), que va con su publicidad y sus reglas.

### Las tres pantallas

| Quién | Dónde | Qué hace |
|---|---|---|
| Cliente | `/musica` (tercera tarjeta del inicio) o su reserva | Busca en YouTube y manda a la fila |
| Gimnasio | `/musica/reproductor` | **Suena aquí.** Se deja abierta todo el día |
| Recepción | `/admin/musica` | Canciones de la casa; `/admin/recepcion` → clase → Música para ver la fila |

### El reproductor

Va en el televisor o la tablet conectada a los parlantes. Arranca con un botón grande de
**Empezar** que se toca **una vez al abrir el gimnasio**: los navegadores no dejan iniciar
audio sin un gesto del usuario y no hay forma de saltárselo, así que en vez de fallar en
silencio la pantalla lo pide de frente. De ahí en adelante encadena sola.

Toma **la clase que se esté dictando en ese momento** —el servidor la resuelve con
`claseEnCurso()`—, así que no hay que reconfigurarla cada hora.

**Cuando la fila se vacía no se para la música**, que es lo peor que puede pasar en un
salón. Se intenta, en orden:

1. la **mezcla de YouTube** a partir de la última canción (`loadPlaylist({list: 'RD'+id})`),
   que es lo más cercano a «que YouTube siga sugiriendo» que expone el reproductor
   incrustado —la API de vídeos relacionados fue retirada en 2023, no hay forma oficial;
2. si eso tampoco arranca, una canción **de la casa** al azar.

Si alguien pide algo mientras suena el relleno, se atiende sin esperar a que termine.

### La cuota es el límite real

La API de datos de YouTube da **10.000 unidades al día**: una búsqueda cuesta **100** (unas
100 búsquedas diarias para todo el gimnasio) y pedir los datos de hasta 50 vídeos por su
enlace cuesta **1**. De ahí tres decisiones:

- **la búsqueda se dispara al enviar, nunca al teclear** —buscar mientras se escribe
  agotaría la cuota en una tarde—;
- los resultados se **cachean 12 horas** por texto normalizado, así que «bad bunny» cuesta
  una sola vez al día;
- el catálogo que se ve al abrir sale de **listas de reproducción** (`YOUTUBE_LISTAS`), no
  de búsquedas, y la carga masiva va **por enlaces**, no por títulos: pegar 50 títulos
  costaría media cuota diaria; pegar 50 enlaces cuesta 1 unidad.

Buscar exige sesión de cliente, justamente para que la cuota no se la gaste cualquiera
desde internet.

### Qué se descarta y por qué

Ofrecer una canción que después no suena es peor que no ofrecerla, así que al buscar se
piden los detalles de cada vídeo (`videos.list`) y se dejan fuera:

- los que **no se dejan incrustar** (sonarían un cuadro negro);
- los **bloqueados en Colombia** (`YOUTUBE_REGION`);
- los que **duran más de 10 minutos** (`YOUTUBE_MAX_DURACION_SEG`) y las emisiones en
  directo: un mix de dos horas congela la fila hasta que alguien la salte a mano.

Los títulos se limpian de adornos —`(Official Video)`, `[4K]`, `| Lyrics`— porque en una
fila que se lee de reojo estorban.

### La fila

Se ordena **por rondas**, no por llegada estricta: primero la primera canción de cada
persona, después la segunda de cada persona, y así (`PedidoMusica.turno` es la n-ésima que
pide esa persona en esa clase; se ordena por `turno` y, dentro de cada ronda, por
`creadoEn`). Con llegada estricta, el primero que pidiera diez se comería la clase entera.

Cada persona puede pedir **las que quiera** y quitar las suyas mientras no hayan sonado.
Solo pide quien tenga reserva firme en esa clase: es lo que evita que un desconocido llene
de canciones los parlantes del gimnasio. Una canción no entra dos veces a la misma fila,
aunque la pidan dos personas distintas.

Estados de un pedido: `EN_FILA` → `SONANDO` → `SONO`. `SONANDO` existe como estado propio
—en vez de deducirlo de «la primera de la fila»— para que el reproductor sepa desde dónde
retomar si alguien recarga la pantalla a mitad de canción.

### Antes de encenderlo

Dos cosas que no dependen del código:

- **Licencia de música en público.** Poner música en un local comercial en Colombia
  normalmente requiere licencia de la OSA (Sayco & Acinpro), y los términos de YouTube son
  para uso personal, no para difusión en un negocio. Vale la pena resolverlo antes, no
  después de una visita.
- **La llave de la API.** Sin `YOUTUBE_API_KEY` la búsqueda se apaga sola y lo dice; el
  resto de la app sigue igual.

---

## Pagos

Tres modos, según `PAGO_MODO`:

- **`manual`** (por defecto): el cliente reserva y paga en recepción; el administrador
  marca el pago desde el panel.
- **`wompi`**: el cliente paga en la pasarela antes de que su cupo quede confirmado.
- **`transferencia`**: el cliente transfiere a la llave del gimnasio y recepción confirma.
  Comisión 0 % y le sirve a cualquier banco de Bre-B, a cambio de un toque manual.

Si el modo elegido no tiene con qué operar —faltan las llaves de Wompi, o falta
`TRANSFERENCIA_LLAVE`— se cae a `manual` en vez de dejar la app sin poder reservar.

### Una reserva sin pagar NO aparta el puesto

**El cupo es de quien paga primero.** Una reserva en `PENDIENTE_PAGO` no ocupa nada: el
puesto sigue verde en el mapa y otra persona lo puede tomar. Es una decisión del gimnasio,
tomada después de ver el caso real: quien empieza a pagar y se arrepiente dejaba un cupo
muerto durante quince minutos.

El precio de esa decisión es que **dos personas pueden pagar por el mismo puesto**. La app
no lo puede evitar —nadie avisa mientras alguien transfiere— así que lo detecta al
confirmar:

- Recepción intenta confirmar el segundo pago y el servidor lo frena con
  `409 PUESTO_YA_CONFIRMADO`, diciendo quién se quedó con el puesto.
- Si el pago llega por pasarela cuando el puesto ya es de otro, se registra igual y la
  reserva queda con una nota en `notasPago` («Reubicar o devolver»), **sin vencimiento**,
  para que no desaparezca de la cola del mostrador hasta que alguien la resuelva.

Por eso el índice único solo mira las reservas firmes: varias `PENDIENTE_PAGO` pueden
convivir sobre el mismo puesto.

1. Al confirmar, la reserva nace en **`PENDIENTE_PAGO`** con `expiraEn` a
   `MINUTOS_PARA_PAGAR` minutos. Ese plazo ya no aparta nada: solo decide cuándo se da por
   abandonada y deja de estorbar en la cola. Tampoco es una venta: no aparece en el reporte
   de pagos ni suma a los ingresos.
2. Se redirige a Wompi con una **firma de integridad**
   (`SHA256(referencia + centavos + moneda + secreto)`), que impide pagar $1.000 por una
   clase de $25.000 editando la URL.
3. El **webhook** (`POST /api/pagos/wompi/webhook`) confirma la reserva. La firma del
   evento se valida siempre: sin eso cualquiera podría anunciar un pago y llevarse un cupo.
   Es idempotente, porque Wompi reintenta.
4. Si el pago se rechaza o el plazo vence, la reserva pasa a **`EXPIRADA`** y el puesto
   vuelve al mapa. Lo liberan dos mecanismos: un barrido cada minuto y una expiración
   dentro de la propia transacción de `crearReserva`, para que un plazo vencido nunca
   bloquee a alguien que sí quiere pagar.

Al volver del checkout la app le pregunta a Wompi por la transacción en vez de esperar el
webhook, así la confirmación es inmediata; el webhook sigue siendo la fuente autoritativa
para quien cierra el navegador sin volver.

**Caso raro pero real:** si el pago entra después de expirar y el puesto ya se lo dieron a
otra persona, la reserva queda con el pago registrado y una nota en `notasPago` para que
recepción gestione la devolución. No se le quita el puesto a quien ya lo tenía.

**Con qué medio pagó.** Se guarda el medio real (`wompi-tarjeta`, `wompi-nequi`,
`wompi-bancolombia`, `wompi-pse`) y no un genérico «wompi», porque **cada medio tiene una
tarifa distinta**: la tarjeta lleva un costo fijo por transacción y el Botón Bancolombia y
Nequi no. En clases baratas ese fijo es la mayor parte de la comisión, así que el reporte
de pagos y el CSV muestran el medio y permiten calcular lo que se lleva la pasarela. Un
medio nuevo que Wompi agregue no rompe nada: cae en «En línea».

### Cobro por transferencia (llave Bre-B)

Con `PAGO_MODO=transferencia` el puesto se aparta igual que con la pasarela —mismo estado
`PENDIENTE_PAGO`, mismo `expiraEn`, mismo barrido que lo libera— pero **nadie avisa que el
pago entró**: Bre-B le notifica al celular del gimnasio, no al servidor. Así que la
confirmación es humana:

1. El cliente ve la llave, el QR, el **monto exacto** y el **código de la reserva** para
   poner en la descripción. La llave se copia de un toque.
2. Toca **«Ya transferí»**. Eso no confirma nada: sella `avisoPagoEn` y lo pone en la cola
   del mostrador. Es idempotente —tocarlo dos veces conserva la hora del primer aviso, que
   es la que ordena la cola.
3. En Recepción aparece **«Pagos por confirmar»** con nombre, monto y código. Recepción
   coteja **contra la notificación del banco, no contra la captura que muestre el cliente**,
   y confirma de un toque.
4. Confirmar deja la reserva `CONFIRMADA`, borra `expiraEn` y dispara el correo con el
   `.ics`. La pantalla del cliente se actualiza sola, sin recargar.
5. Si nadie confirma a tiempo, el puesto se libera como cualquier otro apartado.

Marcar pagada una reserva apartada **siempre** la confirma y le quita el vencimiento, venga
de la cola o del botón de cobro en efectivo. Sin eso, el barrido de vencidas liberaría más
tarde un puesto ya pagado.

**Cuando se arrepienten.** Una reserva sin pagar se descarta en cualquier momento, **sin el
plazo de cancelación**: no hay nada que devolver. Lo puede hacer el cliente —desde la
pantalla de pago o desde el mapa, donde se le recuerda que dejó un pago a medias— y también
recepción, desde la cola.

**El aviso en el panel.** La cantidad de pagos por confirmar se consulta desde el layout
del panel, no desde la pantalla de Recepción, así que el contador se ve en **cualquier**
sección. Se refresca cada 10 s, también con la pestaña en segundo plano —la tablet del
mostrador pasa el día abierta y sin que nadie la toque— y comparte clave de caché con la
pantalla de Recepción, de modo que abrirla no dispara una segunda consulta.

Variables: `TRANSFERENCIA_LLAVE` (obligatoria), `TRANSFERENCIA_TITULAR`,
`TRANSFERENCIA_ENTIDAD` y `TRANSFERENCIA_QR` (ruta a la imagen dentro de `/images`, que se
publica sola; por ejemplo `/images/qr.jpg`).

### Poner Wompi en marcha

1. Crea la cuenta de comercio en Wompi (requiere RUT y cuenta bancaria del gimnasio).
2. En *Desarrolladores* copia la llave pública, la privada, el secreto de integridad y el
   secreto de eventos. **Empieza con las de sandbox.**
3. Configúralas junto con `PAGO_MODO=wompi` y `WOMPI_AMBIENTE=sandbox`.
4. En el panel de Wompi registra la URL de eventos:
   `https://tu-app.up.railway.app/api/pagos/wompi/webhook`
5. Prueba el flujo completo con las tarjetas de prueba de Wompi antes de pasar a
   `WOMPI_AMBIENTE=produccion` con las llaves de producción.

`GET /api/configuracion` dice si el cobro en línea está activo; el frontend cambia el botón
a "Ir a pagar" según eso.

---

---

## Estructura

```
├── client/
│   └── src/
│       ├── api/client.js          Cliente HTTP + manejo de errores
│       ├── components/
│       │   ├── MapaPuestos.jsx    Mapa de puestos reutilizable (grid dinámico)
│       │   ├── SalonClase.jsx     Salón + fila de música, compartido admin/recepción
│       │   ├── FilaMusica.jsx     La fila, vista desde recepción
│       │   ├── PedirMusica.jsx    Hoja del cliente para pedir canciones
│       │   ├── CalendarioDias.jsx Calendario del mes para el cliente
│       │   ├── TarjetaHorario.jsx Horario con barra de ocupación
│       │   ├── Iconos.jsx         SVG en línea, sin dependencias
│       │   └── ui.jsx             Botón, Chip, Hoja inferior, Insignia, inputs…
│       ├── lib/{sesion,formato,youtube}.js
│       └── pages/
│           ├── Home · Reservar · Reserva · MisReservas · Musica · Reproductor
│           │   Recuperar · Privacidad
│           └── admin/ Login · Layout · Dashboard · Clases · Calendario · ClaseDetalle
│                      Recepcion · Musica · Pagos · Clientes
└── server/
    ├── prisma/{schema.prisma, migrations/, seed.js}
    └── src/
        ├── config/{env,prisma,estados}.js
        ├── middleware/{auth,errores}.js
        ├── routes/{public,auth,admin,musica}.routes.js
        ├── services/
        │   ├── reserva.service.js         Creación de reservas y concurrencia
        │   ├── disponibilidad.service.js  Cupos y expansión del mapa
        │   ├── clase.service.js           CRUD de horarios (lote y borrado por rango)
        │   ├── pago.service.js            Pagos (extensible a Wompi/Stripe)
        │   ├── musica.service.js          Fila por rondas y reproducción
        │   ├── youtube.service.js         API de datos de YouTube y caché de cuota
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
| `GET` | `/api/musica/buscar?q=` | Buscar en YouTube (token de cliente: protege la cuota) |
| `GET` | `/api/musica/catalogo` | Listas configuradas + canciones de la casa |
| `GET` | `/api/musica/ahora[?clase=]` | Qué suena y qué viene; sin `clase`, la que está en curso |
| `GET` | `/api/canciones[?q=]` | Lo ya pedido alguna vez, sin gastar cuota |
| `GET` | `/api/canciones/de-la-casa` | Las que pone el gimnasio si nadie pide |
| `GET` | `/api/clases/:id/musica` | Fila de la clase, en orden de rondas |
| `POST` | `/api/clases/:id/musica` | Pedir (`{videoId}`; token de cliente con reserva) |
| `DELETE` | `/api/musica/:pedidoId` | Quitar un pedido propio que no esté sonando |
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
| `GET/POST` | `/api/admin/canciones` | Catálogo completo (incluye las desactivadas) / crear |
| `POST` | `/api/admin/canciones/importar` | Carga masiva pegando enlaces o una lista de YouTube |
| `PATCH/DELETE` | `/api/admin/canciones/:id` | Editar / sacar del catálogo |
| `GET` | `/api/admin/musica/buscar?q=` | Buscar en YouTube desde el panel |
| `POST` | `/api/admin/musica/agregar` | Agregar un vídeo al catálogo (`{videoId}`) |
| `POST` | `/api/admin/musica/siguiente` | **El reproductor avanza la fila** |
| `GET` | `/api/admin/clases/:id/musica` | Fila de la clase |
| `POST` | `/api/admin/musica/:pedidoId/sono` | Marcar que sonó (o devolverla a la fila) |
| `DELETE` | `/api/admin/musica/:pedidoId` | Quitar un pedido |

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

## Imágenes

Las fotos del gimnasio van en `/images` (raíz del repositorio), con el **nombre del slug
de la disciplina**: `running.jpg`, `spinning.jpg`. La pantalla de reserva las usa como
fondo a pantalla completa según la clase que se esté reservando.

Sobre la foto va un velo oscuro (`OPACIDAD_VELO` en `FondoDisciplina.jsx`): las dos fotos
tienen mucho contraste y sin él los números de los puestos no se leen. Para que la foto se
vea más, ese es el único valor a tocar. Por lo mismo los cuadros del mapa son opacos, con
el color de la disciplina como capa encima y no como transparencia.

Vite solo publica lo que está en `client/public`, así que `client/scripts/copiar-imagenes.mjs`
copia esa carpeta antes de `dev` y de `build` (el destino está en `.gitignore`: el original
es lo que se versiona). Para una disciplina nueva basta con dejar `<slug>.jpg` ahí; si no
existe la foto, la pantalla queda con el fondo oscuro de siempre, sin imagen rota.

---

## Diseño

Paleta **Volt**: base carbón (`#0F1115`) con acento lima eléctrico (`#C8F751`) para
Running y cian (`#4CE0E0`) para Spinning. El color de cada disciplina viene de
`TipoClase.color` en la base de datos, así que se cambia sin tocar código.

**Semáforo del salón.** Los puestos no usan el color de la disciplina: **verde = libre,
rojo = ocupado**, y el puesto elegido es verde relleno (mismo color, lleno en vez de
contorneado). Es la convención que cualquiera entiende sin leer la leyenda. El tinte se
pinta como capa sobre un fondo opaco, no como color translúcido: detrás hay una foto y los
números tienen que leerse igual.

**La pantalla principal no se desplaza.** Son tres tarjetas —Spinning, Running y Música— y
nada más. La app se usa de pie, con una mano y muchas veces en la tablet del mostrador, así
que todo lo que se puede hacer tiene que estar a la vista. El alto es `h-dvh` y las
tarjetas se reparten el espacio sobrante (`grid-rows-3` + `min-h-0` en cada una) en vez de
tener alto propio: en un teléfono corto se encogen, pero siguen cabiendo las tres. En
tablet horizontal pasan a `grid-cols-3`, una al lado de la otra.

El listado de horarios que antes vivía en esa pantalla se cambió por una sola pastilla con
la próxima clase, que salta directo al mapa de puestos: reservar sigue siendo un toque
desde el inicio. El resto de horarios está a un toque, en la disciplina. Las tarjetas
tampoco muestran precio: el que se cobra es el de **cada clase**, no el de la disciplina, y
anunciar el de la plantilla en la portada contradecía lo que el cliente veía después.

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

### Tablet horizontal

El gimnasio la usa apoyada en el mostrador, así que en horizontal (variante
`md:landscape:`, desde 768 px de ancho) las pantallas se reorganizan **para que nada exija
desplazar la página**:

| Pantalla | En horizontal |
|---|---|
| Principal | Spinning, Running y Música en tres columnas que se estiran hasta llenar la ventana |
| Horarios | El calendario a la izquierda y las clases del día a la derecha |
| Puestos | Salón a la izquierda; puesto elegido, total y botón en un panel fijo a la derecha, en vez de la barra inferior |
| Recepción | Datos de la clase en una columna y el mapa del salón en la otra |

Los puestos crecen de 60 a 78 px (`--ancho-puesto` en `index.css`): con la tablet apoyada
se tocan con el brazo estirado, no con el pulgar. Verificado sin scroll —ni vertical ni
horizontal— en 1024×768 y 1280×800. La pantalla principal, además, en 360×640, 375×667 y
390×844: es la única que no se desplaza en ningún tamaño.
