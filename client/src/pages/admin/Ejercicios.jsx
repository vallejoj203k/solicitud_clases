import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Boton } from '../../components/ui.jsx';
import { CabeceraAdmin } from './Layout.jsx';
import { EJERCICIOS } from '../../ejercicio/ejercicios.ts';

/**
 * Los códigos QR que se pegan en cada máquina. Al escanearlo, el celular abre
 * el conteo de repeticiones de ese ejercicio (`/ejercicio/<slug>`).
 *
 * La dirección sale de donde está abierto el panel (`window.location.origin`):
 * imprímelos desde la página publicada, no desde un entorno de pruebas, o el
 * QR llevaría a esa otra dirección.
 */
export default function AdminEjercicios() {
  return (
    <div>
      <CabeceraAdmin
        titulo="Ejercicios"
        descripcion="Códigos QR para pegar en cada máquina: llevan al conteo de repeticiones con la cámara."
      />
      <div className="px-5 md:px-8 pb-10 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {EJERCICIOS.map((e) => (
          <TarjetaQr key={e.slug} ejercicio={e} />
        ))}
      </div>
    </div>
  );
}

function TarjetaQr({ ejercicio }) {
  const url = `${window.location.origin}/ejercicio/${ejercicio.slug}`;
  const [qr, setQr] = useState(null);

  useEffect(() => {
    // QR generado en el navegador: no se envía nada a ningún servicio externo.
    QRCode.toDataURL(url, { width: 640, margin: 1, color: { dark: '#0F1115', light: '#FFFFFF' } })
      .then(setQr)
      .catch(() => setQr(null));
  }, [url]);

  const imprimir = () => {
    const v = window.open('', '_blank', 'width=600,height=800');
    if (!v || !qr) return;
    v.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>QR ${ejercicio.nombre}</title>
      <style>
        body { font-family: system-ui, sans-serif; text-align: center; margin: 0; padding: 40px 24px; color: #0F1115; }
        h1 { font-size: 34px; margin: 0 0 6px; }
        p { font-size: 18px; margin: 0 0 20px; }
        img { width: 360px; height: 360px; }
        small { display: block; margin-top: 16px; font-size: 13px; color: #555; }
      </style></head><body>
      <h1>${ejercicio.nombre}</h1>
      <p>Escanea y cuenta tus repeticiones con la cámara</p>
      <img src="${qr}" alt="">
      <small>${url}</small>
      <script>window.onload = () => { window.print(); }</script>
      </body></html>`);
    v.document.close();
  };

  return (
    <div className="rounded-2xl bg-carbon-800 border border-carbon-700 p-5 flex flex-col items-center text-center">
      <p className="font-bold">{ejercicio.nombre}</p>
      <p className="text-xs text-humo-500">{ejercicio.equipo}</p>
      <div className="mt-4 rounded-xl bg-white p-3">
        {qr ? <img src={qr} alt={`QR de ${ejercicio.nombre}`} className="w-48 h-48" /> : <div className="w-48 h-48" />}
      </div>
      <a href={url} target="_blank" rel="noreferrer" className="mt-3 text-xs text-humo-500 break-all hover:text-humo-100">
        {url}
      </a>
      <div className="mt-4 grid grid-cols-2 gap-2 w-full">
        <Boton variante="secundario" onClick={imprimir} disabled={!qr}>
          Imprimir
        </Boton>
        <a
          href={qr ?? undefined}
          download={`qr-${ejercicio.slug}.png`}
          className="inline-flex items-center justify-center rounded-2xl min-h-[52px] px-5 font-semibold border border-carbon-500 text-humo-100 hover:border-humo-500"
        >
          Descargar
        </a>
      </div>
    </div>
  );
}
