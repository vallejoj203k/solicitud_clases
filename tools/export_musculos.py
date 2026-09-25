"""Músculos anatómicos de Z-Anatomy atados al cuerpo de MakeHuman.

Genera, por sexo, los datos de `client/public/modelo3d/musculos-*.glb` (después
los arma y comprime `tools/musculos_glb.mjs`):

1. Lee los músculos de Z-Anatomy (FBX del sistema muscular) y el esqueleto (para
   ubicar las articulaciones), y el cuerpo base de MakeHuman con su esqueleto y
   sus pesos (MPFB2, como tools/export_bodies.py).
2. Pone el cuerpo de MakeHuman en la postura y las proporciones de Z-Anatomy
   (brazos abajo, palmas adelante): una transformación por segmento que lleva
   sus articulaciones a las de Z-A, mezclada con los pesos del esqueleto.
3. Ata cada vértice de músculo a la piel de ese cuerpo posado: triángulo más
   cercano, baricéntricas, altura sobre la normal y residuo tangente. Con el
   mismo atado sobre el cuerpo en su pose de reposo (o deformado por los datos
   del cliente) el músculo queda en la pose y la forma de ese cuerpo.
4. Capa exterior: rayos desde la piel hacia adentro. La altura de los músculos
   se corrige (campo suave sobre la piel) para que la primera capa que se ve
   quede justo bajo la piel; las piezas que ningún rayo ve se descartan.
5. Quita lo que no encaja entre las dos mallas (manos, pies y cabeza, cuya forma
   no coincide; telas estiradas entre brazo y tronco o entre los muslos) y
   escribe tools/build/musculos-{M,F}.bin y .json con nombres en español
   (tabla de traducciones de Z-Anatomy).

Licencia de los modelos: Z-Anatomy (CC BY-SA 4.0), derivados de BodyParts3D
(CC BY-SA 2.1 Japón). Los GLB resultantes son obra derivada y se distribuyen con
la misma licencia; la atribución va en la página y en la imagen PNG.

Uso (Blender como módulo de Python, con numpy y scipy):
    .blenv/bin/python tools/export_musculos.py --z-anatomy ruta/a/z-anatomy --salida tools/build
    node tools/musculos_glb.mjs tools/build client/public/modelo3d
"""
import argparse
import json
import os
import sys

import bpy  # noqa: I001 -- primero: bmesh y mathutils existen recién después de importar bpy
import bmesh
import numpy as np
import scipy.sparse as sp
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from scipy.spatial import cKDTree

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import export_bodies as eb  # noqa: E402

# ------------------------------------------------------------ Parámetros

# Reducción de las mallas de Z-A al leerlas (la final la hace musculos_glb.mjs).
RATIO_LECTURA = 0.3
# Materiales y nombres que no se usan: bolsas, vainas, cartílago, órganos.
FUERA_MATERIAL = {'Bursa', 'Articular capsule.001', 'Cartilage.001', 'Diaphragm', 'Phonation', 'Ingestion'}
FUERA_NOMBRE = ('Cross Section', 'bursa', 'Bursa', 'sheath', 'Synovial', 'septum', 'Diaphragm', 'Transversalis',
                'Levator ani', 'Coccygeus')
FUERA_GRUPO_LECTURA = ('Laryngeal', 'Pharyngeal', 'Muscles of tongue', 'Extra-ocular', 'Fasciae')
# Fascias: tapan a los músculos, salvo estas láminas que en las láminas de anatomía se ven.
SI_FASCIA = ('Palmar aponeurosis', 'Posterior layer of thoracolumbar fascia')
TENDINOSO = {'Tendon', 'Ligament.001', 'Fascia'}

# Capa exterior del músculo bajo la piel del cuerpo sin grasa (m).
PROFUNDIDAD_EXTERIOR = -0.0015
# Vueltas de rayos para dejar la capa exterior justo bajo la piel.
ITERACIONES_CAPA = 3
# Pasadas de alisado de la corrección sobre la piel.
ALISADO_CORRECCION = 10
# Rayos: desde FUERA afuera de la piel, hasta ALCANCE de recorrido (m).
FUERA, ALCANCE = 0.03, 0.16
# Una pieza se queda si la tocan al menos estos rayos.
RAYOS_MINIMOS = 10
# Caras que unen dos segmentos del cuerpo (brazo y tronco, un muslo y el otro)
# y al pasar de la pose de Z-A a la del cuerpo (brazos en A, piernas abiertas)
# se estiran más que esto: son telas que en la pose nueva no existen.
ESTIRAMIENTO_MAX = 1.8
# Estructuras internas que asoman por huecos entre la malla de Z-A y la de MH.
PROFUNDOS = ('Palatopharyngeus', 'Medial pterygoid', 'Inferior head of lateral pterygoid',
             'Superior head of lateral pterygoid', 'Longus colli', 'Longus capitis', 'Rectus anterior capitis',
             'Transversus thoracis', 'Innermost intercostal', 'Internal intercostal', 'Transversus abdominis',
             'Internal abdominal oblique', 'Pubo-analis', 'Obturator', 'Psoas', 'Iliacus', 'Subscapularis',
             'Stylohyoid', 'Mylohyoid', 'Geniohyoid', 'Scalenus', 'Iliococcygeus', 'Pubococcygeus',
             'Tendinous arch of levator ani', 'External anal sphincter', 'Piriformis', 'Bulbospongiosus',
             'Ischiocavernosus', 'Superficial transverse perineal', 'Deep transverse perineal', 'Pyramidalis',
             'Platysma')
