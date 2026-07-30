import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import QRCode from 'qrcode';
import { api, descargar } from '../api/client.js';
import { Aviso, Boton, Cargando, Insignia, Vacio } from '../components/ui.jsx';
import { IconoCalendario, IconoCheck, IconoFlecha } from '../components/Iconos.jsx';
import { pesos } from '../lib/formato.js';

/**
 * Pantalla de éxito / detalle de una reserva.
 * El código funciona como check-in en recepción: se muestra en grande y en QR.
 */
export default function Reserva() {
  const { codigo } = useParams();
  const [params] = useSearchParams();
  const esNueva = params.get('nueva') === '1';
  const [qr, setQr] = useState(null);

  const { data: reserva, isLoading, error } = useQuery({
    queryKey: ['reserva', codigo],
    queryFn: () => api.reserva(codigo),
  });

  useEffect(() => {
    if (!reserva) return;
    // QR generado en el navegador: no se envía nada a ningún servicio externo.
    QRCode.toDataURL(reserva.codigo, {
      width: 320,
      margin: 1,
      color: { dark: '#0F1115', light: '#FFFFFF' },
    })
      .then(setQr)
      .catch(() => setQr(null));
  }, [reserva]);

  if (isLoading) return <Cargando texto="Buscando tu reserva…" />;
  if (error) {
    return (
      <Vacio
        titulo="No encontramos esa reserva"
        descripcion="Revisa el código o vuelve a la pantalla principal."
        accion={
          <Link to="/">
            <Boton variante="contorno">Ir al inicio</Boton>
          </Link>
        }
      />
    );
  }

  const acento = reserva.clase.tipoClase.color;
  const cancelada = reserva.estado === 'CANCELADA';

  return (
    <div className="min-h-dvh px-5 py-8 pb-16 max-w-lg mx-auto">
      {esNueva && !cancelada && (
        <div className="text-center mb-8 animate-aparecer">
          <div
            className="w-16 h-16 rounded-full mx-auto flex items-center justify-center animate-latido"
            style={{ backgroundColor: `${acento}24`, color: acento }}
          >
            <IconoCheck className="w-8 h-8" />
          </div>
          <h1 className="mt-4 text-3xl font-extrabold tracking-tightest">¡Puesto reservado!</h1>
          <p className="mt-1.5 text-humo-500 text-sm">
            Te esperamos el {reserva.clase.etiqueta}
          </p>
        </div>
      )}

      {cancelada && (
        <div className="mb-6">
          <Aviso>Esta reserva fue cancelada.</Aviso>
        </div>
      )}

      {/* Tarjeta tipo pase de abordaje */}
      <div className="tarjeta overflow-hidden animate-aparecer">
        <div className="p-5" style={{ background: `linear-gradient(160deg, ${acento}1A, transparent 70%)` }}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="etiqueta">{reserva.clase.tipoClase.nombre}</p>
              <p className="mt-1 text-2xl font-extrabold tracking-tightest first-letter:uppercase">
                {reserva.clase.etiqueta}
              </p>
              <p className="text-sm text-humo-500 mt-0.5">
                {reserva.clase.instructor ?? 'Instructor por asignar'} · {reserva.clase.duracionMin} min
              </p>
            </div>
            <div className="text-center shrink-0">
              <p className="etiqueta mb-1">Puesto</p>
              <p
                className="px-3.5 py-2 rounded-2xl text-2xl font-extrabold text-carbon-900 tabular-nums"
                style={{ backgroundColor: acento }}
              >
                {reserva.puestoCodigo}
              </p>
            </div>
          </div>
        </div>

        {/* Perforación del pase */}
        <div className="relative h-6 border-t border-dashed border-carbon-600">
          <span className="absolute -left-3 -top-3 w-6 h-6 rounded-full bg-carbon-900" />
          <span className="absolute -right-3 -top-3 w-6 h-6 rounded-full bg-carbon-900" />
        </div>

        <div className="px-5 pb-6 text-center">
          <p className="etiqueta">Muestra este código en recepción</p>
          {qr && (
            <img
              src={qr}
              alt={`Código QR de la reserva ${reserva.codigo}`}
              className="mt-3 mx-auto w-40 h-40 rounded-2xl bg-white p-2"
            />
          )}
          <p className="mt-3 text-3xl font-extrabold tracking-[0.2em] tabular-nums">{reserva.codigo}</p>

          <div className="mt-5 flex items-center justify-center gap-2">
            <Insignia tono={reserva.estadoPago === 'PAGADO' ? 'exito' : 'aviso'}>
              {reserva.estadoPago === 'PAGADO' ? 'Pago confirmado' : 'Pago pendiente'}
            </Insignia>
            <Insignia>{pesos(reserva.montoCop)}</Insignia>
          </div>
          {reserva.estadoPago !== 'PAGADO' && !cancelada && (
            <p className="mt-3 text-xs text-humo-500">
              Puedes pagar en efectivo o por transferencia al llegar al gimnasio.
            </p>
          )}
        </div>
      </div>

      {!cancelada && (
        <div className="mt-6 space-y-3">
          <Boton
            variante="secundario"
            className="w-full"
            onClick={() =>
              descargar(`/reservas/${reserva.codigo}/calendario.ics`, `clase-${reserva.codigo}.ics`)
            }
          >
            <IconoCalendario />
            Agregar a mi calendario
          </Boton>
          <Link to="/mis-reservas" className="block">
            <Boton variante="contorno" className="w-full">
              Ver mis reservas
              <IconoFlecha />
            </Boton>
          </Link>
        </div>
      )}

      <div className="mt-8 text-center">
        <Link to="/" className="text-sm font-semibold text-humo-500 hover:text-humo-100">
          Volver al inicio
        </Link>
      </div>
    </div>
  );
}
