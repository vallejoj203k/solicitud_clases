import type { Tarjeta } from './resultados';

/**
 * Captura PNG del resultado para que el cliente se la lleve: el cuadro del
 * visor 3D con el logo, el nombre, la fecha, los números clave y la nota fija.
 * Todo se arma en el navegador; no se sube ni se guarda nada en el servidor.
 */

const ANCHO = 1080;
const ALTO = 1350;
const LOGO = '/images/logo-megavital.jpg';
const VERDE = '#8CC63F';

function cargarImagen(src: string): Promise<HTMLImageElement | null> {
  return new Promise((ok) => {
    const img = new Image();
    img.onload = () => ok(img);
    img.onerror = () => ok(null);
    img.src = src;
  });
}

/** Dibuja `img` cubriendo el rectángulo (recorta lo que sobra, centrado). */
function cubrir(ctx: CanvasRenderingContext2D, img: CanvasImageSource & { width: number; height: number }, x: number, y: number, w: number, h: number) {
  const r = Math.max(w / img.width, h / img.height);
  const sw = w / r;
  const sh = h / r;
  ctx.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, x, y, w, h);
}

export async function componerCaptura(
  lienzo3d: HTMLCanvasElement,
  datos: { nombre?: string; vista: string; tarjetas: Tarjeta[]; credito?: string },
): Promise<Blob> {
  const c = document.createElement('canvas');
  c.width = ANCHO;
  c.height = ALTO;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#0F1115';
  ctx.fillRect(0, 0, ANCHO, ALTO);

  // Encabezado
  const logo = await cargarImagen(LOGO);
  if (logo) {
    const h = 84;
    ctx.drawImage(logo, ANCHO - 48 - (logo.width * h) / logo.height, 40, (logo.width * h) / logo.height, h);
  }
  ctx.fillStyle = '#EDEFF3';
  ctx.font = '800 46px Inter, system-ui, sans-serif';
  ctx.fillText('Resultado 3D', 48, 88);
  ctx.fillStyle = '#8A93A3';
  ctx.font = '500 26px Inter, system-ui, sans-serif';
  const fecha = new Date().toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' });
  ctx.fillText([datos.nombre, fecha].filter(Boolean).join(' · '), 48, 128);

  // Cuadro 3D
  const y3d = 160;
  const h3d = 860;
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(48, y3d, ANCHO - 96, h3d, 28);
  ctx.clip();
  ctx.fillStyle = '#0F1115';
  ctx.fillRect(48, y3d, ANCHO - 96, h3d);
  cubrir(ctx, lienzo3d, 48, y3d, ANCHO - 96, h3d);
  ctx.restore();
  ctx.font = '700 24px Inter, system-ui, sans-serif';
  ctx.fillStyle = 'rgba(28,32,40,0.9)';
  ctx.beginPath();
  ctx.roundRect(72, y3d + 24, ctx.measureText(datos.vista).width + 48, 48, 24);
  ctx.fill();
  ctx.fillStyle = VERDE;
  ctx.fillText(datos.vista, 96, y3d + 56);

  // Números clave (hasta 6, en dos filas de tres)
  const lista = datos.tarjetas.slice(0, 6);
  const colW = (ANCHO - 96 - 32) / 3;
  lista.forEach((t, i) => {
    const x = 48 + (i % 3) * (colW + 16);
    const y = 1044 + Math.floor(i / 3) * 112;
    ctx.fillStyle = '#1C2028';
    ctx.beginPath();
    ctx.roundRect(x, y, colW, 100, 18);
    ctx.fill();
    ctx.fillStyle = '#8A93A3';
    ctx.font = '600 20px Inter, system-ui, sans-serif';
    ctx.fillText(t.corto.toUpperCase(), x + 20, y + 34);
    ctx.fillStyle = t.tramo?.color ?? '#EDEFF3';
    ctx.font = '800 36px Inter, system-ui, sans-serif';
    const valor = `${t.valor}${t.unidad ? ` ${t.unidad}` : ''}`;
    ctx.fillText(valor, x + 20, y + 78);
    if (t.tramo) {
      const w = ctx.measureText(valor).width;
      ctx.fillStyle = '#B7BDC9';
      ctx.font = '600 20px Inter, system-ui, sans-serif';
      ctx.fillText(t.tramo.etiqueta, x + 32 + w, y + 78);
    }
  });

  ctx.fillStyle = '#8A93A3';
  ctx.font = '500 22px Inter, system-ui, sans-serif';
  ctx.fillText('Datos de referencia deportiva, no para fines médicos.', 48, ALTO - 30);
  if (datos.credito) {
    // Atribución que pide la licencia de los modelos (CC BY-SA).
    ctx.font = '500 18px Inter, system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(datos.credito, ANCHO - 48, ALTO - 30);
    ctx.textAlign = 'left';
  }

  return new Promise((ok, mal) => c.toBlob((b) => (b ? ok(b) : mal(new Error('No se pudo crear la imagen'))), 'image/png'));
}

/** Comparte la imagen (menú de compartir del teléfono) o, si no se puede, la descarga. */
export async function compartirODescargar(blob: Blob, nombreArchivo: string): Promise<'compartida' | 'descargada'> {
  const archivo = new File([blob], nombreArchivo, { type: 'image/png' });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (nav.share && nav.canShare?.({ files: [archivo] })) {
    try {
      await nav.share({ files: [archivo], title: 'Resultado 3D · Gimnasio Mega Vital' });
      return 'compartida';
    } catch (e) {
      if ((e as Error).name === 'AbortError') return 'compartida';
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombreArchivo;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  return 'descargada';
}
