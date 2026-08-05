-- La cola de musica pasa a ser por ORDEN DE LLEGADA.
--
-- Antes se repartia por rondas: primero la primera cancion de cada quien,
-- despues la segunda de cada quien. La idea era que quien pidiera diez no
-- dejara sin sonar a los demas, pero en el salon se veia al reves: quien acaba
-- de pedir se colaba delante de canciones que llevaban rato esperando, porque
-- entraba con turno 1 mientras las otras ya iban por el 2 o el 3.
--
-- Ahora suena en el orden en que se pidio, que es lo que la gente espera de una
-- fila y lo unico que se puede explicar sin dibujar.
CREATE INDEX "PedidoMusica_estado_creadoEn_idx" ON "PedidoMusica"("estado", "creadoEn");

-- El indice viejo ordenaba por turno; ya no se ordena por ahi.
DROP INDEX IF EXISTS "PedidoMusica_estado_turno_creadoEn_idx";
