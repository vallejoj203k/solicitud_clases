-- Cambia la ficha nutricional de la tienda: de una lista libre de renglones
-- (macros) a campos numéricos, para poder calcular %VD y barras de macros.
-- Sin datos reales todavía en `Producto` fuera de pruebas, así que se
-- reemplaza sin migrar filas viejas.
ALTER TABLE "Producto" DROP COLUMN "macros";

ALTER TABLE "Producto"
  ADD COLUMN "categoria"       TEXT,
  ADD COLUMN "insignias"       JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN "porcion"         TEXT,
  ADD COLUMN "caloriasKcal"    INTEGER,
  ADD COLUMN "proteinaG"       DOUBLE PRECISION,
  ADD COLUMN "carbohidratosG"  DOUBLE PRECISION,
  ADD COLUMN "azucaresG"       DOUBLE PRECISION,
  ADD COLUMN "grasasTotalesG"  DOUBLE PRECISION,
  ADD COLUMN "sodioMg"         DOUBLE PRECISION;
