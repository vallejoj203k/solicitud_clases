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
  cliente.ts / campos.ts      │                 1. músculo = cuerpo sin grasa (estatura,
  (zod + coherencia)          │                    masa libre de grasa, masa magra de
                              │                    brazos y piernas, masa muscular)
                              │                 2. grasa = cuerpo completo encima (peso,
                              ▼                    % de grasa, cinta, grasa visceral)
                    controles de MakeHuman  ──►  Worker: motor.ts + medicion.ts
                                                  (morphs, normales, medidas, grosor de grasa)
                                                           │
                              Escena.tsx (three.js / r3f) ◄┘  Panel.tsx (pestañas, tarjetas)
```

- **Músculo y grasa, independientes:** primero se ajusta el músculo (el cuerpo
  sin grasa, lo rojo) solo con datos magros: estatura, peso libre de grasa,
  masa magra de cada brazo y pierna y masa muscular (`entradaMusculoDe`). Los
  controles de grasa quedan en 0. Después la grasa (el cuerpo completo, lo
  amarillo) se ajusta encima con el peso, el % de grasa, la cinta y la grasa
  visceral (`entradaGrasaDe`). Subir la grasa o cambiar la cintura con el mismo
  peso libre de grasa no toca el músculo; donde la grasa quedaría por dentro
  del músculo, la capa se corre hacia afuera (`motor.contenerFuera`). Hombros y
  entrepierna medidos con cinta los ajusta el cuerpo completo y el músculo los
  copia (mismo esqueleto).
- **Forma:** en MakeHuman el "peso" pone el tamaño y el "músculo" la
  composición. En el músculo, el "músculo" sale del índice de masa libre de
  grasa (y de la masa muscular) y el "peso" completa el volumen. En la grasa,
  el % de grasa decide si el cuerpo pesado se ve musculoso o gordo, y la grasa
  visceral, la barriga.
- **Vista "grasa y músculo":** el músculo (rojo) va dentro de la grasa; la
  grasa (amarillo) es la diferencia, más opaca donde es más gruesa.
- **Cómo se ve:** la figura es la escultura "Muscle Male / Female" (Floriane
  Legros-Collard, `images/2284-*`), tal cual se subió (`escultura.ts`). El
  cuerpo de MakeHuman no se muestra: solo sirve para medir y ajustar. Cada
  vértice de la escultura se mueve lo mismo que su punto de ese cuerpo entre el
  cuerpo de referencia (MakeHuman con las medidas de la escultura) y el del
  cliente (ese movimiento se suaviza un poco sobre la malla para que la
  escultura no se doble donde MakeHuman cambia de golpe): los centímetros
  escritos pasan casi 1 a 1 a la figura; el músculo (rojo) y la grasa (amarillo) son la
  escultura movida con el cuerpo sin grasa y con el cuerpo completo. Cómo se
  genera: [`tools/README.md`](../../../tools/README.md#cuerpo-esculpido).
  Los colores son los pintados en el modelo, sin cambios.
- **Comparar:** el cuerpo objetivo aplica los controles de grasa y músculo del
  informe repartidos en proporción a cada segmento (`resultados.ts`).

## Archivos

| Archivo | Qué hace |
| --- | --- |
| `PaginaModelo3D.tsx` | Página: carga el cuerpo, lanza ajustes y cálculos, captura PNG, teclado. |
| `Escena.tsx` | Escena 3D: modos de vista, materiales, luces, anillos con etiquetas, cámara, HDRI. |
| `escultura.ts` | La figura (escultura): carga, posiciones según el cuerpo, colores, anillos. |
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
- `COLOR_GRASA_POCA` / `COLOR_GRASA_MUCHA` / `GROSOR_GRASA_OSCURA`: la grasa va
  de amarillo claro a ámbar oscuro según su grosor (oscuro desde 6 cm). El cuerpo usa los colores pintados en el
  modelo, tal cual (sin teñir ni mapeo de tonos).

## Pruebas

```bash
npm test -w client        # 79 tests: geometría, medición, solver, escultura, formulario, resultados
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
- Mover la escultura con el cuerpo cuesta ~10 ms por capa y por cambio (la
  página espera a tener cuerpo y escultura, ~3 MB, para mostrar el visor).
- Modelos de ~0,9 MB (meshopt) y HDRI de 0,5 MB.
- Teclado: flechas para girar el modelo, flechas entre pestañas, foco visible;
  descripción del cuerpo para lectores de pantalla; "reducir movimiento" salta
  la animación de transición. Auditado con axe (WCAG 2.1 AA) sin problemas.