# Cabeza: la forma del cráneo de MakeHuman no coincide con la de Z-A (quedaba
# como un casco); la cabeza la muestra el cuerpo pintado de abajo.
GRUPOS_FUERA = ('Cranial part of muscular system.g', 'Digastric muscle.g', 'Suprahyoid muscles.g',
                'Muscles of soft palate.g')
# Láminas que tapan al recto abdominal (el "six pack"): se recortan las caras
# que quedan justo delante; alrededor, lo que queda es aponeurosis (tendón).
RECORTES = [(m, 'Rectus abdominis muscle') for m in
            ('External abdominal oblique muscle', 'Internal abdominal oblique muscle', 'Transversus abdominis muscle')]
RECORTE_DIST = 0.015
APONEUROSIS_DIST = 0.05
# Músculos del muslo cuyo origen en el pubis, atado a la piel del tronco, se
# estira sobre la línea media al abrir las piernas: se corta esa parte.
SOLO_EN_LA_PIERNA = ('Medial compartment of thigh.g',)
# La línea alba y el recto abdominal terminan en el pubis: por debajo se
# estirarían sobre los genitales del cuerpo de MakeHuman. Se cortan a esta
# altura sobre la horcajadura (m).
HASTA_EL_PUBIS = ('Linea alba', 'Rectus abdominis muscle')
PUBIS_ALTURA = 0.07
# Nombres que faltan en la tabla de traducciones de Z-Anatomy.
TRADUCCIONES_EXTRA = {
    'abdominal part of pectoralis major muscle': 'Porción abdominal del músculo pectoral mayor',
    'long head of biceps femoris': 'Cabeza larga del músculo bíceps femoral',
    'adductor minimus': 'Músculo aductor mínimo',
    'opponens digiti minimi muscle of foot': 'Músculo oponente del dedo pequeño del pie',
}

SEGMENTOS = ['tronco', 'cabeza'] + [f'{p}.{L}' for L in 'LR'
                                     for p in ('brazo', 'antebrazo1', 'antebrazo2', 'mano', 'muslo', 'pierna', 'pie')]
