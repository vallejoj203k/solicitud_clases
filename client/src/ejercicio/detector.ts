import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision';
// El motor (WebAssembly) y el modelo se sirven desde la propia app: no se
// descarga nada de otros sitios y el video nunca sale del celular.
import cargadorSimd from '@mediapipe/tasks-vision/vision_wasm_internal.js?url';
import binarioSimd from '@mediapipe/tasks-vision/vision_wasm_internal.wasm?url';
import cargadorSinSimd from '@mediapipe/tasks-vision/vision_wasm_nosimd_internal.js?url';
import binarioSinSimd from '@mediapipe/tasks-vision/vision_wasm_nosimd_internal.wasm?url';
import type { Pose } from './puntos';

/**
 * Detector de postura: MediaPipe Pose Landmarker (Apache 2.0), modelo "lite"
 * (~6 MB, rápido en celulares). Corre en el navegador, con la GPU si se puede.
 */
export const MODELO = '/ejercicio/pose_landmarker_lite.task';

let promesa: Promise<PoseLandmarker> | null = null;

export function cargarDetector(): Promise<PoseLandmarker> {
  promesa ??= (async () => {
    const simd = await FilesetResolver.isSimdSupported();
    const archivos = simd
      ? { wasmLoaderPath: cargadorSimd, wasmBinaryPath: binarioSimd }
      : { wasmLoaderPath: cargadorSinSimd, wasmBinaryPath: binarioSinSimd };
    const crear = (delegate: 'GPU' | 'CPU') =>
      PoseLandmarker.createFromOptions(archivos, {
        baseOptions: { modelAssetPath: MODELO, delegate },
        runningMode: 'VIDEO',
        // Una persona: el detector la "sigue" de un cuadro al otro, que es rápido y
        // estable en el fondo de la sentadilla. Con gente alrededor, ver seguimiento.ts.
        numPoses: 1,
        minPoseDetectionConfidence: 0.5,
        minPosePresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });
    try {
      return await crear('GPU');
    } catch {
      return crear('CPU');
    }
  })();
  promesa.catch(() => (promesa = null));
  return promesa;
}

/**
 * Las personas que se ven en un cuadro (puede no haber ninguna). La fuente es el
 * video o una copia del cuadro con alguien tapado (ver PaginaEjercicio).
 */
export function detectar(detector: PoseLandmarker, fuente: HTMLVideoElement | HTMLCanvasElement, ms: number, aspecto: number): Pose[] {
  const r = detector.detectForVideo(fuente, ms);
  return r.landmarks.map((imagen, i) => ({ imagen, mundo: r.worldLandmarks[i], aspecto })).filter((p) => p.mundo?.length);
}
