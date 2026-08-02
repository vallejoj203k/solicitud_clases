-- Musica pedida por los clientes.
--
-- La app NO reproduce nada: es un catalogo de texto del que el cliente elige y
-- una fila que el instructor lee para saber que sigue. Por eso no hay archivos
-- ni URLs de audio, solo titulo y artista.
CREATE TYPE "EstadoPedidoMusica" AS ENUM ('EN_FILA', 'SONO');

CREATE TABLE "Cancion" (
  "id"       TEXT NOT NULL,
  "titulo"   TEXT NOT NULL,
  "artista"  TEXT,
  "momento"  TEXT,
  "deLaCasa" BOOLEAN NOT NULL DEFAULT false,
  "activa"   BOOLEAN NOT NULL DEFAULT true,
  "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Cancion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Cancion_titulo_artista_key" ON "Cancion"("titulo", "artista");
CREATE INDEX "Cancion_activa_titulo_idx" ON "Cancion"("activa", "titulo");

CREATE TABLE "PedidoMusica" (
  "id"        TEXT NOT NULL,
  "claseId"   TEXT NOT NULL,
  "cancionId" TEXT NOT NULL,
  "usuarioId" TEXT NOT NULL,
  -- Orden dentro de la fila: primero la cancion 1 de cada quien, luego la 2...
  "turno"     INTEGER NOT NULL DEFAULT 1,
  "estado"    "EstadoPedidoMusica" NOT NULL DEFAULT 'EN_FILA',
  "creadoEn"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "sonoEn"    TIMESTAMP(3),
  CONSTRAINT "PedidoMusica_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PedidoMusica_claseId_cancionId_usuarioId_key"
  ON "PedidoMusica"("claseId", "cancionId", "usuarioId");
CREATE INDEX "PedidoMusica_claseId_estado_turno_idx"
  ON "PedidoMusica"("claseId", "estado", "turno");

ALTER TABLE "PedidoMusica" ADD CONSTRAINT "PedidoMusica_claseId_fkey"
  FOREIGN KEY ("claseId") REFERENCES "Clase"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PedidoMusica" ADD CONSTRAINT "PedidoMusica_cancionId_fkey"
  FOREIGN KEY ("cancionId") REFERENCES "Cancion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PedidoMusica" ADD CONSTRAINT "PedidoMusica_usuarioId_fkey"
  FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;
