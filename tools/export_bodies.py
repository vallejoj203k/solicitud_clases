"""
Exporta los cuerpos base (hombre y mujer) del modelo corporal 3D a GLB con
shape keys (morph targets), a partir de MakeHuman / MPFB2.

Uso (ver tools/README.md para el detalle):

    # Con Blender instalado (4.2 o superior) y MPFB2 habilitado como extensión:
    blender -b --factory-startup -P tools/export_bodies.py -- --salida tools/build

    # O con Blender como módulo de Python (pip install bpy==4.5.4) y el código
    # fuente de MPFB2 clonado:
    python tools/export_bodies.py --salida tools/build --mpfb-src ruta/a/mpfb2/src/mpfb

Salida, por sexo (hombre / mujer):
    cuerpo-<sexo>.glb   malla del cuerpo + morph targets + atributo _SEGMENTO
    cuerpo-<sexo>.json  nombres y significado de cada morph, landmarks de medida,
                        articulaciones y la configuración con que se generó

LICENCIA: este script llama a la API de MPFB2, que es GPLv3; por eso el script
también es GPLv3. Lo que produce (los GLB y JSON) es salida de MPFB hecha con
assets CC0: según la licencia de MPFB, esa salida es libre, incluso para uso
comercial. El script no se publica con la app: solo corre en la máquina de quien
regenera los modelos.
"""

import argparse
import datetime
import importlib
import json
import math
import os
import shutil
import struct
import sys

import bpy
import numpy as np

# --------------------------------------------------------------- Constantes

# El grupo 'body' del basemesh hm08: índices 0..N-1 (lo demás son helpers: ojos,
# dientes, pestañas, ropa ajustada, cubos de articulación). Se verifica al cargar.
N_CUERPO = 13380

# Mezcla de etnia de la malla base: la neutra de MakeHuman (⅓ cada una). El
# gimnasio no usa etnia, así que no se exporta como morph.
ETNIA_BASE = {"asian": 1 / 3, "caucasian": 1 / 3, "african": 1 / 3}

# Macros de MakeHuman en el punto base (joven de 25 años, promedio en todo).
MACRO_BASE = {
    "age": 0.5,
    "muscle": 0.5,
    "weight": 0.5,
    "proportions": 0.5,
    "height": 0.5,
    "cupsize": 0.5,
    "firmness": 0.5,
}

NIVELES = {"min": 0.0, "prom": 0.5, "max": 1.0}

# Morphs locales: nombre -> targets de MakeHuman que se suman (peso 1 cada uno).
# Son deltas crudos del basemesh, independientes de los macros, igual que en MH.
MORPHS_LOCALES = {}


def _agregar_bipolar(nombre, grupo, descripcion, incr, decr, solo=None):
    MORPHS_LOCALES[nombre + "_mas"] = dict(grupo=grupo, descripcion=descripcion + " (aumenta)", targets=incr, solo=solo)
    MORPHS_LOCALES[nombre + "_menos"] = dict(grupo=grupo, descripcion=descripcion + " (disminuye)", targets=decr, solo=solo)


for lado, l in (("izq", "l"), ("der", "r")):
    for tejido, t in (("grasa", "fat"), ("musculo", "muscle")):
        _agregar_bipolar(
            f"brazo_{lado}_{tejido}", "segmento", f"Brazo {lado}: {tejido} (brazo + antebrazo)",
            [f"{l}-upperarm-{t}-incr", f"{l}-lowerarm-{t}-incr"],
            [f"{l}-upperarm-{t}-decr", f"{l}-lowerarm-{t}-decr"],
        )
        _agregar_bipolar(
            f"pierna_{lado}_{tejido}", "segmento", f"Pierna {lado}: {tejido} (muslo + pantorrilla)",
            [f"{l}-upperleg-{t}-incr", f"{l}-lowerleg-{t}-incr"],
            [f"{l}-upperleg-{t}-decr", f"{l}-lowerleg-{t}-decr"],
        )

