-- Una reserva sin pagar deja de apartar el puesto.
--
-- Hasta ahora PENDIENTE_PAGO bloqueaba la bicicleta mientras la persona pagaba.
-- La contra es que quien empieza el pago y se arrepiente deja el cupo muerto, y
-- el gimnasio prefiere que el puesto siga a la venta hasta que el pago este
-- verificado: el cupo es de quien paga primero.
--
-- Consecuencia directa: varias personas pueden tener una reserva PENDIENTE_PAGO
-- sobre el mismo puesto a la vez, asi que el indice unico solo puede mirar las
-- reservas ya firmes. Quien confirma primero se queda con el puesto; si a otro
-- le entra el pago despues, la app lo detecta y lo deja anotado para devolver.
DROP INDEX IF EXISTS "reserva_puesto_activo_unico";

CREATE UNIQUE INDEX "reserva_puesto_activo_unico"
  ON "Reserva" ("claseId", "puestoCodigo")
  WHERE "estado" IN ('CONFIRMADA', 'ASISTIO', 'NO_SHOW');
