-- El puesto tambien queda apartado en firme cuando alguien avisa "ya
-- transferi", no solo cuando la reserva llega a CONFIRMADA.
--
-- Hasta ahora una PENDIENTE_PAGO nunca ocupaba nada: varias personas podian
-- convivir sobre el mismo puesto y el cupo era de quien confirmara primero.
-- Eso sigue igual ANTES de avisar. Pero el gimnasio quiere que, desde el
-- momento en que alguien dice "ya transferi", recepcion tenga una hora entera
-- para revisar los avisos que se vayan acumulando sin que el puesto se lo
-- gane otro cliente mientras tanto -y sin que dos avisos casi simultaneos
-- sobre el mismo puesto queden los dos "apartados" a la vez-.
--
-- Por que un indice y no solo la comprobacion en memoria de crearReserva: esa
-- comprobacion evita crear una reserva NUEVA sobre un puesto ya apartado, pero
-- no alcanza a frenar la carrera entre dos avisos de "ya transferi" que
-- lleguen casi juntos sobre dos reservas PENDIENTE_PAGO que YA EXISTIAN antes
-- de que ninguna avisara -eso sigue siendo valido hasta el momento del aviso-.
-- El indice unico es lo unico que Postgres garantiza de verdad bajo carrera:
-- el segundo UPDATE que intente poner avisoPagoEn choca con P2002, que el
-- middleware ya traduce a 409 PUESTO_OCUPADO (ver middleware/errores.js).
DROP INDEX IF EXISTS "reserva_puesto_activo_unico";

CREATE UNIQUE INDEX "reserva_puesto_activo_unico"
  ON "Reserva" ("claseId", "puestoCodigo")
  WHERE "estado" IN ('CONFIRMADA', 'ASISTIO', 'NO_SHOW')
     OR ("estado" = 'PENDIENTE_PAGO' AND "avisoPagoEn" IS NOT NULL);
