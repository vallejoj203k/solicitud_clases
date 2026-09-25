# Modelo corporal 3D: cómo regenerar los GLB

Los cuerpos del visor `/composicion-corporal/3d` son las mallas de
MakeHuman / MPFB2 exportadas a GLB con sus morph targets. Ya están generados y
versionados en `client/public/modelo3d/`; solo hace falta regenerarlos si cambia
la lista de morphs, los landmarks o la versión de MPFB.

| Archivo | Qué es |
| --- | --- |
| `cuerpo-hombre.glb`, `cuerpo-mujer.glb` | malla del cuerpo (13 380 vértices, orden de MakeHuman intacto) + morph targets + atributo `_SEGMENTO` (0 tronco, 1 cabeza, 2 brazo izq, 3 brazo der, 4 pierna izq, 5 pierna der). Comprimidos con meshopt, ~1 MB cada uno. |
| `cuerpo-hombre.json`, `cuerpo-mujer.json` | significado de cada morph, landmarks de medida (índices de vértice), articulaciones (base + delta por morph), estatura/volumen de la base y con qué versión se generó. |

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

## Cuerpo esculpido

La figura que se ve es la escultura "Muscle Male" / "Muscle Female" de
Floriane Legros-Collard (`images/2284-legroscollardfloriane-*/source/*.fbx`),
atada al cuerpo de MakeHuman para que siga las medidas de cada cliente:

```bash
.blenv/bin/python tools/export_escultura.py --salida tools/build \
  --pesos ruta/a/mpfb2/src/mpfb/data/rigs/standard/weights.default.json
npm run modelo3d:escultura     # simplifica (~150 000 triángulos), comprime y copia
```

1. Escala la escultura a la estatura del cuerpo base y centra el tronco.
2. Registro no rígido: el cuerpo base se deforma hasta calzar sobre la
   escultura (puntos más cercanos en las dos direcciones + Laplaciano, rigidez
   decreciente). Dedos, ojos y boca de MakeHuman quedan libres (siguen a sus
   vecinos): la escultura no los tiene igual.
3. Ata cada vértice de la escultura a ese cuerpo calzado (solo a triángulos
   fuera de dedos, ojos y boca): triángulo, baricéntricas, altura y residuo.
4. Cabeza, manos y pies llevan además su pieza y un peso (del esqueleto): en el
   navegador se mueven enteros con la semejanza que mejor lleva su zona del
   cuerpo calzado a la del cliente.

Requiere haber corrido antes `export_bodies.py` (usa `tools/build/cuerpo-*.glb`).

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
- **Cuerpo esculpido** (`images/2284-*`, `client/public/modelo3d/escultura-*`):
  modelos de Floriane Legros-Collard publicados en Sketchfab (colección "Base
  Mesh - Full Body - CC"). El crédito se muestra en la página. Conviene
  confirmar la licencia exacta en su página de Sketchfab (CC BY pide crédito;
  si fuera CC BY-NC no se puede usar con fines comerciales).
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
