import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client.js';
import MapaPuestos from './MapaPuestos.jsx';
import { Aviso, BarraDisponibilidad, Cargando, Hoja, Insignia, Vacio } from './ui.jsx';
import { IconoAtras, IconoCheck, IconoReloj } from './Iconos.jsx';
import { pesos, hora12, fechaLarga, ETIQUETA_PAGO, ETIQUETA_RESERVA } from '../lib/formato.js';

/**
 * El salón de una clase, con quién ocupa cada puesto.
 *
 * Vive aquí y no en una pantalla porque lo usan dos: Recepción, para atender a
 * quien llega, y el calendario de Clases, para revisar un día cualquiera. Es la
 * misma vista y las mismas acciones en los dos sitios.
 */

/* --------------------------------------------------- Acciones de mostrador */

/**
 * Las dos acciones que recepción resuelve de pie: marcar asistencia y cobrar en
 * efectivo. Viven en un hook porque se usan desde los dos caminos —la ficha del
 * puesto y el resultado de búsqueda— y las dos tienen que invalidar lo mismo.
 */
export function useAccionesMostrador(alActualizar) {
  const queryClient = useQueryClient();
  const [error, setError] = useState(null);

  const refrescar = () => {
    for (const clave of [
      'adminMapa',
      'adminAgenda',
      'adminBuscar',
      'adminDashboard',
      'adminPagosPorConfirmar',
    ]) {
      queryClient.invalidateQueries({ queryKey: [clave] });
    }
  };

  const alTerminar = (actualizada) => {
    refrescar();
    alActualizar?.(actualizada);
  };

  const asistencia = useMutation({
    mutationFn: ({ id, asistio }) => api.admin.marcarAsistencia(id, asistio),
    onSuccess: alTerminar,
    onError: (e) => setError(e.message),
  });

  const pago = useMutation({
    mutationFn: ({ id, metodoPago }) =>
      api.admin.marcarPago(id, { estadoPago: 'PAGADO', metodoPago }),
    onSuccess: alTerminar,
    onError: (e) => setError(e.message),
  });

  const liberacion = useMutation({
    mutationFn: (id) => api.admin.cancelarReserva(id),
    onSuccess: alTerminar,
    onError: (e) => setError(e.message),
  });

  return {
    error,
    limpiarError: () => setError(null),
    guardando: asistencia.isPending || pago.isPending || liberacion.isPending,
    marcarAsistencia: (id) => asistencia.mutate({ id, asistio: true }),
    cobrarEfectivo: (id) => pago.mutate({ id, metodoPago: 'efectivo' }),
    // Confirmar una transferencia hace lo mismo que cobrar en efectivo, pero
    // además saca el puesto de "apartado" y lo deja reservado en firme: de eso
    // se encarga el servidor.
    confirmarTransferencia: (id) => pago.mutate({ id, metodoPago: 'transferencia' }),
    // Cuando la persona dice en el mostrador que al final no va a pagar, el
    // puesto no tiene por qué esperar a que se venza el plazo.
    liberar: (id) => liberacion.mutate(id),
  };
}

/* ------------------------------------------------------------------- Salón */

export default function SalonClase({ claseId, onVolver }) {
  const [puestoAbierto, setPuestoAbierto] = useState(null);

  const { data, isLoading } = useQuery({
    queryKey: ['adminMapa', claseId],
    queryFn: () => api.admin.mapaClase(claseId),
    refetchInterval: 30_000,
  });

  // La ficha queda abierta después de actuar, así que se actualiza en el acto
  // en vez de esperar a que vuelva el mapa.
  const acciones = useAccionesMostrador((actualizada) =>
    setPuestoAbierto((p) =>
      p
        ? {
            ...p,
            reserva: {
              ...p.reserva,
              estado: actualizada.estado,
              estadoPago: actualizada.estadoPago,
            },
          }
        : p
    )
  );

  if (isLoading) return <Cargando texto="Cargando el salón…" />;
  if (!data) return <Vacio titulo="Clase no encontrada" />;

  const { clase, cupos, mapa } = data;

  return (
    // En tablet horizontal los datos de la clase se van a una columna y el salón
    // a la otra: así el mapa completo cabe en la pantalla sin desplazar.
    <div className="pb-10 md:landscape:pb-6 md:landscape:flex md:landscape:items-start md:landscape:gap-6 md:landscape:px-8 md:landscape:pt-4">
      <header className="px-5 md:px-8 pt-6 pb-4 md:landscape:px-0 md:landscape:pt-0 md:landscape:w-[280px] md:landscape:shrink-0">
        <button
          onClick={onVolver}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-humo-500 hover:text-humo-100"
        >
          <IconoAtras className="w-4 h-4" />
          Todas las clases
        </button>

        <div className="mt-3 flex flex-wrap items-start justify-between gap-3 md:landscape:block">
          <div>
            <div className="flex items-center gap-2">
              <span
                className="w-2.5 h-2.5 rounded-full"
                style={{ backgroundColor: clase.tipoClase.color }}
              />
              <h1 className="text-2xl font-extrabold tracking-tightest">
                {clase.tipoClase.nombre} · {hora12(clase.hora)}
              </h1>
            </div>
            <p className="mt-1 text-sm text-humo-500 first-letter:uppercase">
              {fechaLarga(clase.fecha)} · {clase.instructor?.nombre ?? 'Sin instructor'}
            </p>
          </div>
          <div className="text-right md:landscape:text-left md:landscape:mt-4">
            <p className="text-2xl font-extrabold tracking-tightest tabular-nums">
              {cupos.ocupados}
              <span className="text-humo-500 font-normal">/{cupos.capacidad}</span>
            </p>
            <p className="text-xs text-humo-500">inscritos</p>
          </div>
        </div>
        <BarraDisponibilidad
          porcentaje={cupos.porcentajeOcupacion}
          agotada={cupos.agotada}
          className="mt-4"
        />
      </header>

      <div className="px-5 md:px-8 space-y-5 md:landscape:px-0 md:landscape:flex-1 md:landscape:min-w-0 md:landscape:space-y-3">
        {acciones.error && <Aviso>{acciones.error}</Aviso>}

        <p className="text-sm text-humo-500">
          Toca un puesto ocupado para ver quién lo reservó.
        </p>

        <div className="tarjeta p-5 max-w-md md:landscape:max-w-none md:landscape:py-4">
          <MapaPuestos
            mapa={mapa}
            soloLectura
            alTocarOcupado={(puesto) => {
              acciones.limpiarError();
              setPuestoAbierto(puesto);
            }}
          />
        </div>
      </div>

      {puestoAbierto && (
        <FichaPuesto
          puesto={puestoAbierto}
          acento={clase.tipoClase.color}
          onCerrar={() => setPuestoAbierto(null)}
          onAsistio={() => acciones.marcarAsistencia(puestoAbierto.reserva.id)}
          onCobrar={() => acciones.cobrarEfectivo(puestoAbierto.reserva.id)}
          guardando={acciones.guardando}
        />
      )}
    </div>
  );
}