_agregar_bipolar("barriga", "torso", "Barriga (grasa visceral)", ["stomach-pregnant-incr"], ["stomach-pregnant-decr"])
_agregar_bipolar("cintura", "medida", "Circunferencia de cintura", ["measure-waist-circ-incr"], ["measure-waist-circ-decr"])
_agregar_bipolar("cadera", "medida", "Circunferencia de cadera", ["measure-hips-circ-incr"], ["measure-hips-circ-decr"])
_agregar_bipolar("pecho", "medida", "Circunferencia de pecho", ["measure-bust-circ-incr"], ["measure-bust-circ-decr"])
_agregar_bipolar("cuello", "medida", "Circunferencia de cuello", ["measure-neck-circ-incr"], ["measure-neck-circ-decr"])
_agregar_bipolar("hombros", "medida", "Ancho de hombros", ["measure-shoulder-dist-incr"], ["measure-shoulder-dist-decr"])
_agregar_bipolar(
    "entrepierna", "medida", "Largo de piernas (entrepierna)",
    ["measure-upperleg-height-incr", "measure-lowerleg-height-incr"],
    ["measure-upperleg-height-decr", "measure-lowerleg-height-decr"],
)
_agregar_bipolar("pectoral", "musculo", "Músculo pectoral", ["torso-muscle-pectoral-incr"], ["torso-muscle-pectoral-decr"])
_agregar_bipolar("espalda_v", "musculo", "Espalda en V (dorsales)", ["torso-vshape-incr"], ["torso-vshape-decr"])
_agregar_bipolar("torso_ancho", "grasa", "Ancho del torso (flancos)", ["torso-scale-horiz-incr"], ["torso-scale-horiz-decr"])
_agregar_bipolar("cara_grasa", "grasa", "Grasa en la cara", ["head-fat-incr"], ["head-fat-decr"])
_agregar_bipolar("gluteos", "grasa", "Volumen de glúteos", ["buttocks-volume-incr"], ["buttocks-volume-decr"])
MORPHS_LOCALES["papada"] = dict(grupo="grasa", descripcion="Papada", targets=["neck-double-incr"], solo=None)
MORPHS_LOCALES["pecho_graso"] = dict(
    grupo="grasa", descripcion="Pecho graso (hombre)", targets=["breast-volume-vert-up", "breast-point-incr"], solo="M"
)

# Landmarks de medida: se sacan de los targets CC0 de medida de MakeHuman. Los
# vértices que ese target mueve con más fuerza son la banda donde MakeHuman mide
# esa circunferencia. 'lados' parte la banda por el signo de X (izquierda del
# cliente = +X).
LANDMARKS = {
    "cintura": dict(target="measure-waist-circ-incr", lados=False),
    "cadera": dict(target="measure-hips-circ-incr", lados=False),
    "pecho": dict(target="measure-bust-circ-incr", lados=False),
    "bajo_busto": dict(target="measure-underbust-circ-incr", lados=False),
    "cuello": dict(target="measure-neck-circ-incr", lados=False),
    # Punta de cada hombro (acromion): el ancho de hombros es la distancia entre las dos.
    "hombro": dict(target="measure-shoulder-dist-incr", lados=True),
    # Altura del ombligo: donde se mide la cintura con cinta en el gimnasio.
    "ombligo": dict(target="stomach-navel-in", lados=False),
    "brazo": dict(target="measure-upperarm-circ-incr", lados=True),
    "muslo": dict(target="measure-thigh-circ-incr", lados=True),
    "pantorrilla": dict(target="measure-calf-circ-incr", lados=True),
}
UMBRAL_BANDA = 0.5  # fracción del desplazamiento máximo del target

# Articulaciones (centro de los cubos de articulación del basemesh). Se exportan
# con sus deltas por morph, para que el navegador las mueva igual que la malla.
ARTICULACIONES = [
    "joint-neck", "joint-head", "joint-pelvis", "joint-spine-1", "joint-spine-2", "joint-spine-3", "joint-spine-4",
    "joint-l-clavicle", "joint-r-clavicle",
    "joint-l-shoulder", "joint-r-shoulder", "joint-l-elbow", "joint-r-elbow", "joint-l-hand", "joint-r-hand",
    "joint-l-upper-leg", "joint-r-upper-leg", "joint-l-knee", "joint-r-knee", "joint-l-ankle", "joint-r-ankle",
]

SEGMENTOS = ["tronco", "cabeza", "brazo_izq", "brazo_der", "pierna_izq", "pierna_der"]

