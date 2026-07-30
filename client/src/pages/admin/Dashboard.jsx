import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client.js';
import { CabeceraAdmin } from './Layout.jsx';
import { Aviso, BarraDisponibilidad, Cargando, cx } from '../../components/ui.jsx';
import { IconoAlerta, IconoFlecha } from '../../components/Iconos.jsx';
import { pesos, numero, hora12, fechaLarga } from '../../lib/formato.js';

export default function AdminDashboard() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['adminDashboard'],
    queryFn: api.admin.dashboard,
    refetchInterval: 60_000, // el mostrador lo deja abierto todo el día
  });

  if (isLoading) return <Cargando />;
  if (error) return <div className="p-5"><Aviso>{error.message}</Aviso></div>;

  return (
    <div>
      <CabeceraAdmin titulo="Resumen" descripcion={fechaLarga(data.hoy)} />

      <div className="px-5 md:px-8 space-y-6 pb-10">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Metrica etiqueta="Reservas de hoy" valor={numero(data.reservasHoy)} />
          <Metrica etiqueta="Clases de hoy" valor={numero(data.clasesHoy)} />
          <Metrica etiqueta="Cobrado hoy" valor={pesos(data.ingresosHoyCop)} tono="exito" />
          <Metrica
            etiqueta="Por cobrar"
            valor={pesos(data.pendientesPago.montoCop)}
            nota={`${data.pendientesPago.cantidad} reservas`}
            tono={data.pendientesPago.cantidad > 0 ? 'aviso' : 'neutro'}
          />
        </div>

        {data.alertas.length > 0 && (
          <section className="rounded-3xl border border-amber-400/30 bg-amber-400/[0.06] p-5">
            <div className="flex items-center gap-2 text-amber-300">
              <IconoAlerta className="w-4 h-4" />
              <h2 className="font-bold tracking-tight text-sm">
                {data.alertas.length} clase{data.alertas.length > 1 ? 's' : ''} con pocos cupos vendidos
              </h2>
            </div>
            <p className="mt-1 text-xs text-humo-500">
              Menos del 40% vendido y empiezan en las próximas 72 horas.
            </p>
            <ul className="mt-4 space-y-2">
              {data.alertas.map((a) => (
                <li key={a.claseId}>
                  <Link
                    to={`/admin/clases/${a.claseId}`}
                    className="flex items-center justify-between gap-3 rounded-2xl bg-carbon-700 border border-carbon-600 px-4 py-3 hover:border-carbon-500 transition-colors"
                  >
                    <div className="min-w-0">
                      <p className="font-semibold text-sm truncate">
                        {a.nombre} · {hora12(a.hora)}
                      </p>
                      <p className="text-xs text-humo-500">{fechaLarga(a.fecha)}</p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-sm font-bold tabular-nums text-amber-300">
                        {a.ocupados}/{a.capacidad}
                      </span>
                      <IconoFlecha className="w-4 h-4 text-humo-500" />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-bold tracking-tight">Próximas clases</h2>
            <Link to="/admin/clases" className="text-xs font-semibold text-volt-500 hover:underline">
              Ver todas
            </Link>
          </div>

          {data.proximas.length === 0 ? (
            <p className="text-sm text-humo-500">No hay clases programadas.</p>
          ) : (
            <ul className="space-y-2">
              {data.proximas.map((c) => (
                <li key={c.id}>
                  <Link
                    to={`/admin/clases/${c.id}`}
                    className="block tarjeta p-4 hover:border-carbon-500 transition-colors"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span
                            className="w-2 h-2 rounded-full shrink-0"
                            style={{ backgroundColor: c.tipoClase.color }}
                          />
                          <p className="font-semibold truncate">
                            {c.tipoClase.nombre} · {hora12(c.hora)}
                          </p>
                        </div>
                        <p className="mt-0.5 text-xs text-humo-500 truncate">
                          {fechaLarga(c.fecha)} · {c.instructor?.nombre ?? 'Sin instructor'}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-bold tabular-nums">
                          {c.ocupados}
                          <span className="text-humo-500 font-normal">/{c.capacidad}</span>
                        </p>
                        <p className="text-[11px] text-humo-500">{c.porcentajeOcupacion}%</p>
                      </div>
                    </div>
                    <BarraDisponibilidad
                      porcentaje={c.porcentajeOcupacion}
                      agotada={c.agotada}
                      className="mt-3"
                    />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function Metrica({ etiqueta, valor, nota, tono = 'neutro' }) {
  const colores = {
    neutro: 'text-humo-100',
    exito: 'text-volt-500',
    aviso: 'text-amber-300',
  };
  return (
    <div className="tarjeta p-4">
      <p className="etiqueta">{etiqueta}</p>
      <p className={cx('mt-1.5 text-2xl font-extrabold tracking-tightest tabular-nums', colores[tono])}>
        {valor}
      </p>
      {nota && <p className="mt-0.5 text-[11px] text-humo-500">{nota}</p>}
    </div>
  );
}