/**
 * Ficha del puesto. Se abre con animación (sube desde abajo en móvil, crece
 * desde el centro en escritorio) y el nombre entra escalonado detrás.
 */
function FichaPuesto({ puesto, acento, onCerrar, onAsistio, onCobrar, guardando }) {
  const r = puesto.reserva;
  if (!r) return null;

  return (
    <Hoja abierta onCerrar={onCerrar} titulo={`Puesto ${puesto.codigo}`}>
      <div className="space-y-5">
        <div className="flex items-center gap-4 animate-aparecer">
          <span
            className="w-16 h-16 shrink-0 rounded-2xl flex items-center justify-center text-xl font-extrabold tabular-nums"
            style={{ backgroundColor: acento, color: '#0F1115' }}
          >
            {puesto.codigo}
          </span>
          <div className="min-w-0">
            <p className="etiqueta">{r.nombreInvitado ? 'Asiste' : 'Reservado por'}</p>
            <p className="text-2xl font-extrabold tracking-tightest truncate">
              {r.nombreInvitado ?? r.usuario.nombre}
            </p>
            {/* Cuando el puesto es para un acompañante, el teléfono sigue siendo
                el de quien reservó: es a quien hay que llamar. */}
            {r.nombreInvitado && (
              <p className="text-xs text-humo-500 truncate">reservó {r.usuario.nombre}</p>
            )}
            <a
              href={`tel:${r.usuario.telefono}`}
              className="text-sm text-humo-500 hover:text-humo-100"
            >
              {r.usuario.telefono}
            </a>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <Insignia tono={r.estado === 'ASISTIO' ? 'exito' : r.estado === 'PENDIENTE_PAGO' ? 'aviso' : 'neutro'}>
            {ETIQUETA_RESERVA[r.estado] ?? r.estado}
          </Insignia>
          <Insignia
            tono={r.estadoPago === 'PAGADO' ? 'exito' : r.estadoPago === 'RECHAZADO' ? 'peligro' : 'aviso'}
          >
            {ETIQUETA_PAGO[r.estadoPago]} · {pesos(r.montoCop)}
          </Insignia>
          <Insignia>{r.codigo}</Insignia>
        </div>

        {r.estado === 'PENDIENTE_PAGO' && (
          <Aviso tono="info">
            Todavía está pagando en línea. El puesto le queda apartado hasta que se confirme.
          </Aviso>
        )}

        <div className="space-y-2">
          {r.estado !== 'ASISTIO' && r.estado !== 'PENDIENTE_PAGO' && (
            <button
              disabled={guardando}
              onClick={onAsistio}
              className="w-full min-h-[52px] rounded-2xl font-semibold bg-volt-500 text-carbon-900 hover:bg-volt-400 disabled:opacity-60 transition-colors inline-flex items-center justify-center gap-2"
            >
              <IconoCheck className="w-5 h-5" />
              Marcar asistencia
            </button>
          )}
          {r.estadoPago !== 'PAGADO' && r.estado !== 'PENDIENTE_PAGO' && (
            <button
              disabled={guardando}
              onClick={onCobrar}
              className="w-full min-h-[52px] rounded-2xl font-semibold bg-carbon-600 hover:bg-carbon-500 disabled:opacity-60 transition-colors"
            >
              Cobrar {pesos(r.montoCop)} en efectivo
            </button>
          )}
        </div>

        <p className="flex items-center gap-1.5 text-xs text-humo-500">
          <IconoReloj className="w-3.5 h-3.5" />
          Reservó el {new Date(r.creadoEn).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' })}
        </p>
      </div>
    </Hoja>
  );
}
