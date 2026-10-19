import { useCallback, useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactElement } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { PoseLandmarker } from '@mediapipe/tasks-vision';
import { Boton as BotonJs, cx } from '../components/ui.jsx';
import { IconoAtras } from '../components/Iconos.jsx';
import { cargarDetector, detectar } from './detector';
import { ejercicioDe, type Ejercicio } from './ejercicios';
import { HUESOS, type Pose } from './puntos';
import { anclaDe, cajaDe, elegirPrincipal, Seguidor, type Ancla, type Caja } from './seguimiento';
import {
  ARRIBA,
  ContadorSentadilla,
  ejeDePie,
  promedioEjes,
  UMBRALES,
  ETIQUETA_FALLA,
  medirSentadilla,
  resumir,
  VOZ_FALLA,
  type Ejes,
  type Lectura,
  type Vista,
  type Repeticion,
  type Resumen,
} from './sentadilla';

/** El botón de la app (JS), con sus props tipadas para usarlo desde TS. */
const Boton = BotonJs as unknown as (
  p: ButtonHTMLAttributes<HTMLButtonElement> & { variante?: 'principal' | 'secundario' | 'contorno' | 'peligro' | 'fantasma'; cargando?: boolean },
) => ReactElement;

/**
 * Conteo de repeticiones con la cámara del celular (`/ejercicio/:slug`).
 *
 * Se llega escaneando el QR de la máquina. El celular va en el soporte, la
 * persona hace su serie y la página cuenta las repeticiones y dice cuáles
 * estuvieron bien hechas, con un consejo al final. El video se analiza en el
 * propio celular (MediaPipe) y no se guarda ni se envía a ninguna parte.
 */

type Fase = 'inicio' | 'cargando' | 'preparando' | 'contando' | 'resultado' | 'error';

/** Al preparar, cuadros sin ver a la persona elegida antes de elegir a otra. */
const CUADROS_PARA_SOLTAR = 15;
/** Segundos de pie y quieto para arrancar la serie. */
const S_PARA_EMPEZAR = 1;
/** Con al menos una repetición: segundos de pie sin bajar para terminar la serie solo. */
const S_PARA_TERMINAR = 10;
/** Con al menos una repetición: segundos sin ver a la persona para terminar la serie. */
const S_FUERA_PARA_TERMINAR = 4;
/** Cuadros seguidos en los que el detector falla antes de rendirse. */
const FALLOS_SEGUIDOS_MAX = 30;
/** Los últimos segundos antes de terminar solo se muestran como cuenta regresiva. */
const S_CUENTA_REGRESIVA = 4;

interface Vivo {
  mensaje: string | null;
  profundidad: number;
  terminaEn: number | null;
  vista: Vista | null;
}

interface SerieHecha {
  numero: number;
  resumen: Resumen;
  repeticiones: Repeticion[];
}

function leerVoz() {
  try {
    return localStorage.getItem('ejercicio:voz') !== 'no';
  } catch {
    return true;
  }
}

function hablar(texto: string) {
  try {
    const s = window.speechSynthesis;
    if (!s) return;
    s.cancel();
    const u = new SpeechSynthesisUtterance(texto);
    u.lang = 'es-ES';
    u.rate = 1.1;
    s.speak(u);
  } catch {
    // Sin voz: la pantalla basta.
  }
}

/**
 * El esqueleto de la persona seguida en color y el de las demás en gris tenue
 * (para que se vea que no se las tiene en cuenta).
 */
