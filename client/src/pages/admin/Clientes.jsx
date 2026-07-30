import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client.js';
import { CabeceraAdmin } from './Layout.jsx';
import { Cargando, Entrada, Hoja, Insignia, Vacio } from '../../components/ui.jsx';
import { IconoBuscar } from '../../components/Iconos.jsx';
import { pesos, hora12, fechaLarga, ETIQUETA_PAGO, ETIQUETA_RESERVA } from '../../lib/formato.js';

export default function AdminClientes() {
  const [busqueda, setBusqueda] = useState('');
  const [abierto, setAbierto] = useState(null);

  const { data: clientes, isLoading } = useQuery({
    queryKey: ['adminClientes', busqueda],
    queryFn: () => api.admin.clientes(busqueda || undefined),
    placeholderData: (anterior) => anterior,
  });

  return (
    <div>
      <CabeceraAdmin titulo="Clientes" descripcion="Historial de quienes han reservado." />

      <div className="px-5 md:px-8 pb-10 space-y-4">
        <div className="relative">
          <IconoBuscar className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-humo-500 pointer-events-none" />
          <Entrada
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por nombre o teléfono"
            className="pl-12"
          />
        </div>

        {isLoading && <Cargando />}

        {!isLoading && (clientes ?? []).length === 0 && (
          <Vacio titulo="Sin clientes" descripcion="Aparecerán aquí en cuanto hagan su primera reserva." />
        )}

        <ul className="space-y-2">
          {(clientes ?? []).map((c) => (
            <li key={c.id}>
              <button
                onClick={() => setAbierto(c.id)}
                className="w-full text-left tarjeta p-4 hover:border-carbon-500 transition-colors"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold truncate">{c.nombre}</p>
                    <p className="text-xs text-humo-500">{c.telefono}</p>
                    {c.ultimaClase && (
                      <p className="mt-1 text-xs text-humo-500">
                        Última: {c.ultimaClase.nombre} · {c.ultimaClase.fecha} {hora12(c.ultimaClase.hora)}
                      </p>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-lg font-extrabold tabular-nums">{c.totalReservas}</p>
                    <p className="text-[11px] text-humo-500">clases</p>
                    {c.pendientesPago > 0 && (
                      <Insignia tono="aviso" className="mt-1">
                        {c.pendientesPago} sin pagar
                      </Insignia>
                    )}
                  </div>
                </div>
              </button>
            </li>
          ))}
        </ul>
      </div>

      {abierto && <HojaCliente id={abierto} onCerrar={() => setAbierto(null)} />}
    </div>
  );
}

function HojaCliente({ id, onCerrar }) {
  const { data: cliente, isLoading } = useQuery({
    queryKey: ['adminCliente', id],
    queryFn: () => api.admin.cliente(id),
  });

  return (
    <Hoja abierta onCerrar={onCerrar} titulo={cliente?.nombre ?? 'Cliente'}>
      {isLoading && <Cargando />}
      {cliente && (
        <div className="space-y-4">
          <div className="rounded-2xl bg-carbon-700 border border-carbon-600 p-4">
            <p className="text-sm text-humo-500">{cliente.telefono}</p>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div>
                <p className="etiqueta">Reservas</p>
                <p className="text-xl font-extrabold tabular-nums">
                  {cliente.reservas.filter((r) => r.estado !== 'CANCELADA').length}
                </p>
              </div>
              <div>
                <p className="etiqueta">Total pagado</p>
                <p className="text-xl font-extrabold tabular-nums text-volt-500">
                  {pesos(
                    cliente.reservas
                      .filter((r) => r.estadoPago === 'PAGADO' && r.estado !== 'CANCELADA')
                      .reduce((s, r) => s + r.montoCop, 0)
                  )}
                </p>
              </div>
            </div>
          </div>

          <div>
            <p className="etiqueta mb-2">Historial</p>
            <ul className="space-y-2">
              {cliente.reservas.map((r) => (
                <li
                  key={r.id}
                  className="flex items-center justify-between gap-3 rounded-2xl bg-carbon-700 border border-carbon-600 px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold truncate">
                      <span
                        className="inline-block w-2 h-2 rounded-full mr-2 align-middle"
                        style={{ backgroundColor: r.color }}
                      />
                      {r.tipoClase} · {hora12(r.hora)}
                    </p>
                    <p className="text-xs text-humo-500 first-letter:uppercase">
                      {fechaLarga(r.fecha)} · Puesto {r.puestoCodigo}
                    </p>
                  </div>
                  <Insignia
                    tono={
                      r.estado === 'CANCELADA'
                        ? 'peligro'
                        : r.estadoPago === 'PAGADO'
                          ? 'exito'
                          : 'aviso'
                    }
                  >
                    {r.estado === 'CANCELADA' ? ETIQUETA_RESERVA[r.estado] : ETIQUETA_PAGO[r.estadoPago]}
                  </Insignia>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </Hoja>
  );
}
