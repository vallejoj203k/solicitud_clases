-- La musica ahora sale de YouTube y suena de verdad en la pantalla del gimnasio.
--
-- La app no aloja audio: guarda el id del video y lo reproduce con el
-- reproductor incrustado oficial. Estas columnas son lo justo para pintar la
-- fila sin volver a preguntarle a YouTube en cada carga.
ALTER TABLE "Cancion" ADD COLUMN "videoId"     TEXT;
ALTER TABLE "Cancion" ADD COLUMN "canal"       TEXT;
ALTER TABLE "Cancion" ADD COLUMN "duracionSeg" INTEGER;
ALTER TABLE "Cancion" ADD COLUMN "miniatura"   TEXT;

-- Dos personas que eligen la misma cancion apuntan a la misma fila.
CREATE UNIQUE INDEX "Cancion_videoId_key" ON "Cancion"("videoId");
CREATE INDEX "Cancion_deLaCasa_activa_idx" ON "Cancion"("deLaCasa", "activa");

-- SONANDO = la que esta puesta ahora mismo. Se necesita un estado propio -y no
-- deducirlo de "la primera de la fila"- porque el reproductor tiene que saber
-- desde donde retomar si alguien recarga la pantalla a mitad de cancion.
ALTER TYPE "EstadoPedidoMusica" ADD VALUE 'SONANDO' BEFORE 'SONO';
