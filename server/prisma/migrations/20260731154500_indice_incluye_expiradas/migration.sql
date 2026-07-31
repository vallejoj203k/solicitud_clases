-- El indice unico que impide dos reservas sobre el mismo puesto debe ignorar
-- tambien las EXPIRADAS: una reserva cuyo plazo de pago se vencio ya no ocupa
-- nada y su puesto tiene que volver a estar disponible.
--
-- Va en una migracion aparte a proposito: Postgres no deja usar un valor de
-- enum en la misma transaccion en que se crea ("unsafe use of new value").
DROP INDEX IF EXISTS "reserva_puesto_activo_unico";

CREATE UNIQUE INDEX "reserva_puesto_activo_unico"
  ON "Reserva" ("claseId", "puestoCodigo")
  WHERE "estado" NOT IN ('CANCELADA', 'EXPIRADA');
