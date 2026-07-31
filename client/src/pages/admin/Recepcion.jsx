import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client.js';
import { CabeceraAdmin } from './Layout.jsx';
import { Aviso, Cargando, Entrada, Insignia, Vacio, cx } from '../../components/ui.jsx';
import { IconoBuscar, IconoCheck } from '../../components/Iconos.jsx';
import { pesos, hora12, fechaLarga, ETIQUETA_PAGO, ETIQUETA_RESERVA } from '../../lib/formato.js';

/**
 * Pantalla de mostrador.
 *
 * Antes, para hacer check-in había que abrir la clase y buscar a la persona a
 * ojo en la lista. Aquí se busca por código, teléfono o nombre y se resuelve
 * todo desde el resultado: marcar asistencia y registrar el pago.
 */
export default function AdminRecepcion() {
  const queryClient = useQueryClient();
  const [q, setQ] = useState('');
  const [error, setError] = useState(null);

  const { data: resultados, isFetching } = useQuery({
    queryKey: ['adminBuscar', q.trim()],
    queryFn: () => api.admin.buscar(q.trim()),
    enabled: q.trim().length >= 3,
    placeholderData: (anterior) => anterior,
  });

  const refrescar = () => {
    queryClient.invalidateQueries({ queryKey: ['adminBuscar'] });
    queryClient.invalidateQueries({ queryKey: ['adminDashboard'] });
  };

  const asistencia = useMutation({
    mutationFn: ({ id, asistio }) => api.admin.marcarAsistencia(id, asistio),
    onSuccess: refrescar,
    onError: (e) => setError(e.message),
  });

  const pago = useMutation({
    mutationFn: (id) => api.admin.marcarPago(id, { estadoPago: 'PAGADO', metodoPago: 'efectivo' }),
    onSuccess: refrescar,
    onError: (e) => setError(e.message),
  });

  return (
    <div>
      <CabeceraAdmin
        titulo="Recepción"
        descripcion="Busca por código, teléfono o nombre para hacer el check-in."
      />

      <div className="px-5 md:px-8 pb-10 space-y-4">
        <div className="relative">
          <IconoBuscar className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-humo-500 pointer-events-none" />
          <Entrada
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setError(null);
            }}
            placeholder="K7QF2M, 300 123 4567 o Laura"
            className="pl-12 text-lg"
            autoFocus
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck="false"
          />
        </div>

        {error && <Aviso>{error}</Aviso>}

        {q.trim().length > 0 && q.trim().length < 3 && (
          <p className="text-sm text-humo-500 px-1">Escribe al menos 3 caracteres.</p>
        )}

        {isFetching && !resultados && <Cargando texto="Buscando…" />}

        {q.trim().length >= 3 && resultados?.length === 0 && (
          <Vacio
            titulo="Sin resultados"
            descripcion="Revisa el código o prueba con el nombre completo."
          />
        )}

        <ul className="space-y-2">
          {(resultados ?? []).map((r) => (
            <li
              key={r.id}
              className={cx('tarjeta p-4', (r.yaPaso || r.estado === 'CANCELADA') && 'opacity-60')}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-bold tracking-tight truncate">{r.usuario.nombre}</p>
                  <p className="text-xs text-humo-500">{r.usuario.telefono}</p>
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
                  <p className="text-2xl font-extrabold tabular-nums leading-none">
                    {r.puestoCodigo}
                  </p>
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
                        : 'neutro'
                  }
                >
                  {ETIQUETA_RESERVA[r.estado]}
                </Insignia>
                <Insignia
                  tono={
                    r.estadoPago === 'PAGADO' ? 'exito' : r.estadoPago === 'RECHAZADO' ? 'peligro' : 'aviso'
                  }
                >
                  {ETIQUETA_PAGO[r.estadoPago]} · {pesos(r.montoCop)}
                </Insignia>
              </div>

              {r.estado !== 'CANCELADA' && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {r.estado !== 'ASISTIO' && (
                    <button
                      onClick={() => asistencia.mutate({ id: r.id, asistio: true })}
                      className="px-4 py-2.5 rounded-xl text-sm font-semibold bg-volt-500 text-carbon-900 hover:bg-volt-400 transition-colors inline-flex items-center gap-1.5"
                    >
                      <IconoCheck className="w-4 h-4" />
                      Marcar asistencia
                    </button>
                  )}
                  {r.estadoPago !== 'PAGADO' && (
                    <button
                      onClick={() => pago.mutate(r.id)}
                      className="px-4 py-2.5 rounded-xl text-sm font-semibold bg-carbon-600 hover:bg-carbon-500 transition-colors"
                    >
                      Cobrar en efectivo
                    </button>
                  )}
                  <Link
                    to={`/admin/clases/${r.claseId}`}
                    className="px-4 py-2.5 rounded-xl text-sm font-semibold text-humo-500 hover:text-humo-100 transition-colors ml-auto"
                  >
                    Ver la clase
                  </Link>
                </div>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
