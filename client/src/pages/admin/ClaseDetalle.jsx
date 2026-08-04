import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client.js';
import {
  Aviso,
  BarraDisponibilidad,
  Boton,
  Cargando,
  Entrada,
  Hoja,
  Insignia,
  Seleccion,
  Vacio,
  cx,
} from '../../components/ui.jsx';
import MapaPuestos from '../../components/MapaPuestos.jsx';
import { IconoAtras, IconoCheck } from '../../components/Iconos.jsx';
import {
  pesos,
  hora12,
  fechaLarga,
  ETIQUETA_PAGO,
  ETIQUETA_RESERVA,
  ETIQUETA_METODO,
  METODOS_MANUALES,
} from '../../lib/formato.js';

export default function AdminClaseDetalle() {
  const { id } = useParams();
  const queryClient = useQueryClient();
  const [pagoAbierto, setPagoAbierto] = useState(null);
  // Id de la reserva cuyo nombre se está corrigiendo. Se edita de a una para no
  // dejar media docena de campos abiertos sin guardar.
  const [editando, setEditando] = useState(null);
  const [error, setError] = useState(null);

  const { data, isLoading } = useQuery({
    queryKey: ['adminClaseReservas', id],
    queryFn: () => api.admin.reservasDeClase(id),
  });

  const { data: disponibilidad } = useQuery({
    queryKey: ['disponibilidad', id],
    queryFn: () => api.disponibilidad(id),
  });

  const refrescar = () => {
    queryClient.invalidateQueries({ queryKey: ['adminClaseReservas', id] });
    queryClient.invalidateQueries({ queryKey: ['disponibilidad', id] });
    queryClient.invalidateQueries({ queryKey: ['adminDashboard'] });
  };

  const cancelarReserva = useMutation({
    mutationFn: (reservaId) => api.admin.cancelarReserva(reservaId),
    onSuccess: refrescar,
    onError: (e) => setError(e.message),
  });

  const marcarAsistencia = useMutation({
    mutationFn: ({ reservaId, asistio }) => api.admin.marcarAsistencia(reservaId, asistio),
    onSuccess: refrescar,
    onError: (e) => setError(e.message),
  });

  const cambiarAsistente = useMutation({
    mutationFn: ({ reservaId, nombre }) => api.admin.cambiarAsistente(reservaId, nombre),
    onSuccess: () => {
      setEditando(null);
      refrescar();
    },
    onError: (e) => setError(e.message),
  });

  if (isLoading) return <Cargando />;
  if (!data) return <Vacio titulo="Clase no encontrada" />;

  const { clase, cupos, reservas } = data;
  const activas = reservas.filter((r) => r.estado !== 'CANCELADA');
  const canceladas = reservas.filter((r) => r.estado === 'CANCELADA');
  const pendientes = activas.filter((r) => r.estadoPago === 'PENDIENTE');

  return (
    <div className="pb-10">
      <header className="px-5 md:px-8 pt-6 pb-4">
        <Link
          to="/admin/clases"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-humo-500 hover:text-humo-100"
        >
          <IconoAtras className="w-4 h-4" />
          Clases
        </Link>
        <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span
                className="w-2.5 h-2.5 rounded-full"
                style={{ backgroundColor: clase.tipoClase.color }}
              />
              <h1 className="text-2xl font-extrabold tracking-tightest">
                {clase.tipoClase.nombre} · {hora12(clase.hora)}
              </h1>
              {clase.estado === 'CANCELADA' && <Insignia tono="peligro">Cancelada</Insignia>}
            </div>
            <p className="mt-1 text-sm text-humo-500 first-letter:uppercase">
              {fechaLarga(clase.fecha)} · {clase.instructor?.nombre ?? 'Sin instructor'} ·{' '}
              {clase.duracionMin} min
            </p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-extrabold tracking-tightest tabular-nums">
              {cupos.ocupados}
              <span className="text-humo-500 font-normal">/{cupos.capacidad}</span>
            </p>
            <p className="text-xs text-humo-500">{cupos.porcentajeOcupacion}% ocupada</p>
          </div>
        </div>
        <BarraDisponibilidad
          porcentaje={cupos.porcentajeOcupacion}
          agotada={cupos.agotada}
          className="mt-4"
        />
      </header>

      <div className="px-5 md:px-8 space-y-6">
        {error && <Aviso>{error}</Aviso>}

        {pendientes.length > 0 && (
          <Aviso tono="info">
            {pendientes.length} de {activas.length} inscritos tienen el pago pendiente (
            {pesos(pendientes.reduce((s, r) => s + r.montoCop, 0))}).
          </Aviso>
        )}

        <div className="grid lg:grid-cols-[1fr_minmax(280px,380px)] gap-6 items-start">
          <section>
            <h2 className="font-bold tracking-tight mb-3">
              Inscritos <span className="text-humo-500 font-normal">({activas.length})</span>
            </h2>

            {activas.length === 0 ? (
              <Vacio titulo="Nadie se ha inscrito todavía" />
            ) : (
              <ul className="space-y-2">
                {activas.map((r) => (
                  <li key={r.id} className="tarjeta p-4">
                    <div className="flex items-start gap-3">
                      <span className="w-11 h-11 shrink-0 rounded-xl bg-carbon-600 flex items-center justify-center font-extrabold text-sm tabular-nums">
                        {r.puestoCodigo}
                      </span>
                      <div className="min-w-0 flex-1">
                        {editando === r.id ? (
                          <NombreDelPuesto
                            inicial={r.nombreInvitado ?? r.usuario.nombre}
                            guardando={cambiarAsistente.isPending}
                            onGuardar={(nombre) =>
                              cambiarAsistente.mutate({ reservaId: r.id, nombre })
                            }
                            onCancelar={() => setEditando(null)}
                          />
                        ) : (
                          <button
                            onClick={() => {
                              setError(null);
                              setEditando(r.id);
                            }}
                            title="Corregir de quién es este puesto"
                            className="group flex items-center gap-1.5 max-w-full text-left"
                          >
                            <span className="font-semibold truncate">
                              {r.nombreInvitado ?? r.usuario.nombre}
                            </span>
                            <span className="shrink-0 text-[11px] font-bold text-humo-500 group-hover:text-volt-500 transition-colors">
                              editar
                            </span>
                          </button>
                        )}
                        <p className="text-xs text-humo-500">
                          {r.nombreInvitado && `reservó ${r.usuario.nombre} · `}
                          {r.usuario.telefono} · {r.codigo}
                        </p>
                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                          <Insignia tono={r.estadoPago === 'PAGADO' ? 'exito' : r.estadoPago === 'RECHAZADO' ? 'peligro' : 'aviso'}>
                            {ETIQUETA_PAGO[r.estadoPago]}
                            {r.metodoPago ? ` · ${ETIQUETA_METODO[r.metodoPago] ?? r.metodoPago}` : ''}
                          </Insignia>
                          {r.estado !== 'CONFIRMADA' && (
                            <Insignia tono={r.estado === 'ASISTIO' ? 'exito' : 'neutro'}>
                              {ETIQUETA_RESERVA[r.estado]}
                            </Insignia>
                          )}
                          <span className="text-xs text-humo-500">{pesos(r.montoCop)}</span>
                        </div>
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        onClick={() => setPagoAbierto(r)}
                        className={cx(
                          'px-3 py-2 rounded-xl text-xs font-semibold transition-colors',
                          r.estadoPago === 'PAGADO'
                            ? 'bg-carbon-600 text-humo-300 hover:bg-carbon-500'
                            : 'bg-volt-500 text-carbon-900 hover:bg-volt-400'
                        )}
                      >
                        {r.estadoPago === 'PAGADO' ? 'Cambiar pago' : 'Marcar pago'}
                      </button>
                      <button
                        onClick={() => marcarAsistencia.mutate({ reservaId: r.id, asistio: true })}
                        className="px-3 py-2 rounded-xl text-xs font-semibold bg-carbon-600 hover:bg-carbon-500 transition-colors inline-flex items-center gap-1"
                      >
                        <IconoCheck className="w-3.5 h-3.5" />
                        Asistió
                      </button>
                      <button
                        onClick={() => {
                          if (window.confirm(`¿Cancelar la reserva de ${r.usuario.nombre}?`))
                            cancelarReserva.mutate(r.id);
                        }}
                        className="px-3 py-2 rounded-xl text-xs font-semibold text-alerta hover:bg-alerta/10 transition-colors ml-auto"
                      >
                        Cancelar
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {canceladas.length > 0 && (
              <details className="mt-4">
                <summary className="text-xs font-semibold text-humo-500 cursor-pointer hover:text-humo-300">
                  {canceladas.length} reserva{canceladas.length > 1 ? 's' : ''} cancelada
                  {canceladas.length > 1 ? 's' : ''}
                </summary>
                <ul className="mt-2 space-y-1.5">
                  {canceladas.map((r) => (
                    <li
                      key={r.id}
                      className="flex items-center justify-between gap-2 text-xs text-humo-500 px-3 py-2 rounded-xl bg-carbon-800"
                    >
                      <span className="truncate">
                        {r.puestoCodigo} · {r.usuario.nombre}
                      </span>
                      <span>{r.codigo}</span>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </section>

          {/* El mismo componente del cliente, aquí solo como vista del salón. */}
          <aside className="tarjeta p-5 order-first lg:order-last">
            <h2 className="font-bold tracking-tight mb-4">Mapa del salón</h2>
            {disponibilidad ? (
              <MapaPuestos mapa={disponibilidad.mapa} acento={clase.tipoClase.color} soloLectura />
            ) : (
              <Cargando />
            )}
          </aside>
        </div>
      </div>

      {pagoAbierto && (
        <HojaPago
          reserva={pagoAbierto}
          onCerrar={() => setPagoAbierto(null)}
          onGuardado={() => {
            setPagoAbierto(null);
            refrescar();
          }}
        />
      )}
    </div>
  );
}

function HojaPago({ reserva, onCerrar, onGuardado }) {
  const [estadoPago, setEstadoPago] = useState(
    reserva.estadoPago === 'PENDIENTE' ? 'PAGADO' : reserva.estadoPago
  );
  // Si la pagó la pasarela, el método que trae no está entre los manuales: el
  // selector arrancaría en blanco. Se cae a "efectivo", que es lo que se
  // registra cuando alguien cobra a mano.
  const [metodoPago, setMetodoPago] = useState(
    METODOS_MANUALES.includes(reserva.metodoPago) ? reserva.metodoPago : 'efectivo'
  );
  const [error, setError] = useState(null);

  const guardar = useMutation({
    mutationFn: () =>
      api.admin.marcarPago(reserva.id, {
        estadoPago,
        metodoPago: estadoPago === 'PAGADO' ? metodoPago : null,
      }),
    onSuccess: onGuardado,
    onError: (e) => setError(e.message),
  });

  return (
    <Hoja abierta onCerrar={onCerrar} titulo="Registrar pago">
      <div className="space-y-4">
        <div className="rounded-2xl bg-carbon-700 border border-carbon-600 p-4">
          <p className="font-semibold">{reserva.usuario.nombre}</p>
          <p className="text-xs text-humo-500">
            Puesto {reserva.puestoCodigo} · {reserva.codigo} · {pesos(reserva.montoCop)}
          </p>
        </div>

        <div>
          <span className="etiqueta block mb-2">Estado</span>
          <div className="grid grid-cols-3 gap-2">
            {['PAGADO', 'PENDIENTE', 'RECHAZADO'].map((estado) => (
              <button
                key={estado}
                onClick={() => setEstadoPago(estado)}
                className={cx(
                  'min-h-[48px] rounded-2xl text-sm font-semibold transition-colors border',
                  estadoPago === estado
                    ? 'bg-volt-500 border-volt-500 text-carbon-900'
                    : 'bg-carbon-700 border-carbon-600 text-humo-300'
                )}
              >
                {ETIQUETA_PAGO[estado]}
              </button>
            ))}
          </div>
        </div>

        {estadoPago === 'PAGADO' && (
          <div className="animate-aparecer">
            <span className="etiqueta block mb-1.5">Método</span>
            <Seleccion value={metodoPago} onChange={(e) => setMetodoPago(e.target.value)}>
              {Object.entries(ETIQUETA_METODO).map(([valor, texto]) => (
                <option key={valor} value={valor}>
                  {texto}
                </option>
              ))}
            </Seleccion>
          </div>
        )}

        {error && <Aviso>{error}</Aviso>}

        <div className="flex gap-2">
          <Boton variante="contorno" className="flex-1" onClick={onCerrar}>
            Cancelar
          </Boton>
          <Boton className="flex-1" cargando={guardar.isPending} onClick={() => guardar.mutate()}>
            Guardar
          </Boton>
        </div>
      </div>
    </Hoja>
  );
}

/**
 * Corregir de quién es un puesto.
 *
 * Existe por un caso muy concreto: cuando el gimnasio pasa a la app reservas
 * que tenía en papel y escribe el mismo teléfono de relleno para todas, todas
 * quedan bajo un mismo cliente y acaban mostrando el último nombre tecleado.
 * Los puestos y el orden están bien; lo único que hay que arreglar es esto.
 *
 * Guarda con Enter y cancela con Escape: son veinte puestos seguidos y pasar
 * por el ratón en cada uno sería el doble de trabajo.
 */
function NombreDelPuesto({ inicial, guardando, onGuardar, onCancelar }) {
  const [texto, setTexto] = useState(inicial);

  return (
    <div className="flex items-center gap-1.5">
      <Entrada
        value={texto}
        autoFocus
        onFocus={(e) => e.target.select()}
        onChange={(e) => setTexto(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onGuardar(texto);
          if (e.key === 'Escape') onCancelar();
        }}
        aria-label="Nombre de quien ocupa el puesto"
        className="h-9 py-0 text-sm"
      />
      <button
        onClick={() => onGuardar(texto)}
        disabled={guardando}
        className="shrink-0 px-2.5 h-9 rounded-xl bg-volt-500 text-carbon-900 text-xs font-bold disabled:opacity-40"
      >
        {guardando ? '…' : 'Guardar'}
      </button>
      <button
        onClick={onCancelar}
        className="shrink-0 px-2 h-9 rounded-xl text-xs font-semibold text-humo-500 hover:text-humo-100"
      >
        Cancelar
      </button>
    </div>
  );
}
