-- Cobro por transferencia (llave Bre-B / Nequi / Bancolombia): no hay pasarela
-- que avise, asi que el cliente marca "ya transferi" y recepcion confirma.
--
-- Esta marca de tiempo es lo que pone la reserva en la cola de recepcion y
-- permite ordenar por quien lleva mas rato esperando.
ALTER TABLE "Reserva" ADD COLUMN "avisoPagoEn" TIMESTAMP(3);

-- La cola de recepcion busca reservas apartadas que ya avisaron.
CREATE INDEX "Reserva_estado_avisoPagoEn_idx" ON "Reserva"("estado", "avisoPagoEn");
