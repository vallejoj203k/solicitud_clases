-- Impide fisicamente que dos reservas activas ocupen el mismo puesto en la misma clase.
--
-- Es un indice UNICO PARCIAL: solo aplica a las reservas que no estan canceladas.
-- Gracias al WHERE, cancelar una reserva saca la fila del indice y libera el
-- puesto automaticamente, sin necesidad de borrar el registro ni de mantener
-- una columna "ocupado" en otra tabla.
--
-- Prisma no puede expresar indices parciales en schema.prisma, por eso esta
-- migracion se escribe a mano. Si dos transacciones simultaneas intentan
-- insertar el mismo puesto, Postgres rechaza una con el error 23505, que Prisma
-- reporta como P2002 y el middleware traduce a HTTP 409 PUESTO_OCUPADO.
CREATE UNIQUE INDEX "reserva_puesto_activo_unico"
  ON "Reserva" ("claseId", "puestoCodigo")
  WHERE "estado" <> 'CANCELADA';