function dibujar(lienzo: HTMLCanvasElement, video: HTMLVideoElement, pose: Pose | null, otras: readonly Pose[], destacar: 'bien' | 'mal' | null) {
  const w = video.videoWidth;
  const h = video.videoHeight;
  if (!w || !h) return;
  if (lienzo.width !== w || lienzo.height !== h) {
    lienzo.width = w;
    lienzo.height = h;
  }
  const g = lienzo.getContext('2d');
  if (!g) return;
  g.clearRect(0, 0, w, h);
  const grosor = Math.max(3, w / 160);
  g.lineCap = 'round';
  const huesos = (p: Pose['imagen']) => {
    for (const [a, b] of HUESOS) {
      if ((p[a].visibility ?? 1) < 0.4 || (p[b].visibility ?? 1) < 0.4) continue;
      g.beginPath();
      g.moveTo(p[a].x * w, p[a].y * h);
      g.lineTo(p[b].x * w, p[b].y * h);
      g.stroke();
    }
  };
  g.strokeStyle = 'rgba(183, 189, 201, 0.35)';
  g.lineWidth = grosor * 0.6;
  for (const o of otras) if (o !== pose) huesos(o.imagen);
  if (!pose) return;
  const p = pose.imagen;
  g.strokeStyle = destacar === 'mal' ? '#FF6B57' : destacar === 'bien' ? '#33D67F' : 'rgba(200, 247, 81, 0.9)';
  g.lineWidth = grosor;
  for (const [a, b] of HUESOS) {
    if ((p[a].visibility ?? 1) < 0.4 || (p[b].visibility ?? 1) < 0.4) continue;
    g.beginPath();
    g.moveTo(p[a].x * w, p[a].y * h);
    g.lineTo(p[b].x * w, p[b].y * h);
    g.stroke();
  }
  g.fillStyle = '#FFFFFF';
  for (const i of [11, 12, 23, 24, 25, 26, 27, 28]) {
    if ((p[i].visibility ?? 1) < 0.4) continue;
    g.beginPath();
    g.arc(p[i].x * w, p[i].y * h, grosor * 1.2, 0, Math.PI * 2);
    g.fill();
  }
}

export default function PaginaEjercicio() {
  const { slug } = useParams();
  const ejercicio = ejercicioDe(slug);
  if (!ejercicio) {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-lg font-bold">Este ejercicio no existe.</p>
        <p className="text-sm text-humo-500">Vuelve a escanear el código de la máquina.</p>
        <Link to="/" className="text-volt-500 font-semibold">
          Ir al inicio
        </Link>
      </div>
    );
  }
  return <Conteo ejercicio={ejercicio} />;
}

