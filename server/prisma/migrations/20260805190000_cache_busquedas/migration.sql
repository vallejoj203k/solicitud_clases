-- Cache de busquedas de YouTube, EN LA BASE y no en memoria.
--
-- La cuota gratuita da 10.000 unidades al dia y una busqueda cuesta 100: unas
-- cien busquedas diarias para todo el gimnasio. Habia cache, pero vivia en un
-- Map del proceso, y en Railway cada despliegue arranca un proceso nuevo: la
-- cache se vaciaba varias veces al dia y practicamente nunca servia.
--
-- Aqui sobrevive a los despliegues. Y con TTL largo a proposito: los resultados
-- de "bad bunny" no cambian de un dia para otro, asi que repetir una busqueda
-- que ya se hizo no tiene por que costar cuota nunca mas.
CREATE TABLE "BusquedaYoutube" (
  "id"        TEXT NOT NULL,
  -- Texto normalizado (minusculas, sin espacios de mas): "Bad Bunny" y
  -- "  bad   bunny " son la misma busqueda.
  "texto"     TEXT NOT NULL,
  "resultado" JSONB NOT NULL,
  "creadoEn"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BusquedaYoutube_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BusquedaYoutube_texto_key" ON "BusquedaYoutube"("texto");
CREATE INDEX "BusquedaYoutube_creadoEn_idx" ON "BusquedaYoutube"("creadoEn");
