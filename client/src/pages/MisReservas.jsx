import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client.js';
import { Aviso, Boton, Cargando, Insignia, Vacio, cx } from '../components/ui.jsx';
import { IconoAtras, IconoFlecha } from '../components/Iconos.jsx';
import { leerCliente, cerrarSesionCliente } from '../lib/sesion.js';
import { pesos, ETIQUETA_RESERVA } from '../lib/formato.js';

export default function MisReservas() {
  const cliente = leerCliente();
  const queryClient = useQueryClient();
  const [error, setError] = useState(null);

  const { data: reservas, isLoading } = useQuery({
    queryKey: ['misReservas'],
    queryFn: api.misReservas,
  });

  const { data: config } = useQuery({ queryKey: ['configuracion'], queryFn: api.configuracion });
  const horasLimite = config?.horasLimiteCancelacion ?? 2;

  const cancelar = useMutation({
    mutationFn: (codigo) => api.cancelarReserva(codigo),
    onSuccess: () => {
      setError(null);
      queryClient.invalidateQueries({ queryKey: ['misReservas'] });
      queryClient.invalidateQueries({ queryKey: ['inicio'] });
    },
    onError: (e) => setError(e.message),
  });

  const ahora = Date.now();
  const proximas = (reservas ?? []).filter(
    (r) => r.estado !== 'CANCELADA' && new Date(r.clase.inicioEn).getTime() > ahora
  );
  const pasadas = (reservas ?? []).filter(
    (r) => r.estado === 'CANCELADA' || new Date(r.clase.inicioEn).getTime() <= ahora
  );

  return (
    <div className="min-h-dvh pb-16">
      <header className="px-5 pt-6 pb-4 flex items-center gap-3">
        <Link
          to="/"
          aria-label="Volver"
          className="p-2 -ml-2 rounded-xl text-humo-300 hover:bg-carbon-700 active:scale-95"
        >
          <IconoAtras />
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-extrabold tracking-tightest">Mis reservas</h1>
          {cliente && <p className="text-xs text-humo-500 truncate">{cliente.nombre} · {cliente.telefono}</p>}
        </div>
      </header>

      <main className="px-5 space-y-6">
        {error && <Aviso>{error}</Aviso>}
        {isLoading && <Cargando />}

        {!isLoading && (reservas ?? []).length === 0 && (
          <Vacio
            titulo="Todavía no tienes reservas"
            descripcion="Cuando reserves un puesto lo verás aquí, con su código de ingreso."
            accion={
              <div className="space-y-3">
                <Link to="/" className="block">
                  <Boton className="w-full">
                    Ver clases
                    <IconoFlecha />
                  </Boton>
                </Link>
                <Link
                  to="/recuperar"
                  className="block text-xs text-humo-500 hover:text-humo-300 underline underline-offset-4"
                >
                  ¿Ya reservaste desde otro celular? Recupera tu reserva
                </Link>
              </div>
            }
          />
        )}

        {proximas.length > 0 && (
          <section>
            <p className="etiqueta mb-2.5">Próximas</p>
            <div className="space-y-3">
              {proximas.map((r) => (
                <Fila
                  key={r.id}
                  reserva={r}
                  horasLimite={horasLimite}
                  onCancelar={() => cancelar.mutate(r.codigo)}
                  cancelando={cancelar.isPending && cancelar.variables === r.codigo}
                />
              ))}
            </div>
          </section>
        )}

        {pasadas.length > 0 && (
          <section>
            <p className="etiqueta mb-2.5">Historial</p>
            <div className="space-y-3">
              {pasadas.map((r) => (
                <Fila key={r.id} reserva={r} historica />
              ))}
            </div>
          </section>
        )}

        {cliente && (
          <div className="pt-4 text-center">
            <button
              onClick={() => {
                cerrarSesionCliente();
                window.location.href = '/';
              }}
              className="text-xs text-humo-500 hover:text-humo-300 underline underline-offset-4"
            >
              No soy {cliente.nombre.split(' ')[0]} — usar otro teléfono
            </button>
            <p className="mt-3">
              <Link
                to="/recuperar"
                className="text-xs text-humo-500 hover:text-humo-300 underline underline-offset-4"
              >
                Recuperar una reserva hecha en otro celular
              </Link>
            </p>
          </div>
        )}
      </main>
    </div>
  );
}

function Fila({ reserva, onCancelar, cancelando, historica, horasLimite = 2 }) {
  const acento = reserva.clase.tipoClase.color;
  const cancelada = reserva.estado === 'CANCELADA';
  // El servidor manda el mismo límite; aquí solo se refleja para no ofrecer un
  // botón que va a fallar.
  const dentroDePlazo =
    new Date(reserva.clase.inicioEn).getTime() - horasLimite * 3600_000 > Date.now();

  return (
    <div className={cx('tarjeta p-4', (historica || cancelada) && 'opacity-70')}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="etiqueta" style={{ color: acento }}>
            {reserva.clase.tipoClase.nombre}
          </p>
          <p className="mt-0.5 font-bold tracking-tight first-letter:uppercase">{reserva.clase.etiqueta}</p>
          <p className="text-xs text-humo-500 mt-0.5">
            Puesto {reserva.puestoCodigo} · Código {reserva.codigo}
          </p>
        </div>
        <div className="text-right shrink-0 space-y-1.5">
          <Insignia
            tono={
              cancelada ? 'peligro' : reserva.estadoPago === 'PAGADO' ? 'exito' : 'aviso'
            }
          >
            {cancelada ? ETIQUETA_RESERVA[reserva.estado] : reserva.estadoPago === 'PAGADO' ? 'Pagado' : 'Pendiente'}
          </Insignia>
          <p className="text-xs text-humo-500">{pesos(reserva.montoCop)}</p>
        </div>
      </div>

      {!historica && !cancelada && (
        <div className="mt-4 flex gap-2">
          <Link to={`/reserva/${reserva.codigo}`} className="flex-1">
            <Boton variante="secundario" className="w-full min-h-[44px] text-sm">
              Ver código
            </Boton>
          </Link>
          {dentroDePlazo ? (
            <Boton
              variante="peligro"
              className="min-h-[44px] text-sm px-4"
              cargando={cancelando}
              onClick={onCancelar}
            >
              Cancelar
            </Boton>
          ) : (
            <span className="flex items-center px-3 text-[11px] text-humo-500 max-w-[9rem] leading-tight">
              Ya no se puede cancelar ({horasLimite}h antes)
            </span>
          )}
        </div>
      )}
    </div>
  );
}