function Conteo({ ejercicio }: { ejercicio: Ejercicio }) {
  const [fase, setFase] = useState<Fase>('inicio');
  const [error, setError] = useState<string | null>(null);
  const [frontal, setFrontal] = useState(true);
  const [voz, setVoz] = useState(leerVoz);
  const [cuenta, setCuenta] = useState(0);
  const [ultima, setUltima] = useState<Repeticion | null>(null);
  const [vivo, setVivo] = useState<Vivo>({ mensaje: null, profundidad: 0, terminaEn: null, vista: null });
  const [series, setSeries] = useState<SerieHecha[]>([]);

  const video = useRef<HTMLVideoElement>(null);
  const lienzo = useRef<HTMLCanvasElement>(null);
  const flujo = useRef<MediaStream | null>(null);
  const detector = useRef<PoseLandmarker | null>(null);
  const contador = useRef(new ContadorSentadilla());
  /** A quién se sigue entre la gente que se ve (se elige al preparar cada serie). */
  const seguidor = useRef(new Seguidor());
  const bloqueo = useRef<{ release(): Promise<void> } | null>(null);
  /** La vertical medida de pie al preparar (sirve aunque el celular esté torcido). */
  const eje = useRef<Ejes>(ARRIBA);
  const vozRef = useRef(voz);
  vozRef.current = voz;

  const apagarCamara = useCallback(() => {
    flujo.current?.getTracks().forEach((t) => t.stop());
    flujo.current = null;
    bloqueo.current?.release().catch(() => {});
    bloqueo.current = null;
  }, []);
  useEffect(() => apagarCamara, [apagarCamara]);

  const encenderCamara = useCallback(
    async (usarFrontal: boolean) => {
      apagarCamara();
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('sin-camara');
      // Sin pedir resolución ni proporción: lo que da el celular por defecto (4:3,
      // ~640×480) es el sensor entero. Pedir 16:9 o 720×1280 recorta los lados
      // del sensor en muchos teléfonos y obligaba a alejarse de más.
      const s = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: usarFrontal ? 'user' : 'environment' },
      });
      flujo.current = s;
      // Y sin zoom: algunos celulares arrancan la cámara con un poco.
      const pista = s.getVideoTracks()[0];
      const zoom = (pista?.getCapabilities?.() as { zoom?: { min: number } } | undefined)?.zoom;
      if (zoom) await pista.applyConstraints({ advanced: [{ zoom: zoom.min } as MediaTrackConstraintSet] }).catch(() => {});
      const v = video.current!;
      v.srcObject = s;
      await v.play();
      // Que la pantalla no se apague durante la serie.
      try {
        const wl = (navigator as Navigator & { wakeLock?: { request(t: 'screen'): Promise<{ release(): Promise<void> }> } }).wakeLock;
        bloqueo.current = (await wl?.request('screen')) ?? null;
      } catch {
        // No es grave: algunos navegadores no lo permiten.
      }
    },
    [apagarCamara],
  );

  const empezar = useCallback(
    async (usarFrontal = frontal) => {
      setFase('cargando');
      setError(null);
      try {
        const [d] = await Promise.all([cargarDetector(), encenderCamara(usarFrontal)]);
        detector.current = d;
        contador.current = new ContadorSentadilla();
        seguidor.current = new Seguidor();
        eje.current = ARRIBA;
        setCuenta(0);
        setUltima(null);
        setFase('preparando');
      } catch (e) {
        apagarCamara();
        const nombre = (e as Error)?.name;
        setError(
          nombre === 'NotAllowedError'
            ? 'No diste permiso para usar la cámara. Actívalo en la configuración del navegador (el candado junto a la dirección) y vuelve a intentarlo.'
            : (e as Error)?.message === 'sin-camara' || nombre === 'NotFoundError'
              ? 'Este navegador no puede usar la cámara. Abre la página en Chrome o Safari.'
              : 'No se pudo preparar el detector. Revisa la conexión e inténtalo de nuevo.',
        );
        setFase('error');
      }
    },
    [frontal, encenderCamara, apagarCamara],
  );

  const terminar = useCallback(() => {
    const reps = [...contador.current.repeticiones];
    const resumen = resumir(reps);
    setSeries((s) => [...s, { numero: s.length + 1, resumen, repeticiones: reps }]);
    apagarCamara();
    setFase('resultado');
    if (vozRef.current) hablar(`Serie terminada. ${resumen.buenas} de ${resumen.total} bien hechas.`);
  }, [apagarCamara]);

  // Bucle de análisis: un cuadro nuevo de la cámara → pose → medidas → contador.
  useEffect(() => {
    if (fase !== 'preparando' && fase !== 'contando') return;
    const d = detector.current;
    const v = video.current;
    const c = lienzo.current;
    if (!d || !v || !c) return;
    let raf = 0;
    let ultimoCuadro = -1;
    let deEsDesde: number | null = null;
    const ejes: Ejes[] = [];
    let destacado: { tipo: 'bien' | 'mal'; hasta: number } | null = null;
    let ultimoMovimiento = performance.now() / 1000;
    let fueraDesde: number | null = null;
    let ultimoVivo = 0;
    let preparando = fase === 'preparando';
    let sinVerla = 0;
    // Otras personas a las que el detector se pasó: se tapan en una copia del
    // cuadro un momento para que vuelva a encontrar a quien entrena.
    let tapadas: { caja: Caja; hasta: number }[] = [];
    const copia = document.createElement('canvas');
    let piesAlParar: Ancla | null = null;
    let fallos = 0;

    const bucle = () => {
      raf = requestAnimationFrame(bucle);
      if (v.readyState < 2 || v.currentTime === ultimoCuadro) return;
      ultimoCuadro = v.currentTime;
      const ahora = performance.now();
      const t = ahora / 1000;
      let poses: Pose[] = [];
      tapadas = tapadas.filter((x) => x.hasta > t);
      let fuente: HTMLVideoElement | HTMLCanvasElement = v;
      if (tapadas.length) {
        const w = v.videoWidth;
        const h = v.videoHeight;
        if (copia.width !== w || copia.height !== h) {
          copia.width = w;
          copia.height = h;
        }
        const g = copia.getContext('2d');
        if (g) {
          g.drawImage(v, 0, 0, w, h);
          g.fillStyle = '#000';
          for (const { caja } of tapadas) g.fillRect(caja.x0 * w, caja.y0 * h, (caja.x1 - caja.x0) * w, (caja.y1 - caja.y0) * h);
          fuente = copia;
        }
      }
      try {
        poses = detectar(d, fuente, ahora, v.videoWidth / (v.videoHeight || 1));
        fallos = 0;
      } catch {
        // Un cuadro que falla se salta; si fallan todos, el celular no puede.
        if (++fallos >= FALLOS_SEGUIDOS_MAX) {
          cancelAnimationFrame(raf);
          apagarCamara();
          setError('Este celular no pudo analizar el video (necesita WebGL). Prueba con Chrome actualizado o con otro teléfono.');
          setFase('error');
        }
        return;
      }
      // La persona seguida: al preparar, la principal (la de adelante); después,
      // la que tiene los pies donde los tenía ella, aunque pase más gente.
      const seg = seguidor.current;
      if (preparando && !seg.ancla) {
        const principal = elegirPrincipal(poses);
        if (principal) seg.fijar(principal);
      }
      const pose = seg.elegir(poses);
      if (pose) sinVerla = 0;
      else if (preparando && ++sinVerla > CUADROS_PARA_SOLTAR) seg.soltar(); // se fue: elegir de nuevo
      // Lo que no pasó la validación: una falla del detector (se ignora ese cuadro)
      // u otra persona, que se tapa un segundo para que el detector la suelte.
      let seCruzo = false;
      if (!pose && seg.ancla) {
        for (const p of poses) {
          const caja = cajaDe(p);
          if (!caja || seg.clasificar(p) !== 'otra') continue;
          seCruzo = true;
          const mx = (caja.x1 - caja.x0) * 0.25;
          const my = (caja.y1 - caja.y0) * 0.15;
          tapadas.push({ caja: { x0: caja.x0 - mx, y0: caja.y0 - my, x1: caja.x1 + mx, y1: caja.y1 + my }, hasta: t + 1 });
        }
      }
      const lectura: Lectura = seCruzo
        ? { tipo: 'incompleto', motivo: 'Alguien se cruzó: te espero.' }
        : !pose && poses.length && seg.ancla
          ? { tipo: 'incompleto', motivo: '' } // falla del detector en este cuadro: no hace falta avisar
          : medirSentadilla(pose, eje.current);
      if (destacado && t > destacado.hasta) destacado = null;
      dibujar(c, v, pose, poses, destacado?.tipo ?? null);

      let mensaje: string | null = lectura.tipo === 'incompleto' ? lectura.motivo || null : null;
      let terminaEn: number | null = null;
      const cont = contador.current;

      if (preparando) {
        // Esperar a verla de pie y quieta un momento (de perfil o de frente): de
        // ahí salen la vertical y los largos del muslo y el torso.
        // Quieta: los pies no se movieron desde que se paró (quien camina no cuenta).
        const pies = pose ? anclaDe(pose) : null;
        const quieta = !!pies && (!piesAlParar || Math.hypot(pies.x - piesAlParar.x, pies.y - piesAlParar.y) < 0.3 * piesAlParar.tibia);
        if (lectura.tipo === 'ok' && lectura.cuadro.muslo >= UMBRALES.arriba && pose && quieta) {
          if (deEsDesde === null) {
            deEsDesde = t;
            piesAlParar = pies;
          }
          const e = ejeDePie(pose);
          if (e) ejes.push(e);
          mensaje = 'Quédate de pie un momento…';
          if (t - deEsDesde >= S_PARA_EMPEZAR && ejes.length) {
            eje.current = promedioEjes(ejes);
            seg.fijar(pose); // desde aquí se sigue a esta persona
            preparando = false;
            ultimoMovimiento = t;
            setFase('contando');
            if (vozRef.current) hablar('Listo. Empieza.');
          }
        } else {
          deEsDesde = null;
          piesAlParar = null;
          ejes.length = 0;
          if (lectura.tipo === 'ok') mensaje = 'Párate derecho para empezar.';
        }
      } else {
        const rep = cont.procesar(lectura, t);
        if (rep) {
          setCuenta(cont.repeticiones.length);
          setUltima(rep);
          destacado = { tipo: rep.buena ? 'bien' : 'mal', hasta: t + 0.7 };
          if (vozRef.current) hablar(rep.buena ? String(rep.numero) : `${rep.numero}, ${VOZ_FALLA[rep.fallas[0]]}`);
        }
        if (cont.fase !== 'arriba') ultimoMovimiento = t;
        // Terminar sola: de pie sin bajar un rato, o fuera de cuadro.
        if (lectura.tipo === 'ok') fueraDesde = null;
        else fueraDesde ??= t;
        if (cont.repeticiones.length > 0) {
          const quieta = t - ultimoMovimiento;
          const fuera = fueraDesde === null ? 0 : t - fueraDesde;
          if (quieta >= S_PARA_TERMINAR || fuera >= S_FUERA_PARA_TERMINAR) {
            cancelAnimationFrame(raf);
            terminar();
            return;
          }
          const resta = Math.min(S_PARA_TERMINAR - quieta, fueraDesde === null ? Infinity : S_FUERA_PARA_TERMINAR - fuera);
          if (resta <= S_CUENTA_REGRESIVA) terminaEn = Math.ceil(resta);
        }
      }
      if (ahora - ultimoVivo > 100) {
        ultimoVivo = ahora;
        setVivo({ mensaje, profundidad: preparando ? 0 : cont.profundidad(), terminaEn, vista: lectura.tipo === 'ok' ? lectura.cuadro.vista : null });
      }
    };
    raf = requestAnimationFrame(bucle);
    return () => cancelAnimationFrame(raf);
  }, [fase, terminar, apagarCamara]);

  const cambiarVoz = () => {
    const nueva = !voz;
    setVoz(nueva);
    try {
      localStorage.setItem('ejercicio:voz', nueva ? 'si' : 'no');
    } catch {
      // Sin almacenamiento: vale solo por esta visita.
    }
    if (!nueva) window.speechSynthesis?.cancel();
  };

  const cambiarCamara = () => {
    const nueva = !frontal;
    setFrontal(nueva);
    empezar(nueva);
  };

  const conCamara = fase === 'cargando' || fase === 'preparando' || fase === 'contando';
  const serie = series[series.length - 1];

  return (
    <div className="h-dvh flex flex-col overflow-hidden bg-carbon-950">
      <header className="shrink-0 px-4 pt-4 pb-3 flex items-center gap-3">
        <Link to="/" aria-label="Volver" className="p-2 -ml-2 rounded-xl text-humo-300 hover:bg-carbon-700 active:scale-95">
          <IconoAtras />
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-extrabold tracking-tightest truncate">{ejercicio.nombre}</h1>
          <p className="text-xs text-humo-500 truncate">
            {ejercicio.equipo}
            {series.length > 0 && fase !== 'resultado' ? ` · Serie ${series.length + 1}` : ''}
          </p>
        </div>
        {conCamara && (
          <button
            type="button"
            onClick={cambiarVoz}
            aria-pressed={voz}
            className="rounded-xl px-3 py-2 text-xs font-semibold text-humo-300 bg-carbon-700"
          >
            {voz ? 'Voz: sí' : 'Voz: no'}
          </button>
        )}
      </header>

      {/* La cámara: siempre montada mientras se usa, debajo de los avisos. */}
      <div className={cx('relative flex-1 min-h-0', !conCamara && 'hidden')}>
        <video
          ref={video}
          playsInline
          muted
          className={cx('absolute inset-0 w-full h-full object-contain', frontal && '-scale-x-100')}
        />
        <canvas
          ref={lienzo}
          className={cx('absolute inset-0 w-full h-full object-contain pointer-events-none', frontal && '-scale-x-100')}
        />

        {fase === 'cargando' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-carbon-950/80 text-center px-8">
            <span className="w-8 h-8 rounded-full border-2 border-volt-500 border-t-transparent animate-spin" />
            <p className="font-semibold">Preparando la cámara y el detector…</p>
            <p className="text-xs text-humo-500">La primera vez descarga unos 10 MB.</p>
          </div>
        )}

        {fase === 'contando' && (
          <>
            <div
              aria-live="polite"
              className="absolute top-3 left-3 rounded-3xl bg-carbon-950/75 px-5 py-3 text-center backdrop-blur"
            >
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-humo-500">Repeticiones</p>
              <p className="text-6xl font-extrabold tabular-nums leading-none">{cuenta}</p>
              {vivo.vista && <p className="mt-1 text-[11px] font-semibold text-humo-300">{vivo.vista === 'frente' ? 'De frente' : 'De perfil'}</p>}
            </div>
            {ultima && (
              <div
                key={ultima.numero}
                className={cx(
                  'absolute top-3 right-3 max-w-[55%] rounded-2xl px-4 py-2 text-sm font-semibold backdrop-blur',
                  ultima.buena ? 'bg-puesto-libre/20 text-puesto-libre' : 'bg-alerta/20 text-alerta',
                )}
              >
                {ultima.buena ? `#${ultima.numero} bien hecha` : `#${ultima.numero}: ${ultima.fallas.map((f) => ETIQUETA_FALLA[f].toLowerCase()).join(', ')}`}
              </div>
            )}
            {/* Profundidad en vivo: se llena al bajar y se pone verde al llegar al paralelo. */}
            <div className="absolute right-3 top-1/2 -translate-y-1/2 h-1/3 w-3 rounded-full bg-carbon-950/70 overflow-hidden" aria-hidden>
              <div
                className={cx('absolute bottom-0 inset-x-0 rounded-full transition-[height] duration-100', vivo.profundidad >= 1 ? 'bg-puesto-libre' : 'bg-volt-500')}
                style={{ height: `${Math.round(vivo.profundidad * 100)}%` }}
              />
            </div>
          </>
        )}

        {(fase === 'preparando' || fase === 'contando') && (vivo.mensaje || vivo.terminaEn !== null) && (
          <div className="absolute inset-x-3 bottom-24 rounded-2xl bg-carbon-950/80 px-4 py-3 text-center text-sm font-semibold backdrop-blur">
            {vivo.terminaEn !== null ? `Terminando la serie en ${vivo.terminaEn}…` : vivo.mensaje}
          </div>
        )}

        {(fase === 'preparando' || fase === 'contando') && (
          <div className="absolute inset-x-3 bottom-3 flex gap-2">
            {fase === 'preparando' ? (
              <Boton variante="secundario" className="flex-1" onClick={cambiarCamara}>
                Cambiar cámara
              </Boton>
            ) : (
              <Boton className="flex-1" onClick={terminar}>
                Terminar serie
              </Boton>
            )}
          </div>
        )}
      </div>

      {fase === 'inicio' && (
        <main className="flex-1 overflow-y-auto px-5 pb-6">
          <ol className="space-y-3">
            {ejercicio.preparacion.map((paso, i) => (
              <li key={i} className="flex gap-3 rounded-2xl bg-carbon-800 p-4">
                <span className="shrink-0 w-7 h-7 rounded-full bg-volt-500 text-carbon-900 font-bold grid place-items-center text-sm">{i + 1}</span>
                <span className="text-sm text-humo-100">{paso}</span>
              </li>
            ))}
          </ol>
          <p className="mt-4 text-xs text-humo-500">
            El video se analiza en tu celular y no se guarda ni se envía a ninguna parte.
          </p>
          <Boton className="mt-5 w-full" onClick={() => empezar()}>
            Empezar
          </Boton>
        </main>
      )}

      {fase === 'error' && (
        <main className="flex-1 flex flex-col items-center justify-center gap-5 px-6 text-center">
          <p className="text-sm text-humo-100">{error}</p>
          <Boton onClick={() => empezar()}>Intentar de nuevo</Boton>
        </main>
      )}

      {fase === 'resultado' && serie && (
        <Resultado
          serie={serie}
          anteriores={series.slice(0, -1)}
          onOtra={() => empezar()}
        />
      )}
    </div>
  );
}

