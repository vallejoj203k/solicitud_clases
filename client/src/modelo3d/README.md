# Resultado 3D (`/composicion-corporal/3d`)

El entrenador escribe los datos del informe del bodyscanner y la página arma un
cuerpo 3D parecido al del cliente: con su estatura, su volumen, el músculo y la
grasa de cada brazo, pierna y tronco, y su barriga según la grasa visceral.
Todo corre en el navegador (sin servicios externos) y no se guarda nada; el
cliente puede llevarse una imagen PNG.

Los cuerpos base son de MakeHuman / MPFB2 (CC0). Cómo se regeneran los GLB:
[`tools/README.md`](../../../tools/README.md).

## Cómo funciona

```
Formulario (texto)  ──►  objetivos.ts  ──►  Worker: ajuste.ts (Levenberg-Marquardt)
  cliente.ts / campos.ts      │                 1. cuerpo completo  (estatura, volumen,
  (zod + coherencia)          │                    brazos y piernas, cinta, barriga)
                              │                 2. cuerpo sin grasa (masa libre de grasa,
                              ▼                    músculo de brazos y piernas)
                    controles de MakeHuman  ──►  Worker: motor.ts + medicion.ts
                                                  (morphs, normales, medidas, grosor de grasa)
                                                           │
                              Escena.tsx (three.js / r3f) ◄┘  Panel.tsx (pestañas, tarjetas)
```

- **Forma:** en MakeHuman el "peso" pone el tamaño y el "músculo" la
  composición. El volumen (peso / densidad de Siri) fija el tamaño; el % de
  grasa, el índice de masa libre de grasa y la masa muscular deciden si ese
  cuerpo es musculoso o gordo. La grasa visceral decide la barriga.
- **Vista "grasa y músculo":** el cuerpo sin grasa (rojo) va dentro del
  completo; la grasa (amarillo) es la diferencia, más opaca donde es más gruesa.
- **Cómo se ve:** el cuerpo que se mide (13 380 vértices de MakeHuman) se
  muestra pulido (`pulido.ts`): una subdivisión de Loop (53 000 vértices, sin
  facetas), la cabeza suavizada como una escultura con ojos lisos (la malla no
  trae globos oculares) y sin pezones. Es solo para mostrar: medidas y ajuste
  usan la malla original. Luz de estudio con luces de borde, fondo en degradado
  y materiales satinados (porcelana en "Realista", músculo y grasa tipo gel).
- **Comparar:** el cuerpo objetivo aplica los controles de grasa y músculo del
  informe repartidos en proporción a cada segmento (`resultados.ts`).

## Archivos

| Archivo | Qué hace |
| --- | --- |
| `PaginaModelo3D.tsx` | Página: carga el cuerpo, lanza ajustes y cálculos, captura PNG, teclado. |
| `Escena.tsx` | Escena 3D: modos de vista, materiales, luces, anillos con etiquetas, cámara, HDRI. |
| `pulido.ts` | Malla que se muestra: subdivisión de Loop, cabeza y pecho alisados, ojos. |
| `Panel.tsx`, `FormularioScanner.tsx`, `TarjetasResultado.tsx`, `ResumenAjuste.tsx` | Interfaz. |
| `campos.ts` / `cliente.ts` | Campos del informe; validación (zod) y avisos de coherencia. |
| `objetivos.ts` | Datos del formulario → objetivos y puntos de partida del solver. |
| `ajuste.ts` | Solver con límites, Jacobiano por diferencias finitas (incremental) y Broyden. |
| `medicion.ts`, `geometria.ts` | Estatura, volúmenes por segmento, circunferencias de cinta. |
| `motor.ts`, `motor.worker.ts`, `usarMotor.ts`, `usarAjuste.ts` | Morphs en CPU dentro de un Worker (Comlink). |
| `resultados.ts` | Tarjetas, mapa de calor y cuerpo objetivo. |
| `captura.ts` | Imagen PNG para compartir o descargar. |
| `config.ts` | **Todas las constantes ajustables** (ver abajo). |

## Qué se ajusta en `config.ts`

- `CIRCUNFERENCIAS`: dónde se mide cada circunferencia (cintura en el ombligo:
  quitar `alturaDe` para medirla en la parte más angosta).
- `PARAMETROS_AJUSTE`, `TOLERANCIAS`, `SEMILLAS_AJUSTE`: el solver.
- `CURVA_MUSCULO_POR_GRASA`, `INDICE_MAGRO_PROMEDIO`, `GRASA_REFERENCIA`: forma
  según la composición.
- `CURVA_VISCERAL`: grasa visceral → barriga.
- Densidades por segmento (1,06 / 0,90) y total (1,1).
- `ESCALA_*`, `MAPA_CALOR`: tarjetas y mapa de calor.
- `COLOR_MAGRO`, `COLOR_GRASA`, `COLORES_CUERPO`: colores.

## Pruebas

```bash
npm test -w client        # 69 tests: geometría, medición, solver, pulido, formulario, resultados
npm run typecheck -w client
```

Los tests del solver usan los GLB reales y comprueban los criterios de
aceptación: estatura ±0,5 cm, volumen ±2 %, brazos y piernas ±5 %, cinta
±1,5 cm, la barriga con grasa visceral alta, que más masa libre de grasa se vea
musculoso, y que los dos ajustes tarden menos de 300 ms.

## Rendimiento y accesibilidad

- El visor se descarga aparte (~310 KB comprimidos), solo al entrar a la
  página; los archivos con hash se cachean un año.
- El canvas dibuja solo cuando algo cambia (en reposo no gasta batería).
- Pulir el cuerpo cuesta ~15 ms por cambio (matriz dispersa precalculada).
- Modelos de ~0,9 MB (meshopt) y HDRI de 0,5 MB.
- Teclado: flechas para girar el modelo, flechas entre pestañas, foco visible;
  descripción del cuerpo para lectores de pantalla; "reducir movimiento" salta
  la animación de transición. Auditado con axe (WCAG 2.1 AA) sin problemas.
