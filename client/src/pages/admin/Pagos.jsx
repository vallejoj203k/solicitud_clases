import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client.js';
import { CabeceraAdmin } from './Layout.jsx';
import { Aviso, Boton, Campo, Cargando, Chip, Entrada, Insignia, Vacio, cx } from '../../components/ui.jsx';
import { IconoDescargar } from '../../components/Iconos.jsx';
import { pesos, numero, hora12, hoyISO, sumarDiasISO, ETIQUETA_PAGO, ETIQUETA_METODO } from '../../lib/formato.js';

const RANGOS = [
  { texto: 'Hoy', calcular: () => ({ desde: hoyISO(), hasta: hoyISO() }) },
  { texto: 'Últimos 7 días', calcular: () => ({ desde: sumarDiasISO(hoyISO(), -6), hasta: hoyISO() }) },
  { texto: 'Este mes', calcular: () => ({ desde: `${hoyISO().slice(0, 7)}-01`, hasta: hoyISO() }) },
  { texto: 'Próximos 7 días', calcular: () => ({ desde: hoyISO(), hasta: sumarDiasISO(hoyISO(), 6) }) },
];

export default function AdminPagos() {
  const [filtros, setFiltros] = useState({ desde: hoyISO(), hasta: sumarDiasISO(hoyISO(), 6), tipo: '' });
  const [descargando, setDescargando] = useState(false);
  const [error, setError] = useState(null);

  const { data: tipos } = useQuery({ queryKey: ['adminTipos'], queryFn: api.admin.tiposClase });
  const { data, isLoading } = useQuery({
    queryKey: ['adminPagos', filtros],
    queryFn: () => api.admin.reportePagos({ ...filtros, tipo: filtros.tipo || undefined }),
  });

  const exportar = async () => {
    setDescargando(true);
    setError(null);
    try {
      await api.admin.descargarCsv({ ...filtros, tipo: filtros.tipo || undefined });
    } catch (e) {
      setError(e.message);
    } finally {
      setDescargando(false);
    }
  };

  return (
    <div>
      <CabeceraAdmin
        titulo="Pagos"
        descripcion="Quién pagó y quién no, por rango de fechas."
        acciones={
          <Boton
            variante="secundario"
            className="min-h-[44px] text-sm"
            cargando={descargando}
            onClick={exportar}
          >
            <IconoDescargar className="w-4 h-4" />
            Exportar CSV
          </Boton>
        }
      />

      <div className="px-5 md:px-8 pb-10 space-y-5">
        <div className="fila-scroll -mx-5 px-5 md:mx-0 md:px-0">
          {RANGOS.map((r) => {
            const valores = r.calcular();
            const activo = filtros.desde === valores.desde && filtros.hasta === valores.hasta;
            return (
              <Chip key={r.texto} activo={activo} onClick={() => setFiltros((f) => ({ ...f, ...valores }))}>
                {r.texto}
              </Chip>
            );
          })}
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <Campo etiqueta="Desde" className="w-[152px]">
            <Entrada
              type="date"
              value={filtros.desde}
              onChange={(e) => setFiltros((f) => ({ ...f, desde: e.target.value }))}
            />
          </Campo>
          <Campo etiqueta="Hasta" className="w-[152px]">
            <Entrada
              type="date"
              value={filtros.hasta}
              onChange={(e) => setFiltros((f) => ({ ...f, hasta: e.target.value }))}
            />
          </Campo>
          <div className="flex gap-2 pb-0.5">
            <Chip activo={filtros.tipo === ''} onClick={() => setFiltros((f) => ({ ...f, tipo: '' }))}>
              Todas
            </Chip>
            {(tipos ?? []).map((t) => (
              <Chip
                key={t.slug}
                activo={filtros.tipo === t.slug}
                onClick={() => setFiltros((f) => ({ ...f, tipo: t.slug }))}
              >
                {t.nombre}
              </Chip>
            ))}
          </div>
        </div>

        {error && <Aviso>{error}</Aviso>}
        {isLoading && <Cargando />}

        {data && (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <Total etiqueta="Reservas" valor={numero(data.totales.reservas)} />
              <Total
                etiqueta="Pagado"
                valor={pesos(data.totales.pagado.montoCop)}
                nota={`${data.totales.pagado.cantidad} personas`}
                tono="exito"
              />
              <Total
                etiqueta="Pendiente"
                valor={pesos(data.totales.pendiente.montoCop)}
                nota={`${data.totales.pendiente.cantidad} personas`}
                tono="aviso"
              />
              <Total etiqueta="Total facturado" valor={pesos(data.totales.montoTotalCop)} />
            </div>

            {data.filas.length === 0 ? (
              <Vacio titulo="Sin reservas en este rango" descripcion="Prueba con otras fechas." />
            ) : (
              <>
                {/* Tabla en escritorio */}
                <div className="hidden md:block tarjeta overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-carbon-800 text-humo-500">
                        <tr>
                          {['Fecha', 'Hora', 'Clase', 'Cliente', 'Asiste', 'Puesto', 'Estado', 'Método', 'Monto'].map(
                            (c) => (
                              <th key={c} className="text-left font-semibold px-4 py-3 whitespace-nowrap">
                                {c}
                              </th>
                            )
                          )}
                        </tr>
                      </thead>
                      <tbody>
                        {data.filas.map((f) => (
                          <tr key={f.id} className="border-t border-carbon-700">
                            <td className="px-4 py-3 whitespace-nowrap tabular-nums">{f.fecha}</td>
                            <td className="px-4 py-3 whitespace-nowrap tabular-nums">{hora12(f.hora)}</td>
                            <td className="px-4 py-3 whitespace-nowrap">{f.tipoClase}</td>
                            <td className="px-4 py-3">
                              <p className="truncate max-w-[180px]">{f.cliente}</p>
                              <p className="text-xs text-humo-500">{f.telefono}</p>
                            </td>
                            <td className="px-4 py-3">
                              <p className="truncate max-w-[160px]">{f.asiste}</p>
                            </td>
                            <td className="px-4 py-3 tabular-nums">{f.puesto}</td>
                            <td className="px-4 py-3">
                              <Insignia
                                tono={
                                  f.estadoPago === 'PAGADO'
                                    ? 'exito'
                                    : f.estadoPago === 'RECHAZADO'
                                      ? 'peligro'
                                      : 'aviso'
                                }
                              >
                                {ETIQUETA_PAGO[f.estadoPago]}
                              </Insignia>
                            </td>
                            <td className="px-4 py-3 text-humo-500">
                              {ETIQUETA_METODO[f.metodoPago] ?? '—'}
                            </td>
                            <td className="px-4 py-3 text-right tabular-nums whitespace-nowrap">
                              {pesos(f.montoCop)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Lista en móvil */}
                <ul className="md:hidden space-y-2">
                  {data.filas.map((f) => (
                    <li key={f.id} className="tarjeta p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-semibold truncate">{f.cliente}</p>
                          <p className="text-xs text-humo-500">
                            {f.tipoClase} · {f.fecha} {hora12(f.hora)} · Puesto {f.puesto}
                          </p>
                          {f.metodoPago && (
                            <p className="mt-1 text-xs text-humo-500">
                              {ETIQUETA_METODO[f.metodoPago] ?? f.metodoPago}
                            </p>
                          )}
                        </div>
                        <div className="text-right shrink-0">
                          <Insignia
                            tono={
                              f.estadoPago === 'PAGADO'
                                ? 'exito'
                                : f.estadoPago === 'RECHAZADO'
                                  ? 'peligro'
                                  : 'aviso'
                            }
                          >
                            {ETIQUETA_PAGO[f.estadoPago]}
                          </Insignia>
                          <p className="mt-1 text-xs tabular-nums text-humo-500">{pesos(f.montoCop)}</p>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Total({ etiqueta, valor, nota, tono = 'neutro' }) {
  const colores = { neutro: 'text-humo-100', exito: 'text-volt-500', aviso: 'text-amber-300' };
  return (
    <div className="tarjeta p-4">
      <p className="etiqueta">{etiqueta}</p>
      <p className={cx('mt-1.5 text-xl font-extrabold tracking-tightest tabular-nums', colores[tono])}>
        {valor}
      </p>
      {nota && <p className="mt-0.5 text-[11px] text-humo-500">{nota}</p>}
    </div>
  );
}
