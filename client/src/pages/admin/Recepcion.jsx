import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client.js';
import { CabeceraAdmin } from './Layout.jsx';
import MapaPuestos from '../../components/MapaPuestos.jsx';
import {
  Aviso,
  BarraDisponibilidad,
  Cargando,
  Entrada,
  Hoja,
  Insignia,
  Vacio,
  cx,
} from '../../components/ui.jsx';
import { IconoAtras, IconoBuscar, IconoCheck, IconoReloj } from '../../components/Iconos.jsx';
import { pesos, hora12, fechaLarga, ETIQUETA_PAGO, ETIQUETA_RESERVA } from '../../lib/formato.js';

/**
 * Pantalla de mostrador.
 *
 * Dos vistas:
 *  1. Agenda — las clases de la más cercana a la más lejana. Es lo primero que
 *     necesita recepción: qué está por empezar.
 *  2. Salón — al abrir una clase se ve su mapa; tocando un puesto ocupado
 *     aparece quién lo reservó y se resuelve ahí mismo (asistencia y pago).
 *
 * La búsqueda por código/teléfono/nombre sigue arriba para quien llega con su QR.
 */
export default function AdminRecepcion() {
  const [claseAbierta, setClaseAbierta] = useState(null);

  if (claseAbierta) {
    return <VistaSalon claseId={claseAbierta} onVolver={() => setClaseAbierta(null)} />;
  }
  return <VistaAgenda onAbrirClase={setClaseAbierta} />;
}

/* --------------------------------------------------- Acciones de mostrador */

/**
 * Las dos acciones que recepción resuelve de pie: marcar asistencia y cobrar en
 * efectivo. Viven en un hook porque se usan desde los dos caminos —la ficha del
 * puesto y el resultado de búsqueda— y las dos tienen que invalidar lo mismo.
 */
function useAccionesMostrador(alActualizar) {
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

  return {
    error,
    limpiarError: () => setError(null),
    guardando: asistencia.isPending || pago.isPending,
    marcarAsistencia: (id) => asistencia.mutate({ id, asistio: true }),
    cobrarEfectivo: (id) => pago.mutate({ id, metodoPago: 'efectivo' }),
    // Confirmar una transferencia hace lo mismo que cobrar en efectivo, pero
    // además saca el puesto de "apartado" y lo deja reservado en firme: de eso
    // se encarga el servidor.
    confirmarTransferencia: (id) => pago.mutate({ id, metodoPago: 'transferencia' }),
  };
}

/* ------------------------------------------------------------------ Agenda */