# Zonas que se alisan (maniquí sin detalle anatómico). La zona son los vértices
# que mueven esos targets, más 'anillos' vueltas de vecinos alrededor; la
# superficie de la zona se reemplaza por una cuadrática ajustada a las
# 'ajuste' vueltas de vecinos que la rodean (ver Alisador).
#  - pezones: se alisa la malla entera (base y todos los morphs), así no
#    reaparecen con ningún ajuste.
#  - ombligo: se conserva el de la base, pero se alisan los deltas de los morphs
#    en esa zona; si no, 'stomach-pregnant' lo saca hacia afuera como un botón.
ZONAS_ALISADO = {
    "pezones": dict(targets=["nipple-size-incr", "nipple-point-incr"], anillos=3, ajuste=2, base=True),
    "ombligo": dict(targets=["stomach-navel-in", "stomach-navel-out"], anillos=2, ajuste=2, base=False),
}
MEZCLA_BORDE = 2  # vueltas del borde de la zona que pasan gradualmente a la malla original

UMBRAL_DELTA = 1e-5  # m: por debajo se considera que el morph no mueve el vértice
FRACCION_DISPERSA = 0.4  # si el morph mueve menos que esta fracción de vértices, va disperso


# ------------------------------------------------------------ Argumentos

def leer_argumentos():
    argv = sys.argv
    argv = argv[argv.index("--") + 1:] if "--" in argv else argv[1:]
    p = argparse.ArgumentParser(description=__doc__.split("\n")[1])
    p.add_argument("--salida", required=True, help="carpeta donde escribir los GLB y JSON")
    p.add_argument("--mpfb-src", default=None, help="carpeta src/mpfb del repo de MPFB2 (si no está instalado)")
    p.add_argument("--sexos", default="M,F", help="M, F o ambos separados por coma")
    return p.parse_args(argv)


# ------------------------------------------------------------ Carga de MPFB

def cargar_mpfb(mpfb_src):
    """Devuelve el paquete de MPFB habilitado (bl_ext.<repo>.mpfb)."""
    import addon_utils

    candidatos = ["bl_ext.user_default.mpfb", "bl_ext.blender_org.mpfb"]
    for nombre in candidatos:
        try:
            addon_utils.enable(nombre, default_set=True, persistent=True)
            return importlib.import_module(nombre)
        except Exception:  # noqa: BLE001 -- probar el siguiente repositorio
            pass

    if not mpfb_src:
        sys.exit("No encuentro MPFB2 habilitado en Blender. Instálalo, o pasa --mpfb-src ruta/a/mpfb2/src/mpfb")

    destino = os.path.join(bpy.utils.user_resource("EXTENSIONS", path="user_default", create=True), "mpfb")
    if not os.path.exists(destino):
        shutil.copytree(mpfb_src, destino)
    addon_utils.enable("bl_ext.user_default.mpfb", default_set=True, persistent=True)
    return importlib.import_module("bl_ext.user_default.mpfb")


# ------------------------------------------------------ Geometría con MPFB

