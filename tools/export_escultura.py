"""El cuerpo del visor: las esculturas "Muscle Male" y "Muscle Female".

Los modelos de images/2284-legroscollardfloriane-* son la figura que se ve. Son
esculturas fijas (sin esqueleto ni morphs), así que los cambios de cada cliente
(estatura, peso, músculo, grasa) se les aplican con el cuerpo de MakeHuman, que
sí se deforma y con el que se calculan las medidas:

1. Se escala la escultura a metros, con los pies en y = 0 y el tronco centrado
   sobre el del cuerpo base de MakeHuman.
2. Registro no rígido: el cuerpo base de MakeHuman se deforma hasta calzar sobre
   la escultura (puntos más cercanos en las dos direcciones, con un término
   Laplaciano que mantiene suave el desplazamiento; la rigidez baja por etapas).
3. Cada vértice de la escultura se asocia a un triángulo del cuerpo calzado (el
   más cercano, fuera de dedos, ojos y boca) y un punto en él (baricéntricas).
4. En el navegador (client/src/modelo3d/escultura.ts) cada vértice de la
   escultura se mueve lo mismo que ese punto del cuerpo entre el cuerpo base y
   el del cliente. Con el cuerpo base la escultura queda exactamente como es.

Además se guarda cuánto se movió cada vértice del cuerpo para calzar (sirve para
llevar a la escultura cosas medidas sobre el cuerpo, como los anillos).

Los triángulos se usan en forma canónica (empiezan por el vértice menor): la
compresión meshopt de los índices del cuerpo puede rotarlos.

Uso (Blender como módulo, con numpy y scipy):
    .blenv/bin/python tools/export_escultura.py --salida tools/build \\
        --pesos ruta/a/mpfb2/src/mpfb/data/rigs/standard/weights.default.json
    npm run modelo3d:escultura
"""
import argparse
import json
import os
import struct
import sys

import bpy  # noqa: I001 -- primero: lee el FBX
import numpy as np
import scipy.sparse as sp
from scipy.sparse.linalg import factorized
from scipy.spatial import cKDTree

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FUENTES = {
    'M': ('hombre', 'images/2284-legroscollardfloriane-malemuscle/source/Muscle_Male.fbx'),
    'F': ('mujer', 'images/2284-legroscollardfloriane-femalemuscle/source/Muscle_Female.fbx'),
}
# Rigidez del registro (peso del Laplaciano del desplazamiento), de mayor a menor.
RIGIDECES = [30.0, 10.0, 3.0, 1.0, 0.5, 0.25]
VUELTAS_POR_RIGIDEZ = 4
# Correspondencias aceptadas: distancia máxima (m) y normales parecidas.
DISTANCIA_MAX = [0.08, 0.05, 0.03, 0.02, 0.015, 0.012]
NORMAL_MIN = 0.3


def a_gltf(p):
    return np.stack([p[:, 0], p[:, 2], -p[:, 1]], axis=1)


def leer_fbx(ruta):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.fbx(filepath=ruta)
    o = next(o for o in bpy.context.scene.objects if o.type == 'MESH')
    mw = o.matrix_world
    co = np.array([tuple(mw @ v.co) for v in o.data.vertices])
    tris = []
    for p in o.data.polygons:
        vs = list(p.vertices)
        for i in range(1, len(vs) - 1):
            tris.append((vs[0], vs[i], vs[i + 1]))
    return a_gltf(co), np.array(tris, dtype=np.int64)


def leer_glb_cuerpo(ruta):
    """Posiciones e índices del cuerpo base (GLB sin comprimir de tools/build)."""
    b = open(ruta, 'rb').read()
    lj = struct.unpack('<I', b[12:16])[0]
    j = json.loads(b[20:20 + lj])
    binario = b[20 + lj + 8:]
    prim = j['meshes'][0]['primitives'][0]

    def acc(i, dtype, k):
        a = j['accessors'][i]
        v = j['bufferViews'][a['bufferView']]
        return np.frombuffer(binario, dtype=dtype, count=a['count'] * k,
                             offset=v.get('byteOffset', 0) + a.get('byteOffset', 0))
    pos = acc(prim['attributes']['POSITION'], '<f4', 3).reshape(-1, 3).astype(np.float64)
    ai = j['accessors'][prim['indices']]
    tipo = {5123: '<u2', 5125: '<u4'}[ai['componentType']]
    tris = acc(prim['indices'], tipo, 1).reshape(-1, 3).astype(np.int64)
    return pos, tris