function Resultado({ serie, anteriores, onOtra }: { serie: SerieHecha; anteriores: SerieHecha[]; onOtra: () => void }) {
  const r = serie.resumen;
  return (
    <main className="flex-1 overflow-y-auto px-5 pb-6" aria-live="polite">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-humo-500">Serie {serie.numero}</p>
      <div className="mt-2 rounded-3xl bg-carbon-800 p-5">
        <p className="text-sm text-humo-300">Total de repeticiones</p>
        <p className="text-6xl font-extrabold tabular-nums leading-tight">{r.total}</p>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-puesto-libre/15 p-3">
            <p className="text-3xl font-extrabold tabular-nums text-puesto-libre">{r.buenas}</p>
            <p className="text-xs text-humo-300">bien hechas</p>
          </div>
          <div className="rounded-2xl bg-alerta/15 p-3">
            <p className="text-3xl font-extrabold tabular-nums text-alerta">{r.malas}</p>
            <p className="text-xs text-humo-300">mal hechas</p>
          </div>
        </div>
      </div>

      {serie.repeticiones.length > 0 && (
        <ul className="mt-4 flex flex-wrap gap-2" aria-label="Cada repetición">
          {serie.repeticiones.map((rep) => (
            <li
              key={rep.numero}
              title={rep.buena ? 'Bien hecha' : rep.fallas.map((f) => ETIQUETA_FALLA[f]).join(', ')}
              className={cx(
                'w-9 h-9 rounded-xl grid place-items-center text-sm font-bold',
                rep.buena ? 'bg-puesto-libre/20 text-puesto-libre' : 'bg-alerta/20 text-alerta',
              )}
            >
              {rep.numero}
            </li>
          ))}
        </ul>
      )}
      {r.malas > 0 && (
        <ul className="mt-3 space-y-1 text-xs text-humo-300">
          {serie.repeticiones
            .filter((rep) => !rep.buena)
            .map((rep) => (
              <li key={rep.numero}>
                <span className="font-semibold text-alerta">#{rep.numero}</span> {rep.fallas.map((f) => ETIQUETA_FALLA[f]).join(', ')}
              </li>
            ))}
        </ul>
      )}

      <h2 className="mt-6 text-sm font-bold">{r.consejos.length > 1 ? 'Consejos' : 'Consejo'}</h2>
      <ul className="mt-2 space-y-2">
        {r.consejos.map((c, i) => (
          <li key={i} className="rounded-2xl border border-carbon-600 bg-carbon-800 p-4 text-sm text-humo-100">
            {c}
          </li>
        ))}
      </ul>

      {anteriores.length > 0 && (
        <div className="mt-6">
          <h2 className="text-sm font-bold">Series anteriores</h2>
          <ul className="mt-2 space-y-1 text-sm text-humo-300">
            {anteriores.map((s) => (
              <li key={s.numero}>
                Serie {s.numero}: {s.resumen.total} repeticiones, {s.resumen.buenas} bien hechas
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-6 grid gap-2">
        <Boton onClick={onOtra}>Otra serie</Boton>
        <Link to="/" className="text-center text-sm font-semibold text-humo-300 py-3">
          Terminar
        </Link>
      </div>
    </main>
  );
}