class Fabrica:
    """Crea humanos con MPFB y devuelve las posiciones de sus vértices."""

    def __init__(self, mpfb):
        self.mpfb = mpfb
        self.HumanService = importlib.import_module(mpfb.__name__ + ".services.humanservice").HumanService
        self.TargetService = importlib.import_module(mpfb.__name__ + ".services.targetservice").TargetService
        self.dir_datos = os.path.join(os.path.dirname(mpfb.__file__), "data")

        h = self.HumanService.create_human()
        cuerpo = h.vertex_groups["body"].index
        indices = [v.index for v in h.data.vertices if any(g.group == cuerpo for g in v.groups)]
        if indices != list(range(N_CUERPO)):
            sys.exit(f"El grupo 'body' no son los índices 0..{N_CUERPO - 1}; revisa la versión del basemesh.")

        self.n_total = len(h.data.vertices)
        self.grupos_articulacion = {}
        for nombre in ARTICULACIONES:
            if nombre not in h.vertex_groups:
                print(f"AVISO: no existe el grupo {nombre}; se omite")
                continue
            g = h.vertex_groups[nombre].index
            self.grupos_articulacion[nombre] = [v.index for v in h.data.vertices if any(x.group == g for x in v.groups)]

        # Triángulos del cuerpo (quads partidos en dos) y basemesh sin macros.
        tris = []
        for poly in h.data.polygons:
            vs = list(poly.vertices)
            if max(vs) >= N_CUERPO:
                continue
            for i in range(1, len(vs) - 1):
                tris.append((vs[0], vs[i], vs[i + 1]))
        self.triangulos = np.array(tris, dtype=np.uint32)

        base = np.empty(self.n_total * 3)
        h.data.shape_keys.key_blocks["Basis"].data.foreach_get("co", base)
        self.basemesh = base.reshape(-1, 3)
        self.humano_crudo = h

    def macro(self, sexo, **cambios):
        m = self.TargetService.get_default_macro_info_dict()
        m.update(MACRO_BASE)
        m["gender"] = 1.0 if sexo == "M" else 0.0
        m["race"] = dict(ETNIA_BASE)
        m.update(cambios)
        return m

    def posiciones(self, macro):
        """Posiciones (todas, incluidos helpers) del humano con esos macros."""
        h = self.HumanService.create_human(macro_detail_dict=macro)
        # MPFB oculta los helpers con un modificador de máscara; sin apagarlo, la
        # malla evaluada pierde los cubos de articulación.
        for mod in h.modifiers:
            mod.show_viewport = False
        dg = bpy.context.evaluated_depsgraph_get()
        ev = h.evaluated_get(dg)
        me = ev.to_mesh()
        arr = np.empty(len(me.vertices) * 3)
        me.vertices.foreach_get("co", arr)
        ev.to_mesh_clear()
        malla = h.data
        bpy.data.objects.remove(h, do_unlink=True)
        if malla.users == 0:
            bpy.data.meshes.remove(malla)
        return arr.reshape(-1, 3)

    def delta_target(self, nombre):
        """Delta crudo (todos los vértices) de un target de MakeHuman."""
        ruta = self.TargetService.target_full_path(nombre)
        if not ruta or not os.path.exists(ruta):
            sys.exit(f"No existe el target '{nombre}' en esta versión de MPFB2")
        h = self.humano_crudo
        self.TargetService.load_target(h, ruta, weight=1.0, name="__tmp")
        clave = h.data.shape_keys.key_blocks["__tmp"]
        arr = np.empty(self.n_total * 3)
        clave.data.foreach_get("co", arr)
        h.shape_key_remove(clave)
        return arr.reshape(-1, 3) - self.basemesh


# ------------------------------------------------------------ Utilidades

def a_gltf(p):
    """Blender (Z arriba, mira a -Y) -> glTF (Y arriba, mira a +Z)."""
    return np.stack([p[:, 0], p[:, 2], -p[:, 1]], axis=1)


def normales_suaves(pos, tris):
    n = np.zeros_like(pos)
    a, b, c = pos[tris[:, 0]], pos[tris[:, 1]], pos[tris[:, 2]]
    cara = np.cross(b - a, c - a)  # longitud = 2 x área: ponderado por área
    for k in range(3):
        np.add.at(n, tris[:, k], cara)
    n /= np.linalg.norm(n, axis=1, keepdims=True).clip(min=1e-12)
    return n


def volumen(pos, tris):
    a, b, c = pos[tris[:, 0]], pos[tris[:, 1]], pos[tris[:, 2]]
    return float(np.einsum("ij,ij->i", a, np.cross(b, c)).sum() / 6.0)


