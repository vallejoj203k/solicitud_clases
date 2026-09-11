-- Catalogo de la tienda: solo informativo, sin pedidos ni inventario.
CREATE TABLE "Producto" (
  "id"          TEXT NOT NULL,
  "nombre"      TEXT NOT NULL,
  "descripcion" TEXT NOT NULL,
  "foto"        TEXT,
  "precioCop"   INTEGER NOT NULL DEFAULT 0,
  "macros"      JSONB NOT NULL DEFAULT '[]',
  "orden"       INTEGER NOT NULL DEFAULT 0,
  "activo"      BOOLEAN NOT NULL DEFAULT true,
  "creadoEn"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Producto_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Producto_activo_orden_idx" ON "Producto"("activo", "orden");