SEG = {s: i for i, s in enumerate(SEGMENTOS)}
# Segmento grueso: tronco, cabeza y las cuatro extremidades.
GRUESO = np.array([0, 1] + [2 + i // 7 for i in range(14)])


def a_gltf(p):
    p = np.asarray(p, dtype=np.float64)
    return np.stack([p[..., 0], p[..., 2], -p[..., 1]], axis=-1)


# ------------------------------------------------------------ Lectura

def leer_makehuman(mpfb_src):
    """Cuerpo base de cada sexo (posiciones, cabezas de hueso), triángulos y pesos del esqueleto."""
    fab = eb.Fabrica(eb.cargar_mpfb(mpfb_src))
    h = fab.humano_crudo
    carpeta = os.path.join(fab.dir_datos, 'rigs', 'standard')
    rig = json.load(open(os.path.join(carpeta, 'rig.default.json')))
    pesos = json.load(open(os.path.join(carpeta, 'weights.default.json')))
    pesos = pesos.get('weights', pesos)
    cubos = {}
    for b in rig.values():
        c = b['head'].get('cube_name')
        if c and c not in cubos:
            g = h.vertex_groups[c].index
            cubos[c] = [v.index for v in h.data.vertices if any(x.group == g for x in v.groups)]
    cuerpos = {}
    for sexo in 'MF':
        pos = fab.posiciones(fab.macro(sexo))

        def cabeza(d, pos=pos):
            if d['strategy'] == 'CUBE':
                return pos[cubos[d['cube_name']]].mean(0)
            if d['strategy'] == 'VERTEX':
                return pos[d['vertex_index']]
            return pos[d['vertex_indices']].mean(0)
        cuerpos[sexo] = (pos[:eb.N_CUERPO].copy(), {n: cabeza(b['head']) for n, b in rig.items()})
    return cuerpos, canonicos(fab.triangulos.astype(np.int64)), pesos


def canonicos(tris):
    """Cada triángulo empezando por su vértice menor (mismo sentido de giro).

    La compresión meshopt de los índices del cuerpo puede rotar los vértices de
    un triángulo; el atado usa esta forma y el navegador la rearma igual.
    """
    k = tris.argmin(1)
    return np.stack([tris[np.arange(len(tris)), (k + i) % 3] for i in range(3)], 1)


def leer_musculos(ruta_fbx):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.fbx(filepath=ruta_fbx)
    vs, ts, tobj, tten, nombres = [], [], [], [], []
    base = 0
    for o in list(bpy.context.scene.objects):
        if o.type != 'MESH' or any(k in o.name for k in FUERA_NOMBRE):
            continue
        mats = [m.name if m else '' for m in o.data.materials]
        if mats and all(m in FUERA_MATERIAL for m in mats):
            continue
        if 'Fascia' in mats and not o.name.startswith(SI_FASCIA):
            continue
        grupos = []
        q = o.parent
        while q:
            grupos.append(q.name)
            q = q.parent
        if any(g.startswith(FUERA_GRUPO_LECTURA) for g in grupos) and not o.name.startswith(SI_FASCIA):
            continue
        bm = bmesh.new()
        bm.from_mesh(o.data)
        bmesh.ops.triangulate(bm, faces=bm.faces[:])
        if len(bm.faces) > 400:
            nf = len(bm.faces)
            bm.to_mesh(o.data)
            bm.free()
            mod = o.modifiers.new('reducir', 'DECIMATE')
            mod.ratio = max(RATIO_LECTURA, 300 / nf)
            ev = o.evaluated_get(bpy.context.evaluated_depsgraph_get())
            me = ev.to_mesh()
            bm = bmesh.new()
            bm.from_mesh(me)
            ev.to_mesh_clear()
            bmesh.ops.triangulate(bm, faces=bm.faces[:])
        mw = o.matrix_world
        co = a_gltf(np.array([tuple(mw @ v.co) for v in bm.verts]))
        tri = np.array([[v.index for v in f.verts] for f in bm.faces], dtype=np.int64)
        if mw.determinant() < 0:  # piezas espejadas (lado izquierdo): se invierte el orden
            tri = tri[:, ::-1].copy()
        ten = np.array([f.material_index < len(mats) and mats[f.material_index] in TENDINOSO for f in bm.faces], np.uint8)
        bm.free()
        vs.append(co)
        ts.append(tri + base)
        tobj.append(np.full(len(tri), len(nombres)))
        tten.append(ten)
        nombres.append({'nombre': o.name, 'grupos': grupos})
        base += len(co)
    return np.concatenate(vs), np.concatenate(ts), np.concatenate(tobj), np.concatenate(tten), nombres


def leer_huesos(ruta_fbx):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.fbx(filepath=ruta_fbx)
    quiero = {'Humerus', 'Lunate bone', 'Scaphoid bone', 'Second metacarpal bone', 'Third metacarpal bone',
              'Fifth metacarpal bone', 'Femur', 'Tibia', 'Talus', 'Second metatarsal bone', 'Vertebra C7', 'Vertebra T1',
              'Atlas (C1)', 'Axis (C2)'}
    d = {}
    for o in bpy.context.scene.objects:
        raiz = o.name[:-2] if o.name.endswith(('.l', '.r')) else o.name
        if o.type == 'MESH' and raiz in quiero:
            d[o.name] = a_gltf(np.array([tuple(o.matrix_world @ v.co) for v in o.data.vertices]))
    return d


# ------------------------------------------------------------ Articulaciones y pose

def esfera(p):
    """Centro de la esfera que mejor ajusta los puntos (algebraico)."""
    a = np.c_[2 * p, np.ones(len(p))]
    c, *_ = np.linalg.lstsq(a, (p ** 2).sum(1), rcond=None)
    return c[:3]


def articulaciones_za(h):
    j = {}
    for L, s in (('L', 1), ('R', -1)):
        l = L.lower()
        hum = h[f'Humerus.{l}']
        top = hum[hum[:, 1] > hum[:, 1].max() - 0.05]
        j[f'hombro.{L}'] = esfera(top[s * top[:, 0] < (s * top[:, 0]).min() + 0.045])  # cabeza del húmero
        j[f'codo.{L}'] = hum[hum[:, 1] < hum[:, 1].min() + 0.03].mean(0)
        j[f'muneca.{L}'] = np.concatenate([h[f'Lunate bone.{l}'], h[f'Scaphoid bone.{l}']]).mean(0)
        for n, hueso in (('nudillo2', 'Second'), ('nudillo3', 'Third'), ('nudillo5', 'Fifth')):
            m = h[f'{hueso} metacarpal bone.{l}']
            j[f'{n}.{L}'] = m[m[:, 1] < m[:, 1].min() + 0.012].mean(0)
        fem = h[f'Femur.{l}']
        top = fem[fem[:, 1] > fem[:, 1].max() - 0.07]
        j[f'cadera.{L}'] = esfera(top[s * top[:, 0] < (s * top[:, 0]).min() + 0.05])  # cabeza del fémur
        tib = h[f'Tibia.{l}']
        j[f'rodilla.{L}'] = (fem[fem[:, 1] < fem[:, 1].min() + 0.02].mean(0) + tib[tib[:, 1] > tib[:, 1].max() - 0.02].mean(0)) / 2
        j[f'tobillo.{L}'] = h[f'Talus.{l}'].mean(0)
        mt = h[f'Second metatarsal bone.{l}']
        j[f'dedos.{L}'] = mt[mt[:, 2] > mt[:, 2].max() - 0.012].mean(0)
    j['cuello'] = (h['Vertebra C7'].mean(0) + h['Vertebra T1'].mean(0)) / 2
    j['cabeza'] = np.concatenate([h['Atlas (C1)'], h['Axis (C2)']]).mean(0)
    return j


def articulaciones_mh(pos_crudo, cabezas):
    pos = a_gltf(pos_crudo)
    suelo = -pos[:, 1].min()
    pos[:, 1] += suelo
    cab = lambda b: a_gltf(cabezas[b]) + [0, suelo, 0]
    j = {}
    for L in 'LR':
        for n, b in (('hombro', 'upperarm01'), ('codo', 'lowerarm01'), ('muneca', 'wrist'), ('nudillo2', 'finger2-1'),
                     ('nudillo3', 'finger3-1'), ('nudillo5', 'finger5-1'), ('cadera', 'upperleg01'),
                     ('rodilla', 'lowerleg01'), ('tobillo', 'foot'), ('dedos', 'toe2-1')):
            j[f'{n}.{L}'] = cab(f'{b}.{L}')
    j['cuello'] = cab('neck01')
    j['cabeza'] = cab('head')
    return pos, j


def segmento_de_hueso(b):
    lado = b[-1] if b[-2:] in ('.L', '.R') else None
    raiz = b[:-2] if lado else b
    if raiz.startswith('upperarm'):
        return {f'brazo.{lado}': 1}
    if raiz == 'lowerarm01':
        return {f'antebrazo1.{lado}': 1}
    if raiz == 'lowerarm02':
        return {f'antebrazo2.{lado}': 1}
    if raiz.startswith(('wrist', 'metacarpal', 'finger')):
        return {f'mano.{lado}': 1}
    if raiz.startswith('upperleg'):
        return {f'muslo.{lado}': 1}
    if raiz.startswith('lowerleg'):
        return {f'pierna.{lado}': 1}
    if raiz.startswith(('foot', 'toe')):
        return {f'pie.{lado}': 1}
    if raiz == 'neck01':
        return {'tronco': 0.5, 'cabeza': 0.5}
    if raiz.startswith(('root', 'spine', 'pelvis', 'clavicle', 'shoulder', 'breast')):
        return {'tronco': 1}
    return {'cabeza': 1}


def pesos_segmento(pesos, n):
    w = np.zeros((n, len(SEGMENTOS)))
    for b, lista in pesos.items():
        for seg, f in segmento_de_hueso(b).items():
            for vi, x in lista:
                if vi < n:
                    w[vi, SEG[seg]] += f * x
    w[w.sum(1) == 0, 0] = 1
    return w / w.sum(1, keepdims=True)


def norm(v):
    return v / np.linalg.norm(v)


def rot_entre(a, b):
    """Rotación mínima que lleva la dirección a a la b."""
    a, b = norm(a), norm(b)
    v = np.cross(a, b)
    c = float(np.dot(a, b))
    k = np.array([[0, -v[2], v[1]], [v[2], 0, -v[0]], [-v[1], v[0], 0]])
    return np.eye(3) + k + k @ k * (1 / (1 + c))


def rot_eje(eje, ang):
    eje = norm(eje)
    k = np.array([[0, -eje[2], eje[1]], [eje[2], 0, -eje[0]], [-eje[1], eje[0], 0]])
    return np.eye(3) + np.sin(ang) * k + (1 - np.cos(ang)) * k @ k


def giro_para(eje, desde, hasta):
    """Ángulo alrededor de `eje` que lleva `desde` a `hasta` (proyectados)."""
    eje = norm(eje)
    a = norm(desde - eje * np.dot(desde, eje))
    b = norm(hasta - eje * np.dot(hasta, eje))
    return np.arctan2(np.dot(np.cross(a, b), eje), np.dot(a, b))


def umeyama(src, dst):
    """Similitud (s, R, t) con dst ≈ s R src + t."""
    ms, md = src.mean(0), dst.mean(0)
    a, b = src - ms, dst - md
    u, d, vt = np.linalg.svd(b.T @ a / len(src))
    s_ = np.eye(3)
    if np.linalg.det(u) * np.linalg.det(vt) < 0:
        s_[2, 2] = -1
    r = u @ s_ @ vt
    s = np.trace(np.diag(d) @ s_) / (a ** 2).sum(1).mean()
    return s, r, md - s * r @ ms


def transformaciones(jm, jz):
    """Afín (M, t) de cada segmento, de MakeHuman a Z-A: el tronco por similitud y
    cada hueso llevando su articulación y su dirección a las de Z-A (antebrazo y
    mano giran además para que la palma mire adelante, como en Z-A)."""
    T = {}
    claves = ['cadera.L', 'cadera.R', 'hombro.L', 'hombro.R', 'cuello']
    s, R, t = umeyama(np.array([jm[k] for k in claves]), np.array([jz[k] for k in claves]))
    T['tronco'] = (s * R, t)

    def cadena(base_R, A, B, a, b, giro=None):
        R = rot_entre(base_R @ (B - A), b - a) @ base_R
        if giro:
            ref_m, ref_z, frac = giro
            R = rot_eje(b - a, giro_para(b - a, R @ ref_m, ref_z) * frac) @ R
        esc = np.linalg.norm(b - a) / np.linalg.norm(B - A)
        return R, esc * R, a - esc * R @ A

    _, M, tc = cadena(R, jm['cuello'], jm['cabeza'], jz['cuello'], jz['cabeza'])
    T['cabeza'] = (M, tc)
    for L in 'LR':
        k = lambda n: f'{n}.{L}'
        palma = lambda j: np.cross(j[k('nudillo3')] - j[k('muneca')], j[k('nudillo2')] - j[k('nudillo5')])
        Rb, M, t = cadena(R, jm[k('hombro')], jm[k('codo')], jz[k('hombro')], jz[k('codo')])
        T[k('brazo')] = (M, t)
        for n, frac in (('antebrazo1', 0.5), ('antebrazo2', 1.0)):
            Ra, M, t = cadena(Rb, jm[k('codo')], jm[k('muneca')], jz[k('codo')], jz[k('muneca')], (palma(jm), palma(jz), frac))
            T[k(n)] = (M, t)
        _, M, t = cadena(Ra, jm[k('muneca')], jm[k('nudillo3')], jz[k('muneca')], jz[k('nudillo3')], (palma(jm), palma(jz), 1.0))
        T[k('mano')] = (M, t)
        Rm, M, t = cadena(R, jm[k('cadera')], jm[k('rodilla')], jz[k('cadera')], jz[k('rodilla')])
        T[k('muslo')] = (M, t)
        Rp, M, t = cadena(Rm, jm[k('rodilla')], jm[k('tobillo')], jz[k('rodilla')], jz[k('tobillo')])
        T[k('pierna')] = (M, t)
        _, M, t = cadena(Rp, jm[k('tobillo')], jm[k('dedos')], jz[k('tobillo')], jz[k('dedos')])
        T[k('pie')] = (M, t)
    return T


def posar(pos, w, T):
    out = np.zeros_like(pos)
    for i, seg in enumerate(SEGMENTOS):
        M, t = T[seg]
        out += w[:, i:i + 1] * (pos @ M.T + t)
    return out


# ------------------------------------------------------------ Atado

def normales(pos, tris):
    n = np.zeros_like(pos)
    c = np.cross(pos[tris[:, 1]] - pos[tris[:, 0]], pos[tris[:, 2]] - pos[tris[:, 0]])
    for k in range(3):
        np.add.at(n, tris[:, k], c)
    return n / np.linalg.norm(n, axis=1, keepdims=True)


def punto_triangulo(p, a, b, c):
    """Baricéntricas del punto de los triángulos abc más cercano a p (vectorizado; Ericson)."""
    ab, ac, ap = b - a, c - a, p - a
    d1, d2 = (ab * ap).sum(-1), (ac * ap).sum(-1)
    bp = p - b
    d3, d4 = (ab * bp).sum(-1), (ac * bp).sum(-1)
    cp = p - c
    d5, d6 = (ab * cp).sum(-1), (ac * cp).sum(-1)
    va, vb, vc = d3 * d6 - d5 * d4, d5 * d2 - d1 * d6, d1 * d4 - d3 * d2
    den = va + vb + vc
    den = np.where(np.abs(den) < 1e-20, 1e-20, den)
    bary = np.stack([1 - (vb + vc) / den, vb / den, vc / den], -1)

    def arista(t, i, j):
        z = np.zeros_like(bary)
        z[..., i] = 1 - t
        z[..., j] = t
        return z

    seguro = lambda x: np.where(x == 0, 1, x)
    casos = [  # en orden de prioridad
        ((d1 <= 0) & (d2 <= 0), np.broadcast_to([1., 0, 0], bary.shape)),
        ((d3 >= 0) & (d4 <= d3), np.broadcast_to([0, 1., 0], bary.shape)),
        ((d6 >= 0) & (d5 <= d6), np.broadcast_to([0, 0, 1.], bary.shape)),
        ((vc <= 0) & (d1 >= 0) & (d3 <= 0), arista(d1 / seguro(d1 - d3), 0, 1)),
        ((vb <= 0) & (d2 >= 0) & (d6 <= 0), arista(d2 / seguro(d2 - d6), 0, 2)),
        ((va <= 0) & (d4 - d3 >= 0) & (d5 - d6 >= 0), arista((d4 - d3) / seguro((d4 - d3) + (d5 - d6)), 1, 2)),
    ]
    for m, val in reversed(casos):
        bary = np.where(m[..., None], val, bary)
    return bary


def mas_cercano(p, pos, tris, k=24):
    """Triángulo y baricéntricas del punto de la malla más cercano a cada p."""
    arbol = cKDTree(pos[tris].mean(1))
    out_t = np.empty(len(p), np.int64)
    out_b = np.empty((len(p), 3))
    for i in range(0, len(p), 20000):
        q = p[i:i + 20000]
        _, cand = arbol.query(q, k=k)
        a, b, c = (pos[tris[cand, j]] for j in range(3))
        bary = punto_triangulo(q[:, None, :], a, b, c)
        s = bary[..., 0:1] * a + bary[..., 1:2] * b + bary[..., 2:3] * c
        m = np.linalg.norm(s - q[:, None, :], axis=-1).argmin(1)
        r = np.arange(len(q))
        out_t[i:i + 20000] = cand[r, m]
        out_b[i:i + 20000] = bary[r, m]
    return out_t, out_b


def marco(pos, nor, tris, t, b):
    """Punto, normal (interpolada) y marco tangente (primera arista sin su parte normal)."""
    x = pos[tris[t]]
    s = (b[:, :, None] * x).sum(1)
    n = (b[:, :, None] * nor[tris[t]]).sum(1)
    n /= np.linalg.norm(n, axis=1, keepdims=True)
    e1 = x[:, 1] - x[:, 0]
    t1 = e1 - (e1 * n).sum(1, keepdims=True) * n
    t1 /= np.linalg.norm(t1, axis=1, keepdims=True)
    return s, n, t1, np.cross(n, t1)


def adyacencia(tris, n):
    ar = np.concatenate([tris[:, [0, 1]], tris[:, [1, 2]], tris[:, [2, 0]]])
    ar = np.concatenate([ar, ar[:, ::-1]])
    A = sp.coo_matrix((np.ones(len(ar)), (ar[:, 0], ar[:, 1])), shape=(n, n)).tocsr()
    A.data[:] = 1
    return A


def recortar(v, t_za, obj_tri, nombres):
    """Caras de las láminas del abdomen justo delante del recto (se quitan) y alrededor (aponeurosis)."""
    quitar = np.zeros(len(t_za), bool)
    aponeurosis = np.zeros(len(t_za), bool)
    indice = {n['nombre']: i for i, n in enumerate(nombres)}
    for tapa, debajo in RECORTES:
        for lado in '.l', '.r':
            if tapa + lado not in indice or debajo + lado not in indice:
                continue
            vd = np.unique(t_za[obj_tri == indice[debajo + lado]])
            caras = np.nonzero(obj_tri == indice[tapa + lado])[0]
            cen = v[t_za[caras]].mean(1)
            d, j = cKDTree(v[vd]).query(cen)
            delante = cen[:, 2] > v[vd][j, 2] - 0.003
            quitar[caras[(d < RECORTE_DIST) & delante]] = True
            aponeurosis[caras[d < APONEUROSIS_DIST]] = True
    return quitar, aponeurosis


def atar(pos, tris, w, T, v, t_za, obj, nombres):
    posado = posar(pos, w, T)
    nor_p = normales(posado, tris)
    tri, bary = mas_cercano(v, posado, tris)
    s, n, t1, t2 = marco(posado, nor_p, tris, tri, bary)
    d = v - s
    h = (d * n).sum(1)
    # Residuo tangente en metros: sigue el giro del triángulo pero no se estira con él.
    c1, c2 = (d * t1).sum(1), (d * t2).sum(1)
    print(f'  atado: h de {h.min():.3f} a {h.max():.3f} m; residuo tangente medio '
          f'{np.hypot(c1, c2).mean() * 1000:.2f} mm', flush=True)

    # Un rayo solo cuenta piezas atadas (al menos un 10 %) a su mismo segmento
    # grueso: así el brazo no tapa al tronco donde en Z-A van pegados.
    seg_v = GRUESO[w.argmax(1)]
    nob = len(nombres)
    seg_vert = seg_v[tris[tri, bary.argmax(1)]]
    cuenta = np.zeros((nob, 6))
    np.add.at(cuenta, (obj, seg_vert), 1)
    compatible = cuenta / np.maximum(cuenta.sum(1, keepdims=True), 1) >= 0.1

    # Capa exterior: rayos desde la piel hacia adentro (4 por triángulo). La
    # corrección es un campo suave sobre la piel: los músculos atados a un punto
    # se mueven juntos por la normal, sin romperse ni cambiar el orden de capas.
    obj_tri = obj[t_za[:, 0]]
    muestras = np.array([[1 / 3, 1 / 3, 1 / 3], [0.6, 0.2, 0.2], [0.2, 0.6, 0.2], [0.2, 0.2, 0.6]])
    orig = (muestras[None, :, :, None] * posado[tris][:, None, :, :]).sum(2).reshape(-1, 3)
    dirs = (muestras[None, :, :, None] * nor_p[tris][:, None, :, :]).sum(2).reshape(-1, 3)
    dirs /= np.linalg.norm(dirs, axis=1, keepdims=True)
    seg_rayo = np.repeat(seg_v[tris[:, 0]], len(muestras))
    tri_m = np.repeat(np.arange(len(tris)), len(muestras))
    peso_m = np.tile(muestras, (len(tris), 1))
    nv = len(pos)
    A = adyacencia(tris, nv)
    grado = np.asarray(A.sum(1)).ravel()

    def rayos(puntos):
        arbol = BVHTree.FromPolygons([Vector(x) for x in puntos], t_za.tolist(), all_triangles=True)
        alto = np.full(len(orig), np.nan)
        visto = np.zeros(nob)
        for i in range(len(orig)):
            d_ = Vector(-dirs[i])
            o = Vector(orig[i] + dirs[i] * FUERA)
            recorrido = 0.0
            for _ in range(8):
                loc, _n, idx, dist = arbol.ray_cast(o, d_, ALCANCE - recorrido)
                if loc is None:
                    break
                recorrido += dist
                if compatible[obj_tri[idx], seg_rayo[i]]:
                    alto[i] = FUERA - recorrido
                    visto[obj_tri[idx]] += 1
                    break
                o = loc + d_ * 1e-4
                recorrido += 1e-4
        return alto, visto

    def campo_piel(err):
        ok = np.isfinite(err)
        suma = np.zeros(nv)
        peso = np.zeros(nv)
        for k in range(3):
            np.add.at(suma, tris[tri_m[ok], k], peso_m[ok, k] * err[ok])
            np.add.at(peso, tris[tri_m[ok], k], peso_m[ok, k])
        fijo = peso > 0.2
        e = np.where(fijo, suma / np.maximum(peso, 1e-9), 0.0)
        for _ in range(ALISADO_CORRECCION):
            prom = (A @ (e * fijo)) / np.maximum(A @ fijo.astype(float), 1)
            e = np.where(fijo, 0.5 * e + 0.5 * prom, e)
        return e, fijo

    corr = np.zeros(nv)
    for it in range(ITERACIONES_CAPA):
        alto, visto_it = rayos(v + (bary * corr[tris[tri]]).sum(1)[:, None] * n)
        if it == 0:
            visto = visto_it
        error = PROFUNDIDAD_EXTERIOR - alto
        print(f'  capa exterior, vuelta {it + 1}: error mediano {np.nanmedian(np.abs(error)) * 1000:.1f} mm', flush=True)
        err, fijo = campo_piel(error)
        paso = np.clip(err, -0.03, 0.03) * (1.0 if it == 0 else 0.7)
        if it == 0:  # donde ningún rayo ve músculo, la corrección se rellena por difusión
            for _ in range(300):
                paso = np.where(fijo, paso, A @ paso / np.maximum(grado, 1))
            corr = paso
        else:
            corr = corr + np.where(fijo, paso, 0.0)
        for _ in range(2):
            corr = 0.5 * corr + 0.5 * (A @ corr) / np.maximum(grado, 1)
    fuera = np.array([x['nombre'].startswith(PROFUNDOS) or any(g in GRUPOS_FUERA for g in x['grupos']) for x in nombres])
    queda = (visto >= RAYOS_MINIMOS) & ~fuera
    print(f'  piezas visibles: {queda.sum()} de {nob}', flush=True)
    h = h + (bary * corr[tris[tri]]).sum(1)

    # Posiciones en la pose de reposo del cuerpo base (para el GLB y el estiramiento).
    s0, n0, u1, u2 = marco(pos, normales(pos, tris), tris, tri, bary)
    reposo = s0 + h[:, None] * n0 + c1[:, None] * u1 + c2[:, None] * u2
    # Manos, pies y cabeza: la forma (dedos, cráneo) no coincide; los cubre el cuerpo pintado.
    sin_musculo = np.isin(w.argmax(1), [SEG[k] for k in ('mano.L', 'mano.R', 'pie.L', 'pie.R')]) | (w[:, SEG['cabeza']] > 0.95)
    return dict(tri=tri, bary=bary, h=h, c1=c1, c2=c2, queda=queda, reposo=reposo,
                sin_musculo=sin_musculo[tris[tri]].any(1), seg_vert=seg_vert)


# ------------------------------------------------------------ Salida

def traductor(ruta):
    t = {}
    for linea in open(ruta, encoding='utf-8'):
        c = linea.rstrip('\n').split(';')
        if len(c) >= 4 and c[3].strip():
            t[c[0].strip().lower()] = c[3].strip()
    t.update(TRADUCCIONES_EXTRA)

    def es(nombre):
        base = (nombre[:-2] if nombre.endswith(('.l', '.r')) else nombre).strip('()')
        for k in (base, base + ' muscle', base.replace(' muscle', ''), base + 's'):
            if k.lower() in t:
                return t[k.lower()]
        return None
    return es


def exportar(sexo, r, pos, v, t_za, obj, tendon_tri, nombres, es, salida):
    caras = r['queda'][obj[t_za[:, 0]]]

    def aristas(p):
        a, b, c = p[t_za[:, 0]], p[t_za[:, 1]], p[t_za[:, 2]]
        return np.stack([np.linalg.norm(b - a, axis=1), np.linalg.norm(c - b, axis=1), np.linalg.norm(a - c, axis=1)], 1)
    estir = (aristas(r['reposo']) / np.maximum(aristas(v), 1e-5)).max(1)
    seg = r['seg_vert'][t_za]
    entre = (seg[:, 0] != seg[:, 1]) | (seg[:, 1] != seg[:, 2])
    estiradas = entre & (estir > ESTIRAMIENTO_MAX)
    sin_musculo = r['sin_musculo'][t_za].any(1)
    en_pierna = np.array([any(g in SOLO_EN_LA_PIERNA for g in x['grupos']) for x in nombres])
    sin_musculo |= en_pierna[obj[t_za[:, 0]]] & (seg == 0).any(1)
    # Horcajadura: el punto más bajo de la línea media del cuerpo por encima del 30 % de la estatura.
    medio = (np.abs(pos[:, 0]) < 0.004) & (pos[:, 1] > 0.3 * pos[:, 1].max())
    y_horca = pos[medio, 1].min()
    al_pubis = np.array([x['nombre'].startswith(HASTA_EL_PUBIS) for x in nombres])
    sin_musculo |= al_pubis[obj[t_za[:, 0]]] & (r['reposo'][t_za][:, :, 1] < y_horca + PUBIS_ALTURA).any(1)
    print(f'  caras quitadas: {(estiradas & caras).sum()} estiradas, {(sin_musculo & caras).sum()} en manos, pies y cabeza')
    caras &= ~estiradas & ~sin_musculo

    t = t_za[caras]
    usados = np.unique(t)
    nuevo = np.full(len(v), -1)
    nuevo[usados] = np.arange(len(usados))
    t = nuevo[t]
    ten = np.zeros(len(usados))  # tendón por vértice: fracción de sus caras que son tendón
    cuenta = np.zeros(len(usados))
    for k in range(3):
        np.add.at(ten, t[:, k], tendon_tri[caras])
        np.add.at(cuenta, t[:, k], 1)
    ten /= np.maximum(cuenta, 1)
    piezas = np.nonzero(r['queda'])[0]
    id_pieza = np.full(len(nombres), -1)
    id_pieza[piezas] = np.arange(len(piezas))
    info, sin = [], []
    for i in piezas:
        n = nombres[i]['nombre']
        e = es(n)
        if not e:
            sin.append(n)
        info.append({'en': n[:-2] if n.endswith(('.l', '.r')) else n, 'es': e or n,
                     'lado': 'izquierdo' if n.endswith('.l') else 'derecho' if n.endswith('.r') else None})
    arrays = {
        'reposo': r['reposo'][usados].astype('<f4'),
        'tri': r['tri'][usados].astype('<u4'),
        'bary': r['bary'][usados].astype('<f4'),
        'desp': np.stack([r['h'], r['c1'], r['c2']], 1)[usados].astype('<f4'),
        'pieza': id_pieza[obj[usados]].astype('<u2'),
        'tendon': ten.astype('<f4'),
        'indices': t.astype('<u4'),
    }
    cab = {'sexo': sexo, 'vertices': len(usados), 'triangulos': len(t), 'piezas': info, 'arrays': []}
    with open(os.path.join(salida, f'musculos-{sexo}.bin'), 'wb') as f:
        for k, a in arrays.items():
            cab['arrays'].append({'nombre': k, 'dtype': a.dtype.str, 'forma': list(a.shape), 'offset': f.tell()})
            f.write(np.ascontiguousarray(a).tobytes())
    with open(os.path.join(salida, f'musculos-{sexo}.json'), 'w', encoding='utf-8') as f:
        json.dump(cab, f, ensure_ascii=False)
    print(f'  {sexo}: {len(piezas)} piezas, {len(usados)} vértices, {len(t)} triángulos'
          + (f'; sin traducción: {sin}' if sin else ''), flush=True)


def main():
    p = argparse.ArgumentParser(description='Músculos de Z-Anatomy atados al cuerpo de MakeHuman')
    p.add_argument('--z-anatomy', required=True, help='carpeta del repositorio de Z-Anatomy (con Resources/)')
    p.add_argument('--salida', required=True, help='carpeta donde escribir musculos-*.bin y .json')
    p.add_argument('--mpfb-src', default=None, help='carpeta src/mpfb de MPFB2 (si no está instalado)')
    p.add_argument('--sexos', default='M,F')
    args = p.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:])
    os.makedirs(args.salida, exist_ok=True)
    recursos = os.path.join(args.z_anatomy, 'Resources')

    print('MakeHuman...', flush=True)
    cuerpos, tris, pesos = leer_makehuman(args.mpfb_src)
    print('Z-Anatomy: esqueleto y músculos...', flush=True)
    jz = articulaciones_za(leer_huesos(os.path.join(recursos, 'Models', 'FBX', 'SkeletalSystem100.fbx')))
    v, t_za, obj_tri, tendon_tri, nombres = leer_musculos(os.path.join(recursos, 'Models', 'FBX', 'MuscularSystem100.fbx'))
    print(f'  {len(nombres)} piezas, {len(v)} vértices, {len(t_za)} triángulos', flush=True)

    quitar, aponeurosis = recortar(v, t_za, obj_tri, nombres)
    tendon_tri = np.maximum(tendon_tri, aponeurosis.astype(np.uint8))
    t_za, obj_tri, tendon_tri = t_za[~quitar], obj_tri[~quitar], tendon_tri[~quitar]
    obj = np.zeros(len(v), np.int64)
    for k in range(3):
        obj[t_za[:, k]] = obj_tri
    es = traductor(os.path.join(recursos, 'Translations0.txt'))

    w = pesos_segmento(pesos, eb.N_CUERPO)
    for sexo in [s.strip().upper() for s in args.sexos.split(',')]:
        print(f'\n=== {sexo} ===', flush=True)
        pos, jm = articulaciones_mh(*cuerpos[sexo])
        r = atar(pos, tris, w, transformaciones(jm, jz), v, t_za, obj, nombres)
        exportar(sexo, r, pos, v, t_za, obj, tendon_tri, nombres, es, args.salida)


if __name__ == '__main__':
    main()
    # Blender como módulo a veces se queda colgado al cerrar; salimos directo.
    sys.stdout.flush()
    os._exit(0)