function VistaAgenda({ onAbrirClase }) {
  const [q, setQ] = useState('');
  const buscando = q.trim().length >= 3;

  const { data: agenda, isLoading } = useQuery({
    queryKey: ['adminAgenda'],
    queryFn: () => api.admin.agenda(7),
    // El mostrador deja esta pantalla abierta todo el día.
    refetchInterval: 60_000,
  });

  const { data: resultados, isFetching } = useQuery({
    queryKey: ['adminBuscar', q.trim()],
    queryFn: () => api.admin.buscar(q.trim()),
    enabled: buscando,
    placeholderData: (anterior) => anterior,
  });

  // Se agrupa por día para que se entienda dónde termina hoy y empieza mañana.
  const porDia = {};
  for (const clase of agenda ?? []) (porDia[clase.fecha] ??= []).push(clase);

  return (
    <div>
      <CabeceraAdmin
        titulo="Recepción"
        descripcion="Las clases más cercanas primero. Abre una para ver el salón."
      />

      <div className="px-5 md:px-8 pb-10 space-y-5">
        <div className="relative">
          <IconoBuscar className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-humo-500 pointer-events-none" />
          <Entrada
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por código, teléfono o nombre"
            className="pl-12"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck="false"
          />
        </div>

        {buscando ? (
          <ResultadosBusqueda resultados={resultados} cargando={isFetching && !resultados} />
        ) : (
          <>
            <PagosPorConfirmar />

            {isLoading && <Cargando texto="Cargando la agenda…" />}
            {!isLoading && (agenda ?? []).length === 0 && (
              <Vacio
                titulo="No hay clases programadas"
                descripcion="Crea horarios desde la sección Clases."
              />
            )}

            {Object.entries(porDia).map(([fecha, clases]) => (
              <section key={fecha}>
                <p className="etiqueta mb-2 first-letter:uppercase">{fechaLarga(fecha)}</p>
                <ul className="space-y-2">
                  {clases.map((clase) => (
                    <li key={clase.id}>
                      <button
                        onClick={() => onAbrirClase(clase.id)}
                        className={cx(
                          'w-full text-left tarjeta p-4 transition-colors hover:border-carbon-500',
                          clase.enCurso && 'border-volt-500/50'
                        )}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span
                                className="w-2 h-2 rounded-full shrink-0"
                                style={{ backgroundColor: clase.tipoClase.color }}
                              />
                              <p className="font-bold tracking-tight">
                                {hora12(clase.hora)} · {clase.tipoClase.nombre}
                              </p>
                              {clase.enCurso && <Insignia tono="exito">En curso</Insignia>}
                            </div>
                            <p className="mt-0.5 text-xs text-humo-500 truncate">
                              {clase.instructor?.nombre ?? 'Sin instructor'}
                              {!clase.enCurso && clase.minutosParaEmpezar > 0 && (
                                <> · empieza en {textoEspera(clase.minutosParaEmpezar)}</>
                              )}
                            </p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-lg font-extrabold tabular-nums leading-none">
                              {clase.ocupados}
                              <span className="text-humo-500 font-normal">/{clase.capacidad}</span>
                            </p>
                            <p className="text-[11px] text-humo-500 mt-0.5">inscritos</p>
                          </div>
                        </div>
                        <BarraDisponibilidad
                          porcentaje={clase.porcentajeOcupacion}
                          agotada={clase.agotada}
                          className="mt-3"
                        />
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

/* --------------------------------------------------- Pagos por confirmar */

/**
 * Cola del cobro por transferencia: quienes ya transfirieron y esperan que
 * alguien coteje contra la notificación del banco.
 *
 * La regla del mostrador es cotejar contra la notificación que le llega al
 * celular del gimnasio, NO contra la captura que muestre el cliente: por eso la
 * tarjeta pone el monto y el código de la reserva en grande, que es lo que hay
 * que buscar en el movimiento.
 *
 * Si no hay nadie esperando, la sección no se dibuja: en modo pasarela o cobro
 * en recepción esta cola siempre está vacía y no debe estorbar.
 */
function PagosPorConfirmar() {
  const { data } = useQuery({
    queryKey: ['adminPagosPorConfirmar'],
    queryFn: api.admin.pagosPorConfirmar,
    // El cliente transfiere estando de pie en el mostrador: se refresca seguido.
    refetchInterval: 15_000,
  });

  const acciones = useAccionesMostrador();
  const avisaron = (data ?? []).filter((p) => p.avisoPagoEn);

  if (avisaron.length === 0) return null;

  return (
    <section className="rounded-3xl border border-volt-500/40 bg-volt-500/[0.06] p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="etiqueta text-volt-500">Pagos por confirmar</p>
        <span className="text-xs text-humo-500">Coteja con la notificación del banco</span>
      </div>

      {acciones.error && (
        <div className="mt-3">
          <Aviso>{acciones.error}</Aviso>
        </div>
      )}

      <ul className="mt-3 space-y-2">
        {avisaron.map((p) => (
          <li key={p.id} className="tarjeta p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-bold tracking-tight truncate">{p.usuario.nombre}</p>
                <p className="text-xs text-humo-500">
                  {p.usuario.telefono}
                  {p.nombreInvitado && ` · puesto para ${p.nombreInvitado}`}
                </p>
                <p className="mt-1.5 text-sm">
                  <span
                    className="inline-block w-2 h-2 rounded-full mr-2 align-middle"
                    style={{ backgroundColor: p.clase.color }}
                  />
                  {p.clase.tipoClase} · {hora12(p.clase.hora)} · Puesto {p.puestoCodigo}
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-xl font-extrabold tabular-nums leading-none">
                  {pesos(p.montoCop)}
                </p>
                <p className="mt-1 text-[11px] tracking-[0.16em] font-bold">{p.codigo}</p>
              </div>
            </div>

            <div className="mt-3 flex items-center gap-2">
              <button
                disabled={acciones.guardando}
                onClick={() => acciones.confirmarTransferencia(p.id)}
                className="px-4 py-2.5 rounded-xl text-sm font-semibold bg-volt-500 text-carbon-900 hover:bg-volt-400 disabled:opacity-60 transition-colors inline-flex items-center gap-1.5"
              >
                <IconoCheck className="w-4 h-4" />
                Confirmar pago
              </button>
              <span className="text-xs text-humo-500">
                avisó {textoDesde(p.avisoPagoEn)}
                {p.minutosRestantes !== null && ` · vence en ${p.minutosRestantes} min`}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** "hace 2 min" a partir de una fecha ISO. */
function textoDesde(iso) {
  const minutos = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (minutos < 1) return 'hace un momento';
  if (minutos < 60) return `hace ${minutos} min`;
  return `hace ${Math.floor(minutos / 60)} h`;
}

function textoEspera(minutos) {
  if (minutos < 60) return `${minutos} min`;
  const horas = Math.floor(minutos / 60);
  return horas < 24 ? `${horas} h` : `${Math.round(horas / 24)} días`;
}

/* ------------------------------------------------------------------- Salón */

function VistaSalon({ claseId, onVolver }) {
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

/* -------------------------------------------------------------- Búsqueda */

function ResultadosBusqueda({ resultados, cargando }) {
  // Quien llega con su QR se resuelve aquí mismo, sin abrir la clase.
  const acciones = useAccionesMostrador();

  if (cargando) return <Cargando texto="Buscando…" />;
  if ((resultados ?? []).length === 0) {
    return <Vacio titulo="Sin resultados" descripcion="Revisa el código o prueba con el nombre." />;
  }

  return (
    <ul className="space-y-2">
      {acciones.error && (
        <li>
          <Aviso>{acciones.error}</Aviso>
        </li>
      )}
      {resultados.map((r) => (
        <li key={r.id} className={cx('tarjeta p-4', r.yaPaso && 'opacity-60')}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-bold tracking-tight truncate">
                {r.nombreInvitado ?? r.usuario.nombre}
              </p>
              <p className="text-xs text-humo-500">
                {r.usuario.telefono}
                {r.nombreInvitado && ` · reservó ${r.usuario.nombre}`}
              </p>
              <p className="mt-1.5 text-sm">
                <span
                  className="inline-block w-2 h-2 rounded-full mr-2 align-middle"
                  style={{ backgroundColor: r.color }}
                />
                {r.tipoClase} · {hora12(r.hora)}
              </p>
              <p className="text-xs text-humo-500 first-letter:uppercase">
                {fechaLarga(r.fecha)}
                {r.yaPaso && ' · ya pasó'}
              </p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-2xl font-extrabold tabular-nums leading-none">{r.puestoCodigo}</p>
              <p className="text-[11px] text-humo-500 mt-0.5">{r.codigo}</p>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <Insignia
              tono={
                r.estado === 'CANCELADA'
                  ? 'peligro'
                  : r.estado === 'ASISTIO'
                    ? 'exito'
                    : r.estado === 'PENDIENTE_PAGO'
                      ? 'aviso'
                      : 'neutro'
              }
            >
              {ETIQUETA_RESERVA[r.estado] ?? r.estado}
            </Insignia>
            <Insignia
              tono={
                r.estadoPago === 'PAGADO'
                  ? 'exito'
                  : r.estadoPago === 'RECHAZADO'
                    ? 'peligro'
                    : 'aviso'
              }
            >
              {ETIQUETA_PAGO[r.estadoPago]} · {pesos(r.montoCop)}
            </Insignia>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            {/* Una reserva cancelada no se cobra ni se marca; y si está pagando
                en línea, el cobro lo cierra Wompi, no el mostrador. */}
            {r.estado !== 'CANCELADA' && r.estado !== 'PENDIENTE_PAGO' && (
              <>
                {r.estado !== 'ASISTIO' && (
                  <button
                    disabled={acciones.guardando}
                    onClick={() => acciones.marcarAsistencia(r.id)}
                    className="px-4 py-2.5 rounded-xl text-sm font-semibold bg-volt-500 text-carbon-900 hover:bg-volt-400 disabled:opacity-60 transition-colors inline-flex items-center gap-1.5"
                  >
                    <IconoCheck className="w-4 h-4" />
                    Marcar asistencia
                  </button>
                )}
                {r.estadoPago !== 'PAGADO' && (
                  <button
                    disabled={acciones.guardando}
                    onClick={() => acciones.cobrarEfectivo(r.id)}
                    className="px-4 py-2.5 rounded-xl text-sm font-semibold bg-carbon-600 hover:bg-carbon-500 disabled:opacity-60 transition-colors"
                  >
                    Cobrar en efectivo
                  </button>
                )}
              </>
            )}
            <Link
              to={`/admin/clases/${r.claseId}`}
              className="ml-auto text-xs font-semibold text-humo-500 hover:text-humo-100"
            >
              Ver la clase
            </Link>
          </div>
        </li>
      ))}
    </ul>
  );
}
