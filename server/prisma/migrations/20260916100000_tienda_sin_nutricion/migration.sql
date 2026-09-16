-- La ficha de la tienda vuelve a mostrar solo nombre y precio (más la foto y
-- la descripción, que ya existían de antes): se quita toda la ficha
-- nutricional -categoría, insignias, calorías, macros, sodio y porción-.
ALTER TABLE "Producto"
  DROP COLUMN "categoria",
  DROP COLUMN "insignias",
  DROP COLUMN "porcion",
  DROP COLUMN "caloriasKcal",
  DROP COLUMN "proteinaG",
  DROP COLUMN "carbohidratosG",
  DROP COLUMN "azucaresG",
  DROP COLUMN "grasasTotalesG",
  DROP COLUMN "sodioMg";
