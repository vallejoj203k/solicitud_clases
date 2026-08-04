import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import QRCode from 'qrcode';
import { api, descargar } from '../api/client.js';
import { Aviso, Boton, Campo, Cargando, Entrada, Insignia, Vacio } from '../components/ui.jsx';
import { IconoCalendario, IconoCheck, IconoFlecha, IconoMusica } from '../components/Iconos.jsx';
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

  const { data: config } = useQuery({ queryKey: ['configuracion'], queryFn: api.configuracion });

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
  const yaEmpezo = new Date(reserva.clase.inicioEn).getTime() <= Date.now();
  // La música se puede pedir hasta que la clase termine, no solo antes de que
  // empiece: en mitad del spinning es cuando a uno se le antoja una canción.
  const yaTermino =
    new Date(reserva.clase.inicioEn).getTime() + reserva.clase.duracionMin * 60_000 <= Date.now();

  // Reserva creada pero sin pagar. El puesto NO está apartado: se confirma
  // cuando entre el pago (pasarela) o cuando recepción lo verifique.
  if (reserva.estado === 'PENDIENTE_PAGO') {
    if (config?.modoPago === 'transferencia') {
      return (
        <EsperandoTransferencia
          reserva={reserva}
          acento={acento}
          datos={config.transferencia}
          avisado={Boolean(estadoPago?.avisoPagoEn ?? reserva.avisoPagoEn)}
        />
      );
    }
    return <EsperandoPago reserva={reserva} acento={acento} notas={estadoPago?.notasPago} />;
  }

  if (expirada) {
    return (
      <Vacio
        titulo={reserva.estadoPago === 'RECHAZADO' ? 'El pago no se completó' : 'Esta reserva se venció'}
        descripcion={
          reserva.notasPago ||
          'No alcanzamos a verificar el pago. Puedes reservar de nuevo: el puesto se lo lleva quien pague primero.'
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
              {reserva.nombreInvitado && (
                <p className="mt-1.5 text-[11px] text-humo-500 max-w-[90px] truncate">
                  para {reserva.nombreInvitado}
                </p>
              )}
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
          {/* Una pareja va junta y paga una sola persona: desde aquí se toma el
              segundo puesto sin volver a empezar y sin escribir los datos otra
              vez. La clase viaja en la URL para caer directo en el mapa. */}
          {!yaEmpezo && (
            <Link
              to={`/reservar/${reserva.clase.tipoClase.slug}?clase=${reserva.clase.id}&otro=1`}
              className="block"
            >
              <Boton className="w-full" style={{ backgroundColor: acento }}>
                Reservar otro puesto en esta clase
              </Boton>
            </Link>
          )}
          {/* Pedir música ya no depende de la reserva -cualquiera puede-, así
              que esto es solo un atajo a la pantalla de música. */}
          {!yaTermino && (
            <Link to="/musica" className="block">
              <Boton variante="secundario" className="w-full">
                <IconoMusica />
                Pedir música
              </Boton>
            </Link>
          )}
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

          <CancelarPuesto reserva={reserva} />
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
 * Descartar una reserva que no se va a pagar.
 *
 * El puesto no está apartado, así que esto no libera nada: sirve para que la
 * persona se quite el pendiente de encima y para que no quede colgada en la
 * cola de recepción. Se puede en cualquier momento, sin el plazo de
 * cancelación: no hay nada que devolver.
 */
function LiberarPuesto({ codigo }) {
  const navegar = useNavigate();
  const queryClient = useQueryClient();
  const [liberando, setLiberando] = useState(false);

  const liberar = async () => {
    if (!window.confirm('¿Cancelar esta reserva sin pagar?')) return;
    setLiberando(true);
    try {
      await api.cancelarReserva(codigo);
      queryClient.invalidateQueries();
      navegar('/', { replace: true });
    } catch {
      setLiberando(false);
    }
  };

  return (
    <div className="space-y-3">
      <Link to="/mis-reservas" className="block text-center text-sm text-humo-500 hover:text-humo-100">
        Ver mis reservas
      </Link>
      <button
        onClick={liberar}
        disabled={liberando}
        className="w-full py-2 text-center text-sm text-humo-500 hover:text-alerta transition-colors disabled:opacity-60"
      >
        {liberando ? 'Cancelando…' : 'No voy a pagar, cancelar esta reserva'}
      </button>
    </div>
  );
}

/**
 * Cobro por transferencia a la llave del gimnasio.
 *
 * No hay pasarela que avise, así que el trato es explícito: aquí están los
 * datos, y cuando la persona dice que ya transfirió, recepción coteja contra la
 * notificación del banco y confirma. El puesto se lo lleva quien confirme
 * primero, así que la pantalla lo dice sin rodeos. La
 * pantalla se sigue refrescando sola, así que la confirmación aparece sin que
 * haya que recargar nada.
 */
function EsperandoTransferencia({ reserva, acento, datos, avisado }) {
  const [avisando, setAvisando] = useState(false);
  const [yaAviso, setYaAviso] = useState(avisado);
  const [error, setError] = useState(null);
  const [copiado, setCopiado] = useState(false);

  const minutos = reserva.expiraEn
    ? Math.max(0, Math.round((new Date(reserva.expiraEn).getTime() - Date.now()) / 60000))
    : null;

  const copiarLlave = async () => {
    try {
      await navigator.clipboard.writeText(datos.llave);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      // Sin permiso de portapapeles no pasa nada: la llave está a la vista.
    }
  };

  const avisar = async () => {
    setAvisando(true);
    setError(null);
    try {
      await api.avisarPago(reserva.codigo);
      setYaAviso(true);
    } catch (e) {
      setError(e.message);
    } finally {
      setAvisando(false);
    }
  };

  return (
    <div className="min-h-dvh px-5 py-10 max-w-sm mx-auto">
      <div className="text-center">
        <p className="etiqueta">Falta tu pago</p>
        <h1 className="mt-1 text-2xl font-extrabold tracking-tightest">
          {yaAviso ? 'Estamos verificando tu pago' : 'Transfiere para confirmar'}
        </h1>
        {/* El puesto NO queda apartado: se lo lleva quien pague primero. Decirlo
            claro es lo único honesto y además es lo que hace que transfieran ya. */}
        <p className="mt-2 text-sm text-humo-500">
          El puesto <span className="font-bold text-humo-100">{reserva.puestoCodigo}</span> queda
          tuyo cuando confirmemos el pago. Hasta entonces sigue disponible para otros
          {minutos !== null && minutos > 0 ? `, así que no te demores` : ''}.
        </p>
      </div>

      <div className="tarjeta mt-6 p-5 space-y-4">
        <div className="text-center">
          <p className="etiqueta">Monto exacto</p>
          <p className="text-3xl font-extrabold tracking-tightest">{pesos(reserva.montoCop)}</p>
        </div>

        {datos.qr && (
          <img
            src={datos.qr}
            alt="Código QR para transferir"
            className="mx-auto w-44 h-44 rounded-2xl bg-white p-2 object-contain"
          />
        )}

        <div>
          <p className="etiqueta mb-1.5">Llave</p>
          <button
            onClick={copiarLlave}
            className="w-full flex items-center justify-between gap-3 rounded-2xl bg-carbon-700 border border-carbon-600 px-4 py-3 text-left hover:border-carbon-500 transition-colors"
          >
            <span className="font-bold tracking-tight truncate">{datos.llave}</span>
            <span className="text-xs font-semibold shrink-0" style={{ color: acento }}>
              {copiado ? '¡Copiada!' : 'Copiar'}
            </span>
          </button>
          {(datos.titular || datos.entidad) && (
            <p className="mt-1.5 text-xs text-humo-500">
              {[datos.titular, datos.entidad].filter(Boolean).join(' · ')}
            </p>
          )}
        </div>

        <div>
          <p className="etiqueta mb-1.5">Pon esto en la descripción</p>
          <p className="rounded-2xl bg-carbon-700 border border-carbon-600 px-4 py-3 font-extrabold tracking-[0.2em] text-center">
            {reserva.codigo}
          </p>
        </div>
      </div>

      {error && (
        <div className="mt-4">
          <Aviso>{error}</Aviso>
        </div>
      )}

      <div className="mt-6">
        {yaAviso ? (
          <div className="rounded-2xl border border-carbon-600 bg-carbon-700/50 p-4 flex items-start gap-3">
            <span
              className="mt-0.5 w-5 h-5 shrink-0 rounded-full border-2 border-t-transparent animate-spin"
              style={{ borderColor: acento, borderTopColor: 'transparent' }}
            />
            <p className="text-sm text-humo-300">
              Recepción está verificando tu transferencia. Esta pantalla se actualiza sola; no
              tienes que hacer nada más.
            </p>
          </div>
        ) : (
          <Boton
            className="w-full"
            cargando={avisando}
            onClick={avisar}
            style={{ backgroundColor: acento }}
          >
            Ya transferí
          </Boton>
        )}

        <LiberarPuesto codigo={reserva.codigo} />
      </div>

      <p className="mt-6 text-xs text-humo-500 text-center">
        Si alguien alcanza a confirmar ese puesto antes que tú, en recepción te lo cambian o te
        devuelven el pago.
      </p>
    </div>
  );
}

/**
 * Pantalla intermedia mientras Wompi resuelve el pago.
 *
 * El puesto se confirma cuando entra el pago, no antes: si alguien más lo
 * confirma mientras tanto, recepción reubica o devuelve. Se ofrece volver a la
 * pasarela por si el cliente cerró la ventana sin pagar.
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
        El puesto <span className="font-bold text-humo-100">{reserva.puestoCodigo}</span> queda tuyo
        en cuanto entre el pago. Esta pantalla se actualiza sola.
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
        <LiberarPuesto codigo={reserva.codigo} />
      </div>

      <p className="mt-8 text-xs text-humo-500">
        Si ya pagaste, espera unos segundos: la confirmación llega sola. No cierres esta
        página.
      </p>
    </div>
  );
}

/**
 * Soltar el puesto escribiendo el nombre.
 *
 * SE PIDE EL NOMBRE, NO LA SESIÓN. Desde que el gimnasio dejó de pedir teléfono,
 * el nombre es lo único que se da al reservar; y como muchas reservas se hacen
 * en la tablet del mostrador, la sesión se queda en un aparato que no es el de
 * la persona. Sin esto no podía soltar su propio puesto.
 *
 * El nombre por sí solo no abre nada: hace falta estar en la página de ESTA
 * reserva, o sea tener su código.
 *
 * El plazo lo decide el servidor y aquí solo se anticipa para no ofrecer un
 * botón que va a fallar: pasado el límite se explica en vez de dejar intentarlo.
 */
function CancelarPuesto({ reserva }) {
  const navegar = useNavigate();
  const queryClient = useQueryClient();
  const [abierto, setAbierto] = useState(false);
  const [nombre, setNombre] = useState('');
  const [error, setError] = useState(null);
  const [cancelando, setCancelando] = useState(false);

  const { data: config } = useQuery({ queryKey: ['config'], queryFn: api.configuracion });
  const horas = config?.horasLimiteCancelacion ?? 8;
  const faltan = new Date(reserva.clase.inicioEn).getTime() - Date.now();
  const aTiempo = faltan > horas * 3600_000;

  const cancelar = async () => {
    setError(null);
    setCancelando(true);
    try {
      await api.cancelarReserva(reserva.codigo, nombre.trim());
      queryClient.invalidateQueries();
      navegar('/', { replace: true });
    } catch (e) {
      setError(e.message);
      setCancelando(false);
    }
  };

  if (!aTiempo) {
    return (
      <p className="pt-2 text-center text-xs text-humo-500">
        Ya no se puede cancelar por la app: el plazo son {horas} horas antes de la clase. Habla
        con recepción.
      </p>
    );
  }

  if (!abierto) {
    return (
      <button
        onClick={() => setAbierto(true)}
        className="w-full py-2 text-center text-sm text-humo-500 hover:text-alerta transition-colors"
      >
        Cancelar mi puesto
      </button>
    );
  }

  return (
    <div className="rounded-2xl border border-carbon-600 bg-carbon-700/50 p-4 space-y-3">
      <p className="text-sm">
        Escribe <strong>tu nombre</strong>, tal como reservaste, para soltar el puesto{' '}
        <strong>{reserva.puestoCodigo}</strong>.
      </p>

      <Campo etiqueta="Tu nombre">
        <Entrada
          autoFocus
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && nombre.trim().length >= 2 && cancelar()}
          placeholder="Nombre y apellido"
          autoComplete="name"
        />
      </Campo>

      {error && <Aviso>{error}</Aviso>}

      <div className="flex gap-2">
        <Boton
          variante="peligro"
          className="flex-1"
          disabled={nombre.trim().length < 2}
          cargando={cancelando}
          onClick={cancelar}
        >
          Sí, cancelar
        </Boton>
        <Boton
          variante="secundario"
          onClick={() => {
            setAbierto(false);
            setError(null);
          }}
        >
          Volver
        </Boton>
      </div>

      <p className="text-xs text-humo-500">
        Se puede hasta {horas} horas antes de la clase. Después hay que hablar con recepción.
      </p>
    </div>
  );
}
