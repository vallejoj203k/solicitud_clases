-- La cola de musica pasa a ser UNA SOLA para todo el gimnasio.
--
-- Antes cada clase tenia su fila y solo podia pedir quien tuviera reserva en
-- esa clase. Pero el reproductor es uno y suena todo el dia, tambien fuera de
-- las clases, asi que el gimnasio pidio que cualquiera pueda pedir sin
-- reservar. Con eso, colgar la cola de una clase deja de tener sentido.

-- 1. `claseId` y `usuarioId` pasan a ser opcionales.
ALTER TABLE "PedidoMusica" ALTER COLUMN "claseId"   DROP NOT NULL;
ALTER TABLE "PedidoMusica" ALTER COLUMN "usuarioId" DROP NOT NULL;

-- Borrar la clase o el usuario ya no debe llevarse por delante el historial de
-- lo que sono: se queda el pedido sin dueno.
ALTER TABLE "PedidoMusica" DROP CONSTRAINT "PedidoMusica_claseId_fkey";
ALTER TABLE "PedidoMusica" ADD CONSTRAINT "PedidoMusica_claseId_fkey"
  FOREIGN KEY ("claseId") REFERENCES "Clase"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PedidoMusica" DROP CONSTRAINT "PedidoMusica_usuarioId_fkey";
ALTER TABLE "PedidoMusica" ADD CONSTRAINT "PedidoMusica_usuarioId_fkey"
  FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 2. Quien pide sin sesion se identifica por su navegador. Es lo que permite
--    repartir turnos entre desconocidos.
ALTER TABLE "PedidoMusica" ADD COLUMN "dispositivoId" TEXT;
ALTER TABLE "PedidoMusica" ADD COLUMN "nombre"        TEXT;

-- 3. El unico viejo era (clase, cancion, usuario) y con la clase fuera de juego
--    no sirve: en Postgres dos NULL no chocan, asi que no impediria nada.
DROP INDEX IF EXISTS "PedidoMusica_claseId_cancionId_usuarioId_key";
DROP INDEX IF EXISTS "PedidoMusica_claseId_estado_turno_idx";

-- En su lugar, un unico PARCIAL: la misma cancion no puede estar dos veces
-- esperando o sonando. Ya sonada si puede volver a pedirse mas tarde -eso lo
-- decide la aplicacion con una ventana de tiempo-, pero la cola nunca tiene
-- duplicados, venga el pedido de quien venga.
CREATE UNIQUE INDEX "pedido_musica_activo_unico"
  ON "PedidoMusica"("cancionId")
  WHERE "estado" IN ('EN_FILA', 'SONANDO');

CREATE INDEX "PedidoMusica_estado_turno_creadoEn_idx"
  ON "PedidoMusica"("estado", "turno", "creadoEn");
CREATE INDEX "PedidoMusica_cancionId_estado_idx" ON "PedidoMusica"("cancionId", "estado");
CREATE INDEX "PedidoMusica_claseId_idx" ON "PedidoMusica"("claseId");
