import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client.js';
import { CabeceraAdmin } from './Layout.jsx';
import SalonClase, { useAccionesMostrador } from '../../components/SalonClase.jsx';
import {
  Aviso,
  BarraDisponibilidad,
  Cargando,
  Entrada,
  Insignia,
  Vacio,
  cx,
} from '../../components/ui.jsx';
import { IconoBuscar, IconoCheck } from '../../components/Iconos.jsx';
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
    return <SalonClase claseId={claseAbierta} onVolver={() => setClaseAbierta(null)} />;
  }
  return <VistaAgenda onAbrirClase={setClaseAbierta} />;
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

  const clases = agenda?.clases ?? [];
  // Cuando no hay nada en la próxima semana, el servidor manda las siguientes
  // que existan: hay que decir por qué se están viendo clases lejanas.
  const soloLejanas = agenda && !agenda.hayEnVentana && clases.length > 0;

  const { data: resultados, isFetching } = useQuery({
    queryKey: ['adminBuscar', q.trim()],
    queryFn: () => api.admin.buscar(q.trim()),
    enabled: buscando,
    placeholderData: (anterior) => anterior,
  });

  // Se agrupa por día para que se entienda dónde termina hoy y empieza mañana.
  const porDia = {};
  for (const clase of clases) (porDia[clase.fecha] ??= []).push(clase);

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
            {!isLoading && clases.length === 0 && (
              <Vacio
                titulo="No hay clases programadas"
                descripcion="Crea horarios desde la sección Clases."
              />
            )}

            {soloLejanas && (
              <Aviso tono="info">
                No hay clases en los próximos {agenda.dias} días. Estas son las siguientes que
                tienes programadas.
              </Aviso>
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
 * Ojo: el puesto NO está apartado mientras espera. Si alguien más lo confirma
 * primero, al intentar confirmar este pago el servidor avisa y hay que
 * reubicar o devolver.
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
  // Los que avisaron y los que quedaron en conflicto. Los que ni avisaron ni
  // pagaron no se muestran: se vencen solos y no hay nada que hacer con ellos.
  const avisaron = (data ?? []).filter((p) => p.avisoPagoEn || p.notasPago);

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

            {p.notasPago && (
              <p className="mt-2 rounded-xl bg-alerta/10 border border-alerta/30 px-3 py-2 text-xs text-alerta">
                {p.notasPago}
              </p>
            )}

            <div className="mt-3 flex items-center gap-2">
              <button
                disabled={acciones.guardando}
                onClick={() => acciones.confirmarTransferencia(p.id)}
                className="px-4 py-2.5 rounded-xl text-sm font-semibold bg-volt-500 text-carbon-900 hover:bg-volt-400 disabled:opacity-60 transition-colors inline-flex items-center gap-1.5"
              >
                <IconoCheck className="w-4 h-4" />
                Confirmar pago
              </button>
              <button
                disabled={acciones.guardando}
                onClick={() => {
                  if (window.confirm(`¿Liberar el puesto ${p.puestoCodigo} de ${p.usuario.nombre}?`))
                    acciones.liberar(p.id);
                }}
                className="px-3 py-2.5 rounded-xl text-sm font-semibold text-humo-500 hover:text-alerta disabled:opacity-60 transition-colors"
              >
                Liberar
              </button>
              <span className="text-xs text-humo-500">
                {p.avisoPagoEn ? `avisó ${textoDesde(p.avisoPagoEn)}` : 'pago recibido'}
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