class Alisador:
    """Reemplaza la superficie de una zona por una cuadrática ajustada a su borde.

    Por cada parte conexa de la zona (p. ej. cada pezón): con la malla de
    referencia se arma un marco local (centro, normal media y dos tangentes) y
    se ajusta por mínimos cuadrados una altura h = a + bx + cy + dx² + exy + fy²
    a los anillos de vecinos que la rodean. Dentro de la zona solo cambia la
    componente normal; lo tangencial queda igual. Como el marco y las
    coordenadas salen de la referencia, cada parte es una matriz fija (zona <-
    anillo de ajuste): es lineal, y alisar la base y cada delta por separado da
    lo mismo que alisar la malla final, con cualquier combinación de pesos.

    (Un laplaciano uniforme no sirve aquí: la malla alrededor del pezón es
    radial, con anillos muy juntos en el centro, y el resultado queda en punta.)
    """

    def __init__(self, tris, zona, ajuste):
        aristas = np.concatenate([tris[:, [0, 1]], tris[:, [1, 2]], tris[:, [2, 0]]])
        aristas = np.unique(np.sort(aristas, axis=1), axis=0)
        self.tris = tris
        self.a, self.b = aristas[:, 0], aristas[:, 1]
        self.zona = zona
        self.ajuste = ajuste

    def vecinos(self, mascara):
        m = mascara.copy()
        m[self.a[mascara[self.b]]] = True
        m[self.b[mascara[self.a]]] = True
        return m

    def partes(self):
        restante = self.zona.copy()
        while restante.any():
            parte = np.zeros(N_CUERPO, bool)
            parte[np.argmax(restante)] = True
            while True:
                mas = self.vecinos(parte) & self.zona
                if mas.sum() == parte.sum():
                    break
                parte = mas
            restante &= ~parte
            yield parte

    def preparar(self, ref):
        """ref: posiciones (N_CUERPO x 3) de la malla con la que se arma el marco."""
        nor = normales_suaves(ref, self.tris)
        self.bloques = []
        for parte in self.partes():
            anillo = parte
            for _ in range(self.ajuste):
                anillo = self.vecinos(anillo)
            anillo &= ~parte
            dentro, afuera = np.nonzero(parte)[0], np.nonzero(anillo)[0]
            centro = ref[dentro].mean(axis=0)
            n = nor[dentro].mean(axis=0)
            n /= np.linalg.norm(n)
            u = np.cross(n, [0.0, 0.0, 1.0] if abs(n[2]) < 0.9 else [1.0, 0.0, 0.0])
            u /= np.linalg.norm(u)
            v = np.cross(n, u)

            def diseno(idx):
                x, y = (ref[idx] - centro) @ u, (ref[idx] - centro) @ v
                return np.stack([np.ones_like(x), x, y, x * x, x * y, y * y], axis=1)

            m = diseno(dentro) @ np.linalg.pinv(diseno(afuera))
            # Transición: las vueltas exteriores de la zona se mezclan con la
            # malla original para que no quede un escalón en el borde.
            mezcla = np.ones(N_CUERPO)
            interior = parte.copy()
            for k in range(MEZCLA_BORDE):
                borde = interior & self.vecinos(~interior)
                mezcla[borde] = (k + 1) / (MEZCLA_BORDE + 1)
                interior &= ~borde
            self.bloques.append((dentro, afuera, n, m, mezcla[dentro]))
        return self

    def __call__(self, p):
        p = p.copy()
        for dentro, afuera, n, m, mezcla in self.bloques:
            h = p @ n
            p[dentro] += np.outer(mezcla * (m @ h[afuera] - h[dentro]), n)
        return p


def zona_alisado(fab, cfg):
    movido = np.zeros(N_CUERPO, bool)
    for t in cfg["targets"]:
        movido |= np.linalg.norm(fab.delta_target(t)[:N_CUERPO], axis=1) > UMBRAL_DELTA
    alis = Alisador(fab.triangulos, movido, cfg["ajuste"])
    zona = movido
    for _ in range(cfg["anillos"]):
        zona = alis.vecinos(zona)
    alis.zona = zona
    return alis


def segmentos_por_vertice(dir_datos):
    ruta = os.path.join(dir_datos, "rigs", "standard", "weights.default.json")
    pesos = json.load(open(ruta))
    pesos = pesos.get("weights", pesos)
    mejor = np.zeros(N_CUERPO)
    hueso = [None] * N_CUERPO
    for nombre, lista in pesos.items():
        for vi, w in lista:
            if vi < N_CUERPO and w > mejor[vi]:
                mejor[vi], hueso[vi] = w, nombre

    def segmento(b):
        lado = "izq" if b.endswith(".L") else "der" if b.endswith(".R") else None
        raiz = b[:-2] if lado else b
        if raiz.startswith(("upperarm", "lowerarm", "wrist", "finger", "metacarpal")):
            return f"brazo_{lado}"
        if raiz.startswith(("upperleg", "lowerleg", "foot", "toe")):
            return f"pierna_{lado}"
        if raiz.startswith(("neck", "head", "jaw", "eye", "oculi", "orbicularis", "oris", "levator",
                            "risorius", "temporalis", "special", "tongue")):
            return "cabeza"
        return "tronco"  # root, spine, pelvis, clavicle, shoulder, breast

    ids = np.array([SEGMENTOS.index(segmento(b)) if b else 0 for b in hueso], dtype=np.float32)
    sin_peso = sum(1 for b in hueso if b is None)
    return ids, sin_peso


# ----------------------------------------------------------- Escritura GLB

