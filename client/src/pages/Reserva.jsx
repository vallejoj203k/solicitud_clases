import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
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
  const queryClient = useQueryClient();
  const esNueva = params.get('nueva') === '1';
  const [qr, setQr] = useState(null);

  // Wompi devuelve al cliente con el id de la transacción en la URL. Se lo
  // pasamos al servidor para que le pregunte directamente a Wompi en vez de
  // esperar el webhook, que puede tardar unos segundos.
  const idTransaccion = params.get('id') || undefined;

  const { data: reserva, isLoading, error } = useQuery({
    queryKey: ['reserva', codigo],
    queryFn: () => api.reserva(codigo),
  });

  const esperandoPago = reserva?.estado === 'PENDIENTE_PAGO';

  const { data: estadoPago } = useQuery({
    queryKey: ['estadoPago', codigo, idTransaccion],
    queryFn: () => api.estadoPago(codigo, idTransaccion),
    enabled: Boolean(reserva) && esperandoPago,
    // Mientras el pago se resuelve se consulta cada 3 s; el webhook suele
    // llegar antes, pero así la pantalla no se queda colgada.
    refetchInterval: 3000,
  });

  // Cuando el pago se resuelve, se recarga la reserva completa.
  useEffect(() => {
    if (estadoPago && estadoPago.estado !== 'PENDIENTE_PAGO') {
      queryClient.invalidateQueries({ queryKey: ['reserva', codigo] });
      queryClient.invalidateQueries({ queryKey: ['misReservas'] });
    }
  }, [estadoPago, codigo, queryClient]);

  useEffect(() => {
    if (!reserva || reserva.estado === 'PENDIENTE_PAGO') return;
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
  const expirada = reserva.estado === 'EXPIRADA';

  // Todavía en la pasarela o esperando la confirmación de Wompi.
  if (reserva.estado === 'PENDIENTE_PAGO') {
    return <EsperandoPago reserva={reserva} acento={acento} notas={estadoPago?.notasPago} />;
  }

  if (expirada) {
    return (
      <Vacio
        titulo={reserva.estadoPago === 'RECHAZADO' ? 'El pago no se completó' : 'Se venció el tiempo para pagar'}
        descripcion={
          reserva.notasPago ||
          'Tu puesto volvió a quedar libre. Puedes intentarlo de nuevo, el cupo se asigna a quien pague primero.'
        }
        accion={
          <Link to="/">
            <Boton>Volver a reservar</Boton>
          </Link>
        }
      />
    );
  }

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

/**
 * Pantalla intermedia mientras Wompi resuelve el pago.
 *
 * El puesto ya está apartado, así que nadie más lo puede tomar; lo único que
 * falta es la confirmación. Se ofrece volver a la pasarela por si el cliente
 * cerró la ventana sin pagar.
 */
function EsperandoPago({ reserva, acento, notas }) {
  const [reintentando, setReintentando] = useState(false);
  const minutosRestantes = reserva.expiraEn
    ? Math.max(0, Math.round((new Date(reserva.expiraEn).getTime() - Date.now()) / 60000))
    : null;

  const volverAPagar = async () => {
    setReintentando(true);
    try {
      const { url } = await api.checkout(reserva.codigo);
      window.location.href = url;
    } catch {
      setReintentando(false);
    }
  };

  return (
    <div className="min-h-dvh px-5 py-16 max-w-sm mx-auto text-center">
      <div
        className="w-16 h-16 rounded-full mx-auto flex items-center justify-center"
        style={{ backgroundColor: `${acento}24` }}
      >
        <span
          className="w-7 h-7 rounded-full border-2 border-t-transparent animate-spin"
          style={{ borderColor: acento, borderTopColor: 'transparent' }}
        />
      </div>

      <h1 className="mt-5 text-2xl font-extrabold tracking-tightest">Confirmando tu pago…</h1>
      <p className="mt-2 text-sm text-humo-500">
        Te guardamos el puesto <span className="font-bold text-humo-100">{reserva.puestoCodigo}</span>
        {minutosRestantes !== null && minutosRestantes > 0
          ? ` por ${minutosRestantes} minuto${minutosRestantes === 1 ? '' : 's'} más`
          : ''}
        . Esta pantalla se actualiza sola.
      </p>

      {notas && (
        <div className="mt-5">
          <Aviso tono="info">{notas}</Aviso>
        </div>
      )}

      <div className="mt-8 space-y-3">
        <Boton className="w-full" cargando={reintentando} onClick={volverAPagar}>
          Volver a la pasarela de pago
        </Boton>
        <Link to="/mis-reservas" className="block text-sm text-humo-500 hover:text-humo-100">
          Ver mis reservas
        </Link>
      </div>

      <p className="mt-8 text-xs text-humo-500">
        Si ya pagaste, espera unos segundos: la confirmación llega sola. No cierres esta
        página.
      </p>
    </div>
  );
}
