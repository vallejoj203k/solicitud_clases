-- Una misma persona puede tomar varios puestos en una clase (una pareja va
-- junta y paga una sola). Cada puesto sigue siendo una reserva con su codigo;
-- lo que faltaba era saber para quien es cada una, porque si no recepcion ve el
-- mismo nombre repetido y no sabe a quien esta recibiendo.
ALTER TABLE "Reserva" ADD COLUMN "nombreInvitado" TEXT;