class EscritorGLB:
    def __init__(self):
        self.bin = bytearray()
        self.vistas = []
        self.accesores = []

    def _vista(self, datos, target=None):
        while len(self.bin) % 4:
            self.bin.append(0)
        vista = {"buffer": 0, "byteOffset": len(self.bin), "byteLength": len(datos)}
        if target:
            vista["target"] = target
        self.bin.extend(datos)
        self.vistas.append(vista)
        return len(self.vistas) - 1

    def accesor(self, arr, tipo, componente, target=None, minmax=False):
        arr = np.ascontiguousarray(arr)
        acc = {
            "bufferView": self._vista(arr.tobytes(), target),
            "componentType": componente,
            "count": int(arr.shape[0]),
            "type": tipo,
        }
        if minmax:
            acc["min"] = [float(x) for x in arr.min(axis=0)]
            acc["max"] = [float(x) for x in arr.max(axis=0)]
        self.accesores.append(acc)
        return len(self.accesores) - 1

    def accesor_disperso(self, delta, movidos):
        """Morph target VEC3 disperso: solo los vértices que se mueven."""
        idx = np.nonzero(movidos)[0].astype(np.uint16)
        valores = delta[movidos].astype(np.float32)
        acc = {
            "componentType": 5126,
            "count": int(delta.shape[0]),
            "type": "VEC3",
            "min": [float(min(0.0, x)) for x in valores.min(axis=0)],
            "max": [float(max(0.0, x)) for x in valores.max(axis=0)],
            "sparse": {
                "count": int(idx.shape[0]),
                "indices": {"bufferView": self._vista(idx.tobytes()), "componentType": 5123},
                "values": {"bufferView": self._vista(valores.tobytes())},
            },
        }
        self.accesores.append(acc)
        return len(self.accesores) - 1

    def guardar(self, ruta, gltf):
        gltf["accessors"] = self.accesores
        gltf["bufferViews"] = self.vistas
        while len(self.bin) % 4:
            self.bin.append(0)
        gltf["buffers"] = [{"byteLength": len(self.bin)}]
        js = json.dumps(gltf, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        js += b" " * ((4 - len(js) % 4) % 4)
        total = 12 + 8 + len(js) + 8 + len(self.bin)
        with open(ruta, "wb") as f:
            f.write(struct.pack("<III", 0x46546C67, 2, total))
            f.write(struct.pack("<II", len(js), 0x4E4F534A))
            f.write(js)
            f.write(struct.pack("<II", len(self.bin), 0x004E4942))
            f.write(self.bin)


# ------------------------------------------------------------- Por sexo

def exportar_sexo(fab, sexo, salida, deltas_locales, segmentos, landmarks, alisadores, info_mpfb):
    etiqueta = "hombre" if sexo == "M" else "mujer"
    print(f"\n=== {etiqueta} ===", flush=True)
    base_cfg = fab.macro(sexo)
    base = fab.posiciones(base_cfg)
    base_sin_alisar = base.copy()

    morphs = {}  # nombre -> (delta de todos los vértices, info)

    # Rejilla músculo x peso: cada esquina es el cuerpo real de MPFB en ese
    # punto menos la base. En el navegador se interpola bilineal por cuadrante,
    # que es exactamente lo que hace MakeHuman entre esos puntos.
    for nm, vm in NIVELES.items():
        for nw, vw in NIVELES.items():
            if nm == "prom" and nw == "prom":
                continue
            nombre = f"macro_musculo_{nm}_peso_{nw}"
            morphs[nombre] = (fab.posiciones(fab.macro(sexo, muscle=vm, weight=vw)) - base,
                              dict(grupo="macro", descripcion=f"Rejilla MakeHuman: músculo {nm}, peso {nw}",
                                   macro={"muscle": vm, "weight": vw}))
            print("  ", nombre, flush=True)

    otros = [
        ("macro_edad_mayor", dict(age=1.0), "Edad: de 25 a 90 años"),
        ("macro_altura_min", dict(height=0.0), "Altura mínima de MakeHuman"),
        ("macro_altura_max", dict(height=1.0), "Altura máxima de MakeHuman"),
        ("macro_proporciones_ideales", dict(proportions=1.0), "Proporciones ideales"),
    ]
    if sexo == "F":
        otros += [("macro_copa_min", dict(cupsize=0.0), "Copa mínima"),
                  ("macro_copa_max", dict(cupsize=1.0), "Copa máxima")]
    for nombre, cambios, descripcion in otros:
        morphs[nombre] = (fab.posiciones(fab.macro(sexo, **cambios)) - base,
                          dict(grupo="macro", descripcion=descripcion, macro=cambios))
        print("  ", nombre, flush=True)

    for nombre, (delta, info) in deltas_locales.items():
        if info["solo"] in (None, sexo):
            morphs[nombre] = (delta, dict(grupo=info["grupo"], descripcion=info["descripcion"],
                                          targets=info["targets"]))

    # ---- Alisado de zonas (solo vértices del cuerpo; los helpers no se tocan).
    for nombre_zona, alis in alisadores.items():
        alis.preparar(base_sin_alisar[:N_CUERPO])
        if ZONAS_ALISADO[nombre_zona]["base"]:
            base = base.copy()
            base[:N_CUERPO] = alis(base[:N_CUERPO])
        for nombre, (delta, info) in list(morphs.items()):
            d = delta.copy()
            d[:N_CUERPO] = alis(d[:N_CUERPO])
            morphs[nombre] = (d, info)
    cambio = np.linalg.norm(base[:N_CUERPO] - base_sin_alisar[:N_CUERPO], axis=1)
    print(f"  alisado: la base cambia hasta {cambio.max() * 1000:.1f} mm "
          f"({int((cambio > 1e-4).sum())} vértices)", flush=True)

    # ---- Geometría final en coordenadas glTF, con los pies en el suelo.
    tris = fab.triangulos
    pos = a_gltf(base[:N_CUERPO])
    pos[:, 1] -= pos[:, 1].min()
    nor = normales_suaves(pos, tris)

    esc = EscritorGLB()
    acc_pos = esc.accesor(pos.astype(np.float32), "VEC3", 5126, target=34962, minmax=True)
    acc_nor = esc.accesor(nor.astype(np.float32), "VEC3", 5126, target=34962)
    acc_seg = esc.accesor(segmentos, "SCALAR", 5126, target=34962)
    acc_idx = esc.accesor(tris.astype(np.uint16).reshape(-1), "SCALAR", 5123, target=34963)

    targets, nombres, info_claves = [], [], []
    tam_disperso = 0
    for nombre, (delta, info) in morphs.items():
        d = a_gltf(delta[:N_CUERPO]).astype(np.float32)
        movidos = np.linalg.norm(d, axis=1) > UMBRAL_DELTA
        if movidos.sum() == 0:
            print(f"AVISO: el morph {nombre} no mueve ningún vértice del cuerpo; se omite")
            continue
        if movidos.mean() < FRACCION_DISPERSA:
            acc = esc.accesor_disperso(d, movidos)
            tam_disperso += 1
        else:
            d[~movidos] = 0.0
            acc = esc.accesor(d, "VEC3", 5126, minmax=True)
        targets.append({"POSITION": acc})
        nombres.append(nombre)
        info_claves.append(dict(nombre=nombre, vertices_movidos=int(movidos.sum()), **info))

    gltf = {
        "asset": {"version": "2.0", "generator": "tools/export_bodies.py (MPFB2 %s)" % info_mpfb["version"],
                  "copyright": "Assets MakeHuman/MPFB2: CC0 1.0"},
        "scene": 0,
        "scenes": [{"nodes": [0]}],
        "nodes": [{"name": f"cuerpo_{etiqueta}", "mesh": 0}],
        "materials": [{"name": "maniqui", "pbrMetallicRoughness": {
            "baseColorFactor": [0.72, 0.72, 0.72, 1.0], "metallicFactor": 0.0, "roughnessFactor": 0.85}}],
        "meshes": [{
            "name": f"cuerpo_{etiqueta}",
            "primitives": [{
                "attributes": {"POSITION": acc_pos, "NORMAL": acc_nor, "_SEGMENTO": acc_seg},
                "indices": acc_idx, "material": 0, "mode": 4, "targets": targets,
            }],
            "weights": [0.0] * len(targets),
            "extras": {"targetNames": nombres},
        }],
    }
    ruta_glb = os.path.join(salida, f"cuerpo-{etiqueta}.glb")
    esc.guardar(ruta_glb, gltf)

    # ---- Articulaciones (base + delta por morph), en coordenadas glTF.
    desplazo_suelo = -a_gltf(base[:N_CUERPO])[:, 1].min()

    def centros(p):
        out = []
        for nombre in fab.grupos_articulacion:
            c = a_gltf(p[fab.grupos_articulacion[nombre]]).mean(axis=0)
            out.append(c)
        return np.array(out)

    art_base = centros(base)
    art_base[:, 1] += desplazo_suelo
    art_deltas = {n: np.round(centros(morphs[n][0]), 6).tolist() for n in nombres}

    # Ángulo del brazo (hombro -> codo) bajo la horizontal, para documentar la pose.
    nombres_art = list(fab.grupos_articulacion)
    hombro = art_base[nombres_art.index("joint-l-shoulder")]
    codo = art_base[nombres_art.index("joint-l-elbow")]
    d = codo - hombro
    angulo_brazo = math.degrees(math.atan2(-d[1], abs(d[0])))

    meta = {
        "version": 1,
        "sexo": sexo,
        "generado": datetime.date.today().isoformat(),
        "fuente": info_mpfb,
        "coordenadas": "metros; glTF con Y arriba; el cuerpo mira hacia +Z; izquierda del cliente = +X",
        "vertices": N_CUERPO,
        "triangulos": int(tris.shape[0]),
        "base": {"macros": {k: v for k, v in base_cfg.items() if k != "race"}, "etnia": ETNIA_BASE},
        "base_medidas": {
            "estatura_m": round(float(pos[:, 1].max()), 4),
            "volumen_l": round(volumen(pos, tris) * 1000, 3),
            "angulo_brazo_bajo_horizontal_grados": round(angulo_brazo, 1),
        },
        "morphs": info_claves,
        "segmentos": {"nombres": SEGMENTOS, "atributo": "_SEGMENTO",
                      "conteo": {s: int((segmentos == i).sum()) for i, s in enumerate(SEGMENTOS)}},
        "landmarks": landmarks,
        "articulaciones": {"nombres": nombres_art, "base": np.round(art_base, 6).tolist(), "deltas": art_deltas},
    }
    ruta_json = os.path.join(salida, f"cuerpo-{etiqueta}.json")
    with open(ruta_json, "w", encoding="utf-8") as f:
        json.dump(meta, f, ensure_ascii=False, separators=(",", ":"))

    print(f"  {len(nombres)} morphs ({tam_disperso} dispersos) | estatura {meta['base_medidas']['estatura_m']} m | "
          f"volumen {meta['base_medidas']['volumen_l']} L | brazo {angulo_brazo:.1f}° | "
          f"GLB {os.path.getsize(ruta_glb) / 1e6:.2f} MB", flush=True)


# ------------------------------------------------------------------ Main

def main():
    args = leer_argumentos()
    os.makedirs(args.salida, exist_ok=True)
    mpfb = cargar_mpfb(args.mpfb_src)
    manifiesto = open(os.path.join(os.path.dirname(mpfb.__file__), "blender_manifest.toml")).read()
    version = next((l.split("=")[1].strip().strip('"') for l in manifiesto.splitlines()
                    if l.startswith("version")), "?")
    info_mpfb = {"mpfb": "MPFB2", "version": version, "blender": bpy.app.version_string,
                 "licencia_assets": "CC0 1.0"}

    fab = Fabrica(mpfb)

    deltas_locales = {}
    for nombre, info in MORPHS_LOCALES.items():
        deltas_locales[nombre] = (sum(fab.delta_target(t) for t in info["targets"]), info)

    segmentos, sin_peso = segmentos_por_vertice(fab.dir_datos)
    if sin_peso:
        print(f"AVISO: {sin_peso} vértices sin peso de esqueleto quedaron en 'tronco'")

    landmarks = {}
    for nombre, cfg in LANDMARKS.items():
        mag = np.linalg.norm(fab.delta_target(cfg["target"])[:N_CUERPO], axis=1)
        x = fab.basemesh[:N_CUERPO, 0]
        partes = [("izq", x > 0), ("der", x < 0)] if cfg["lados"] else [(None, np.ones(N_CUERPO, bool))]
        for lado, mascara in partes:
            m = np.where(mascara, mag, 0.0)
            banda = np.nonzero(m >= UMBRAL_BANDA * m.max())[0]
            landmarks[f"{nombre}_{lado}" if lado else nombre] = {"target": cfg["target"], "vertices": banda.tolist()}

    alisadores = {}
    for nombre, cfg in ZONAS_ALISADO.items():
        alisadores[nombre] = zona_alisado(fab, cfg)
        print(f"zona de alisado '{nombre}': {int(alisadores[nombre].zona.sum())} vértices", flush=True)

    for sexo in [s.strip().upper() for s in args.sexos.split(",")]:
        exportar_sexo(fab, sexo, args.salida, deltas_locales, segmentos, landmarks, alisadores, info_mpfb)


if __name__ == "__main__":
    main()
    # Blender como módulo a veces se queda colgado al cerrar; salimos directo.
    sys.stdout.flush()
    os._exit(0)
