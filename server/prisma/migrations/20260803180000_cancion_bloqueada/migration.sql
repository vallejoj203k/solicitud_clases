-- Canciones que YouTube no deja sonar incrustadas.
--
-- La API de datos dice `embeddable: true` para muchos videos que despues el
-- reproductor incrustado rechaza con el error 101/150 -"el propietario no
-- permite reproducirlo en otros sitios"-. Pasa sobre todo con los sellos
-- grandes: "Muerte en Hawaii" de Calle 13 o "Bandolero" de Don Omar pasan el
-- filtro de la API y luego no suenan.
--
-- No hay forma de saberlo por adelantado, asi que se aprende: cuando el
-- reproductor se topa con una, la marca aqui y no vuelve a proponerla ni deja
-- pedirla. Se guarda la fecha y no un booleano para poder revisar despues cual
-- se cayo y cuando; YouTube a veces cambia de opinion.
ALTER TABLE "Cancion" ADD COLUMN "bloqueadaEn" TIMESTAMP(3);

-- Las sugerencias filtran por esto en cada tanda.
CREATE INDEX "Cancion_bloqueadaEn_idx" ON "Cancion"("bloqueadaEn");
