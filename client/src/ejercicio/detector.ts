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
        // Varias personas: en el gimnasio pasa gente; se sigue a una (ver seguimiento.ts).
        numPoses: 3,
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

/** Las personas que se ven en un cuadro del video (puede no haber ninguna). */
export function detectar(detector: PoseLandmarker, video: HTMLVideoElement, ms: number): Pose[] {
  const r = detector.detectForVideo(video, ms);
  const aspecto = video.videoWidth / (video.videoHeight || 1);
  return r.landmarks.map((imagen, i) => ({ imagen, mundo: r.worldLandmarks[i], aspecto })).filter((p) => p.mundo?.length);
}
