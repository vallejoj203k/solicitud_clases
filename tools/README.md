# Modelo corporal 3D: cómo regenerar los GLB

Los cuerpos del visor `/composicion-corporal/3d` son las mallas de
MakeHuman / MPFB2 exportadas a GLB con sus morph targets. Ya están generados y
versionados en `client/public/modelo3d/`; solo hace falta regenerarlos si cambia
la lista de morphs, los landmarks o la versión de MPFB.

| Archivo | Qué es |
| --- | --- |
| `cuerpo-hombre.glb`, `cuerpo-mujer.glb` | malla del cuerpo (13 380 vértices, orden de MakeHuman intacto) + morph targets + atributo `_SEGMENTO` (0 tronco, 1 cabeza, 2 brazo izq, 3 brazo der, 4 pierna izq, 5 pierna der). Comprimidos con meshopt, ~1 MB cada uno. |
| `cuerpo-hombre.json`, `cuerpo-mujer.json` | significado de cada morph, landmarks de medida (índices de vértice), articulaciones (base + delta por morph), estatura/volumen de la base y con qué versión se generó. |
| `musculos-hombre.glb`, `musculos-mujer.glb` | músculos de Z-Anatomy atados al cuerpo (~140 000 triángulos, ~2,4 MB). Ver [Músculos](#músculos-anatómicos-z-anatomy). |
| `musculos-hombre.json`, `musculos-mujer.json` | nombre en español, en inglés y lado de cada pieza, y la licencia. |

## Requisitos

- **Blender 4.2 o superior**, o Blender como módulo de Python
  (`pip install bpy==4.5.4`, que necesita **Python 3.11** exacto).
- **MPFB2** (probado con 2.0.17, commit `7fcc8df`):
  `git clone https://github.com/makehumancommunity/mpfb2`. El repo trae los
  assets (targets, basemesh, pesos del esqueleto) en `src/mpfb/data`.
- **Node 20+** con las dependencias de la raíz instaladas (`npm install`), que
  incluyen `meshoptimizer`.

## Pasos

```bash
# 1. Exportar (≈1 minuto). Deja los GLB sin comprimir (~3 MB) y los JSON en tools/build/
#    (carpeta ignorada por git).

#    a) Con Blender instalado y MPFB2 habilitado como extensión:
blender -b --factory-startup -P tools/export_bodies.py -- --salida tools/build

#    b) O con bpy desde pip; --mpfb-src instala MPFB como extensión la primera vez:
python3.11 -m venv .blenv && .blenv/bin/pip install bpy==4.5.4 numpy
.blenv/bin/python tools/export_bodies.py --salida tools/build --mpfb-src ruta/a/mpfb2/src/mpfb

# 2. Comprimir y copiar a client/public/modelo3d (GLB comprimidos + JSON):
npm run modelo3d:comprimir
```

Opciones de `export_bodies.py`: `--sexos M`, `--sexos F` o `--sexos M,F`
(por defecto los dos).

Consejo: `BLENDER_USER_RESOURCES=/alguna/carpeta` hace que la extensión MPFB se
instale ahí y no en la configuración de Blender del usuario.

## Qué hace el exportador

1. **Cuerpo base**: joven de 25 años, promedio en músculo, peso, altura y
   proporciones, mezcla de etnias neutra de MakeHuman (⅓ cada una; la etnia no
   es un control). Solo el grupo `body` de la malla
   hm08 (sin ojos, dientes, pestañas ni helpers), sin genitales, cejas ni pelo.
2. **Macros de MakeHuman**: los targets macro de MakeHuman son combinaciones
   (sexo × edad × músculo × peso × …) con pesos que no son lineales. En vez de
   copiarlos, se muestrea el cuerpo real de MPFB en una rejilla 3 × 3 de
   músculo × peso (0, 0,5, 1) y se guardan las 8 esquinas como deltas; el
   navegador interpola bilineal por cuadrante, que es lo mismo que hace MakeHuman
   entre esos puntos. Edad (25→90), altura mín./máx., proporciones y copa
   (mujer) van como un delta cada uno (se ignoran sus términos cruzados).
3. **Morphs locales**: grasa/músculo por brazo y pierna, barriga, cintura,
   cadera, pecho, cuello, hombros, largo de piernas, pectoral, espalda en V,
   flancos, cara, glúteos, papada y pecho graso (hombre). La lista está en
   `MORPHS_LOCALES`.
4. **Alisado** (maniquí sin detalle anatómico): los pezones se reemplazan por
   una superficie suave en la base y en todos los morphs; en el ombligo solo se
   alisan los deltas, para que la barriga no lo saque como un botón. Ver
   `ZONAS_ALISADO` y la clase `Alisador`.
5. **Segmentos**: cada vértice va al segmento de su hueso con más peso en
   `rigs/standard/weights.default.json`.
6. **Landmarks de medida**: la banda de vértices que más mueven los targets de
   medida de MakeHuman (`measure-waist-circ`, `measure-hips-circ`, …).
7. **Articulaciones**: centro de los cubos de articulación de la malla, con su
   delta por morph, para medir brazos y piernas en planos perpendiculares al hueso.

Coordenadas: metros, glTF con Y arriba, el cuerpo mira hacia +Z, izquierda del
cliente = +X, pies en y = 0.

## Por qué un compresor propio y no gltfpack

`gltfpack` reordena los vértices (para la caché de la GPU) y descarta el
atributo `_SEGMENTO`. Los landmarks y segmentos son índices de vértice, así que
`tools/comprimir_glb.mjs` comprime con meshopt **sin reordenar**: morphs a int16
normalizado (`KHR_mesh_quantization`, error < 0,03 mm) y cada bufferView con
`EXT_meshopt_compression`. El navegador los lee con el `MeshoptDecoder` que trae
three.js, sin descargar nada de otro sitio.

## Músculos anatómicos (Z-Anatomy)

Los músculos de la vista "Grasa y músculo" son los modelos de
[Z-Anatomy](https://www.z-anatomy.com) (derivados de BodyParts3D) adaptados a
cada cuerpo. Se regeneran con:

```bash
# Z-Anatomy (solo hacen falta los FBX y la tabla de traducciones):
git clone --depth 1 --filter=blob:none --no-checkout https://github.com/LluisV/Z-Anatomy
git -C Z-Anatomy checkout HEAD -- Resources/Models Resources/Translations0.txt

# Con bpy + numpy + scipy (el mismo entorno de export_bodies.py, más scipy):
.blenv/bin/python tools/export_musculos.py --z-anatomy Z-Anatomy --salida tools/build
npm run modelo3d:musculos      # simplifica, comprime y copia a client/public/modelo3d
```

Qué hace `export_musculos.py` (detalle en el propio archivo):

1. Lee los músculos (sin bolsas, vainas, fascias que los tapan ni órganos) y el
   esqueleto de Z-Anatomy, y el cuerpo base de MakeHuman con su esqueleto.
2. Pone el cuerpo de MakeHuman en la postura de Z-Anatomy (brazos abajo, palmas
   adelante) con los pesos de su esqueleto, llevando cada articulación a la de Z-A.
3. Ata cada vértice de músculo a la piel de ese cuerpo: triángulo, baricéntricas,
   altura sobre la normal y residuo tangente. El navegador rearma el músculo con
   el mismo atado sobre el cuerpo sin grasa del cliente, en su pose.
4. Corrige la altura para que la primera capa de músculo quede justo bajo la piel
   (rayos desde la piel, campo suave) y descarta las piezas que no se ven.
5. Quita lo que no encaja entre las dos mallas: manos, pies y cabeza (los cubre el
   cuerpo pintado de `musculos.ts`), telas estiradas entre brazo y tronco o entre
   los muslos, y el final de la línea alba, del recto y de los aductores en el pubis.

Los triángulos del cuerpo se usan en forma canónica (empezando por el vértice
menor): la compresión meshopt de los índices puede rotar sus vértices.

## Licencias

- **Assets de MakeHuman / MPFB2** (basemesh, targets, pesos): **CC0 1.0**.
  Los GLB y JSON generados son salida de MPFB con esos assets: libres, incluso
  para uso comercial.
- **Código de MPFB2**: GPLv3. `tools/export_bodies.py` usa su API, así que ese
  script es GPLv3. Es una herramienta de desarrollo: no se publica con la app ni
  corre en el navegador.
- **Iluminación** (`client/public/modelo3d/estudio.hdr`): HDRI "Studio Small 03" de
  Poly Haven (Sergej Majboroda), **CC0**, versión 1k. Se descargó de la copia de
  `pmndrs/drei-assets` y se sirve desde la app, sin depender de ningún servicio.
- **Músculos** (`client/public/modelo3d/musculos-*`): obra derivada de
  **Z-Anatomy** (CC BY-SA 4.0), a su vez derivada de **BodyParts3D** (The Database
  Center for Life Science, CC BY-SA 2.1 Japón). Se distribuyen con la misma
  licencia (ver `client/public/modelo3d/LICENCIA-musculos.txt`); la atribución se
  muestra en la página y en la imagen PNG. `tools/export_musculos.py` usa
  `export_bodies.py`, así que también es GPLv3.
- No se usa SMPL, SMPL-X ni STAR (licencias no comerciales), ni el código del
  "Ruler" de MakeHuman 1.x (AGPL): los landmarks salen de los targets CC0.

## Después de regenerar: pruebas

```bash
npm test -w client
```

Carga los GLB de `client/public/modelo3d` en Node y comprueba el motor de
medición (fase 2): estatura y volumen iguales a los del exportador, volúmenes por
segmento que suman el total, simetría izquierda/derecha, circunferencias en
rangos humanos y que los morphs de peso, barriga y altura muevan las medidas
en la dirección correcta. También prueba la geometría con cilindros y esferas.