def canonicos(tris):
    k = tris.argmin(1)
    return np.stack([tris[np.arange(len(tris)), (k + i) % 3] for i in range(3)], 1)


def normales(pos, tris):
    n = np.zeros_like(pos)
    c = np.cross(pos[tris[:, 1]] - pos[tris[:, 0]], pos[tris[:, 2]] - pos[tris[:, 0]])
    for k in range(3):
        np.add.at(n, tris[:, k], c)
    return n / np.maximum(np.linalg.norm(n, axis=1, keepdims=True), 1e-12)


def laplaciano(tris, n):
    ar = np.concatenate([tris[:, [0, 1]], tris[:, [1, 2]], tris[:, [2, 0]]])
    ar = np.concatenate([ar, ar[:, ::-1]])
    A = sp.coo_matrix((np.ones(len(ar)), (ar[:, 0], ar[:, 1])), shape=(n, n)).tocsr()
    A.data[:] = 1
    grado = np.asarray(A.sum(1)).ravel()
    return sp.diags(grado) - A


def alinear(esc, base):
    """Escultura a metros, pies en 0 y tronco centrado sobre el del cuerpo base."""
    esc = esc * (base[:, 1].max() - base[:, 1].min()) / (esc[:, 1].max() - esc[:, 1].min())
    esc[:, 1] -= esc[:, 1].min()

    def tronco(a):
        alto = a[:, 1].max()
        return a[(a[:, 1] > 0.55 * alto) & (a[:, 1] < 0.8 * alto) & (np.abs(a[:, 0]) < 0.15)].mean(0)
    d = tronco(base) - tronco(esc)
    esc[:, 0] += d[0]
    esc[:, 2] += d[2]
    return esc


def registrar(base, tris, esc, tris_esc, libres):
    """Deforma el cuerpo base hasta calzar sobre la escultura.

    Los vértices `libres` (dedos, ojos, boca) no buscan pareja: siguen a sus
    vecinos con el Laplaciano, así la zona se deforma lisa en lugar de meter los
    dedos separados dentro de la mano esculpida.
    """
    n = len(base)
    L = laplaciano(tris, n)
    LtL = (L.T @ L).tocsc()
    nor_esc = normales(esc, tris_esc)
    arbol_esc = cKDTree(esc)
    x = base.copy()
    for etapa, (rigidez, dmax) in enumerate(zip(RIGIDECES, DISTANCIA_MAX)):
        for _ in range(VUELTAS_POR_RIGIDEZ):
            nor = normales(x, tris)
            # Del cuerpo a la escultura.
            d, j = arbol_esc.query(x)
            ok = (d < dmax) & ((nor * nor_esc[j]).sum(1) > NORMAL_MIN) & ~libres
            objetivo = np.zeros_like(x)
            peso = np.zeros(n)
            objetivo[ok] += esc[j[ok]]
            peso[ok] += 1
            # De la escultura al cuerpo (cubre partes finas que el cuerpo no alcanza).
            d2, i2 = cKDTree(x).query(esc)
            ok2 = (d2 < dmax) & ((nor[i2] * nor_esc).sum(1) > NORMAL_MIN) & ~libres[i2]
            np.add.at(objetivo, i2[ok2], esc[ok2] * 0.5)
            np.add.at(peso, i2[ok2], 0.5)
            con = peso > 0
            objetivo[con] /= peso[con, None]
            W = sp.diags(np.where(con, 1.0, 0.0))
            resolver = factorized((rigidez * LtL + W).tocsc())
            # Minimiza rigidez·|L(x - base)|² + Σ|x - objetivo|² (solo donde hay objetivo).
            rhs = rigidez * (LtL @ base) + W @ objetivo
            x = np.stack([resolver(rhs[:, c]) for c in range(3)], 1)
        d, _ = arbol_esc.query(x)
        print(f'  etapa {etapa + 1}: rigidez {rigidez}, distancia mediana {np.median(d) * 1000:.1f} mm, '
              f'p95 {np.percentile(d, 95) * 1000:.1f} mm', flush=True)
    return x


