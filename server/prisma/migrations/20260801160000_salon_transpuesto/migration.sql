-- Los salones estaban descritos con las filas y las columnas cambiadas:
--   Spinning: 18 bicicletas en 6 columnas x 3 filas  (antes 3 x 6)
--   Running :  6 trotadoras en 3 columnas x 2 filas  (antes 2 x 3)
--
-- El bootstrap de arranque solo inserta lo que falta -nunca sobrescribe- para
-- respetar lo que edite el administrador, asi que los tipos que ya existen se
-- actualizan aqui.

UPDATE "TipoClase"
SET "layoutPuestos" = '{
  "titulo": "TARIMA · INSTRUCTOR",
  "numeracion": "porFila",
  "filas": [
    { "label": "A", "puestos": 6, "nota": "Primera fila" },
    { "label": "B", "puestos": 6 },
    { "label": "C", "puestos": 6 }
  ]
}'::jsonb
WHERE slug = 'spinning';

UPDATE "TipoClase"
SET "layoutPuestos" = '{
  "titulo": "PANTALLAS · FRENTE",
  "numeracion": "continua",
  "filas": [
    { "label": "F1", "puestos": 3, "nota": "Frente" },
    { "label": "F2", "puestos": 3 }
  ]
}'::jsonb
WHERE slug = 'running';

-- --------------------------------------------------------------------------
-- Spinning: los codigos cambian de conjunto (antes A1..F3, ahora A1..C6), asi
-- que las reservas hay que TRASPONERLAS o la mitad quedarian apuntando a un
-- puesto inexistente.
--
-- Es la misma bicicleta con otro nombre: la fila vieja pasa a ser columna.
--   letra A..F  ->  numero de columna 1..6
--   numero 1..3 ->  letra de fila A..C
-- Ejemplos: A1->A1, A2->B1, D2->B4, F3->C6.
--
-- Se hace en dos pasos con un prefijo temporal porque el cambio incluye ciclos
-- (A2->B1 y B1->A2): el indice unico parcial de puesto activo se evalua fila a
-- fila y un intercambio directo chocaria consigo mismo a mitad de camino.
-- --------------------------------------------------------------------------

UPDATE "Reserva" r
SET "puestoCodigo" = 'T' || r."puestoCodigo"
FROM "Clase" c
JOIN "TipoClase" t ON t.id = c."tipoClaseId"
WHERE r."claseId" = c.id
  AND t.slug = 'spinning'
  AND c."layoutOverride" IS NULL
  AND r."puestoCodigo" IN ('A1','A2','A3','B1','B2','B3','C1','C2','C3',
                           'D1','D2','D3','E1','E2','E3','F1','F2','F3');

UPDATE "Reserva" r
SET "puestoCodigo" = CASE r."puestoCodigo"
  WHEN 'TA1' THEN 'A1' WHEN 'TA2' THEN 'B1' WHEN 'TA3' THEN 'C1'
  WHEN 'TB1' THEN 'A2' WHEN 'TB2' THEN 'B2' WHEN 'TB3' THEN 'C2'
  WHEN 'TC1' THEN 'A3' WHEN 'TC2' THEN 'B3' WHEN 'TC3' THEN 'C3'
  WHEN 'TD1' THEN 'A4' WHEN 'TD2' THEN 'B4' WHEN 'TD3' THEN 'C4'
  WHEN 'TE1' THEN 'A5' WHEN 'TE2' THEN 'B5' WHEN 'TE3' THEN 'C5'
  WHEN 'TF1' THEN 'A6' WHEN 'TF2' THEN 'B6' WHEN 'TF3' THEN 'C6'
END
FROM "Clase" c
JOIN "TipoClase" t ON t.id = c."tipoClaseId"
WHERE r."claseId" = c.id
  AND t.slug = 'spinning'
  AND c."layoutOverride" IS NULL
  AND r."puestoCodigo" IN ('TA1','TA2','TA3','TB1','TB2','TB3','TC1','TC2','TC3',
                           'TD1','TD2','TD3','TE1','TE2','TE3','TF1','TF2','TF3');

-- Los puestos fuera de servicio se trasponen igual. Los que ya no existian en el
-- salon anterior se descartan: solo estorban.
UPDATE "Clase" c
SET "puestosBloqueados" = ARRAY(
  SELECT CASE p
    WHEN 'A1' THEN 'A1' WHEN 'A2' THEN 'B1' WHEN 'A3' THEN 'C1'
    WHEN 'B1' THEN 'A2' WHEN 'B2' THEN 'B2' WHEN 'B3' THEN 'C2'
    WHEN 'C1' THEN 'A3' WHEN 'C2' THEN 'B3' WHEN 'C3' THEN 'C3'
    WHEN 'D1' THEN 'A4' WHEN 'D2' THEN 'B4' WHEN 'D3' THEN 'C4'
    WHEN 'E1' THEN 'A5' WHEN 'E2' THEN 'B5' WHEN 'E3' THEN 'C5'
    WHEN 'F1' THEN 'A6' WHEN 'F2' THEN 'B6' WHEN 'F3' THEN 'C6'
  END
  FROM unnest(c."puestosBloqueados") AS p
  WHERE p IN ('A1','A2','A3','B1','B2','B3','C1','C2','C3',
              'D1','D2','D3','E1','E2','E3','F1','F2','F3')
)
FROM "TipoClase" t
WHERE c."tipoClaseId" = t.id AND t.slug = 'spinning' AND c."layoutOverride" IS NULL;

-- Running no necesita migracion de datos: la numeracion es continua y sigue
-- yendo de 1 a 6, asi que ninguna reserva queda huerfana. Lo que cambia es
-- donde queda cada numero dentro del salon (antes 2 por fila, ahora 3).
