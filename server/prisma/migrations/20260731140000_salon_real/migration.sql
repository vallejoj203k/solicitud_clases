-- Ajusta los salones a la distribucion real del gimnasio:
--   Spinning: 18 bicicletas en 3 columnas x 6 filas  (A1..A3 ... F1..F3)
--   Running :  6 trotadoras en 2 columnas x 3 filas  (1..6)
--
-- Antes eran 24 bicis (A-D x 6) y 12 trotadoras (1..12). El bootstrap de arranque
-- solo inserta lo que falta -nunca sobrescribe- para respetar lo que edite el
-- administrador, asi que actualizar los tipos que ya existen se hace aqui.

UPDATE "TipoClase"
SET "layoutPuestos" = '{
  "titulo": "TARIMA · INSTRUCTOR",
  "numeracion": "porFila",
  "filas": [
    { "label": "A", "puestos": 3, "nota": "Primera fila" },
    { "label": "B", "puestos": 3 },
    { "label": "C", "puestos": 3 },
    { "label": "D", "puestos": 3 },
    { "label": "E", "puestos": 3 },
    { "label": "F", "puestos": 3 }
  ]
}'::jsonb
WHERE slug = 'spinning';

UPDATE "TipoClase"
SET "layoutPuestos" = '{
  "titulo": "PANTALLAS · FRENTE",
  "numeracion": "continua",
  "filas": [
    { "label": "F1", "puestos": 2, "nota": "Frente" },
    { "label": "F2", "puestos": 2 },
    { "label": "F3", "puestos": 2 }
  ]
}'::jsonb
WHERE slug = 'running';

-- Las clases ya programadas pueden tener un cupo mayor que el salon nuevo
-- (por ejemplo 24 bicis). Se recorta al maximo real para que la aritmetica de
-- disponibilidad siga siendo coherente.
UPDATE "Clase" c
SET "cupoMaximo" = 18
FROM "TipoClase" t
WHERE c."tipoClaseId" = t.id AND t.slug = 'spinning' AND c."layoutOverride" IS NULL AND c."cupoMaximo" > 18;

UPDATE "Clase" c
SET "cupoMaximo" = 6
FROM "TipoClase" t
WHERE c."tipoClaseId" = t.id AND t.slug = 'running' AND c."layoutOverride" IS NULL AND c."cupoMaximo" > 6;

-- Un puesto bloqueado que ya no existe en el salon nuevo solo estorba.
UPDATE "Clase" c
SET "puestosBloqueados" = ARRAY(
  SELECT p FROM unnest(c."puestosBloqueados") AS p
  WHERE p IN ('A1','A2','A3','B1','B2','B3','C1','C2','C3','D1','D2','D3','E1','E2','E3','F1','F2','F3')
)
FROM "TipoClase" t
WHERE c."tipoClaseId" = t.id AND t.slug = 'spinning' AND c."layoutOverride" IS NULL;

UPDATE "Clase" c
SET "puestosBloqueados" = ARRAY(
  SELECT p FROM unnest(c."puestosBloqueados") AS p WHERE p IN ('1','2','3','4','5','6')
)
FROM "TipoClase" t
WHERE c."tipoClaseId" = t.id AND t.slug = 'running' AND c."layoutOverride" IS NULL;