def punto_triangulo(p, a, b, c):
    """Baricéntricas del punto de los triángulos abc más cercano a p (Ericson, vectorizado)."""
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
    casos = [
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


# Huesos de MakeHuman cuyos vértices no sirven de ancla: dedos, ojos, boca y
# mandíbula (cavidades y dedos separados que la escultura no tiene). Los
# vértices de la escultura en esas zonas se atan a la palma, al empeine o al
# cráneo y las mejillas, y se mueven con ellos.
SIN_ANCLA = ('finger', 'toe', 'eye', 'oculi', 'orbicularis', 'oris', 'levator', 'risorius', 'jaw', 'tongue', 'special',
             'temporalis')


def vertices_sin_ancla(pesos, n):
    """Vértices cuyo hueso de más peso está en SIN_ANCLA."""
    mejor = np.zeros(n)
    hueso = [''] * n
    for nombre, lista in pesos.items():
        for vi, w in lista:
            if vi < n and w > mejor[vi]:
                mejor[vi], hueso[vi] = w, nombre
    return np.array([h.startswith(SIN_ANCLA) for h in hueso])


def triangulos_ancla(malo, tris):
    """Triángulos que pueden servir de ancla (ningún vértice sin ancla)."""
    return np.nonzero(~malo[tris].any(1))[0]


def atar(esc, x, tris, anclas, k=24):
    """Triángulo (de los ancla) y baricéntricas del punto más cercano del cuerpo calzado."""
    arbol = cKDTree(x[tris[anclas]].mean(1))
    tri = np.empty(len(esc), np.int64)
    bary = np.empty((len(esc), 3))
    distancia = np.empty(len(esc))
    for i in range(0, len(esc), 20000):
        q = esc[i:i + 20000]
        _, cand = arbol.query(q, k=k)
        cand = anclas[cand]
        a, b, c = (x[tris[cand, j]] for j in range(3))
        ba = punto_triangulo(q[:, None, :], a, b, c)
        s = ba[..., 0:1] * a + ba[..., 1:2] * b + ba[..., 2:3] * c
        d = np.linalg.norm(s - q[:, None, :], axis=-1)
        m = d.argmin(1)
        r = np.arange(len(q))
        tri[i:i + 20000] = cand[r, m]
        bary[i:i + 20000] = ba[r, m]
        distancia[i:i + 20000] = d[r, m]
    return tri, bary, distancia


def main():
    p = argparse.ArgumentParser(description='Escultura atada al cuerpo de MakeHuman')
    p.add_argument('--salida', required=True)
    p.add_argument('--sexos', default='M,F')
    p.add_argument('--pesos', required=True, help='rigs/standard/weights.default.json de MPFB2')
    args = p.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:])
    pesos = json.load(open(args.pesos))
    pesos = pesos.get('weights', pesos)
    for sexo in [s.strip().upper() for s in args.sexos.split(',')]:
        etiqueta, fbx = FUENTES[sexo]
        print(f'=== {etiqueta} ===', flush=True)
        base, tris = leer_glb_cuerpo(os.path.join(args.salida, f'cuerpo-{etiqueta}.glb'))
        tris = canonicos(tris)
        esc, tris_esc = leer_fbx(os.path.join(RAIZ, fbx))
        esc = alinear(esc, base)
        print(f'  escultura: {len(esc)} vértices, {len(tris_esc)} triángulos', flush=True)
        malo = vertices_sin_ancla(pesos, len(base))
        x = registrar(base, tris, esc, tris_esc, malo)
        tri, bary, distancia = atar(esc, x, tris, triangulos_ancla(malo, tris))
        print(f'  asociada: distancia al cuerpo calzado mediana {np.median(distancia) * 1000:.1f} mm, '
              f'p95 {np.percentile(distancia, 95) * 1000:.1f} mm', flush=True)
        arrays = {
            'reposo': esc.astype('<f4'),
            'tri': tri.astype('<u4'),
            'bary': bary.astype('<f4'),
            'indices': tris_esc.astype('<u4'),
        }
        # Cuánto se movió cada vértice del cuerpo base para calzar sobre la escultura (en 0,1 mm).
        calce = np.round((x - base) * 10000).astype(int).ravel().tolist()
        cab = {'sexo': sexo, 'vertices': len(esc), 'triangulos': len(tris_esc), 'calce': calce, 'arrays': []}
        with open(os.path.join(args.salida, f'escultura-{sexo}.bin'), 'wb') as f:
            for k, a in arrays.items():
                cab['arrays'].append({'nombre': k, 'dtype': a.dtype.str, 'forma': list(a.shape), 'offset': f.tell()})
                f.write(np.ascontiguousarray(a).tobytes())
        with open(os.path.join(args.salida, f'escultura-{sexo}.json'), 'w') as f:
            json.dump(cab, f)


if __name__ == '__main__':
    main()
    sys.stdout.flush()
    os._exit(0)
