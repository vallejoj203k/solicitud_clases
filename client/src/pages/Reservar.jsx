import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../api/client.js';
import { guardarCliente, guardarToken, leerCliente } from '../lib/sesion.js';
import { hoyISO, sumarDiasISO, hora12, fechaLarga, pesos } from '../lib/formato.js';
import CarruselDias from '../components/CarruselDias.jsx';
import TarjetaHorario from '../components/TarjetaHorario.jsx';
import MapaPuestos from '../components/MapaPuestos.jsx';
import FondoDisciplina from '../components/FondoDisciplina.jsx';
import {
  Aviso,
  Boton,
  Campo,
  Cargando,
  Entrada,
  Hoja,
  Vacio,
  cx,
} from '../components/ui.jsx';
import { IconoAtras, IconoCheck, IconoReloj, IconoUsuario } from '../components/Iconos.jsx';

/**
 * Flujo de reserva completo en una sola pantalla, con dos pasos visibles
 * (horario → puesto) y la confirmación como hoja inferior. Desde la pantalla
 * principal son 3 toques; entrando por la disciplina, 4.
 */
export default function Reservar() {
  const { slug } = useParams();
  const [params, setParams] = useSearchParams();
  const navegar = useNavigate();
  const queryClient = useQueryClient();

  const claseIdUrl = params.get('clase');
  const [dia, setDia] = useState(hoyISO());
  const [claseId, setClaseId] = useState(claseIdUrl);
  const [puesto, setPuesto] = useState(null);
  const [confirmando, setConfirmando] = useState(false);
  const [errorReserva, setErrorReserva] = useState(null);

  const cliente = leerCliente();
  const [nombre, setNombre] = useState(cliente?.nombre ?? '');
  const [telefono, setTelefono] = useState(cliente?.telefono ?? '');
  const [email, setEmail] = useState('');
  const [aceptaDatos, setAceptaDatos] = useState(false);

  const desde = hoyISO();
  const hasta = sumarDiasISO(desde, 6);

  const { data, isLoading } = useQuery({
    queryKey: ['clases', slug, desde],
    queryFn: () => api.clases({ tipo: slug, desde, hasta }),
    staleTime: 20_000,
  });

  const clasesPorDia = useMemo(() => {
    const mapa = {};
    for (const clase of data?.clases ?? []) {
      (mapa[clase.fecha] ??= []).push(clase);
    }
    return mapa;
  }, [data]);

  const conteoPorDia = useMemo(
    () => Object.fromEntries(Object.entries(clasesPorDia).map(([f, c]) => [f, c.length])),
    [clasesPorDia]
  );

  // Si el día de hoy ya no tiene clases, saltamos al primero que sí tenga.
  useEffect(() => {
    if (!data || claseId) return;
    if ((clasesPorDia[dia] ?? []).length > 0) return;
    const primero = data.dias.find((d) => (clasesPorDia[d.fecha] ?? []).length > 0);
    if (primero) setDia(primero.fecha);
  }, [data, clasesPorDia, dia, claseId]);

  const disponibilidad = useQuery({
    queryKey: ['disponibilidad', claseId],
    queryFn: () => api.disponibilidad(claseId),
    enabled: Boolean(claseId),
    // Al volver a la pestaña se refresca: los puestos cambian mientras se decide.
    refetchOnWindowFocus: true,
    staleTime: 5_000,
  });

  const reservar = useMutation({
    mutationFn: () =>
      api.crearReserva({
        claseId,
        puestoCodigo: puesto,
        ...(cliente
          ? {}
          : {
              nombre: nombre.trim(),
              telefono: telefono.trim(),
              email: email.trim() || undefined,
              aceptaDatos,
            }),
      }),
    onSuccess: ({ reserva, token, cliente: perfil }) => {
      guardarToken('cliente', token);
      guardarCliente(perfil);
      queryClient.invalidateQueries({ queryKey: ['inicio'] });
      navegar(`/reserva/${reserva.codigo}?nueva=1`, { replace: true });
    },
    onError: (err) => {
      setErrorReserva(err);
      if (err instanceof ApiError && ['PUESTO_OCUPADO', 'PUESTO_BLOQUEADO'].includes(err.codigo)) {
        // Alguien se adelantó: cerramos la hoja y refrescamos el mapa para que
        // vea el puesto ya tomado en vez de un error abstracto.
        setPuesto(null);
        setConfirmando(false);
        disponibilidad.refetch();
      }
    },
  });

  const elegirClase = (clase) => {
    setClaseId(clase.id);
    setPuesto(null);
    setErrorReserva(null);
    setParams({ clase: clase.id }, { replace: true });
  };

  const volverAHorarios = () => {
    setClaseId(null);
    setPuesto(null);
    setErrorReserva(null);
    setParams({}, { replace: true });
  };

  const claseActual = disponibilidad.data?.clase;
  const acento = claseActual?.tipoClase.color ?? '#C8F751';
  const enPasoPuesto = Boolean(claseId);

  return (
    <div className="relative min-h-dvh pb-40">
      {/* La foto sale de la disciplina de la URL, así aparece de una vez aunque
          los datos de la clase todavía estén cargando. */}
      <FondoDisciplina slug={slug} />

      <header className="sticky top-0 z-30 bg-carbon-900/70 backdrop-blur-md border-b border-carbon-700/60">
        <div className="px-5 py-3 flex items-center gap-3">
          {enPasoPuesto ? (
            <button
              onClick={volverAHorarios}
              aria-label="Volver a los horarios"
              className="p-2 -ml-2 rounded-xl text-humo-300 hover:bg-carbon-700 active:scale-95"
            >
              <IconoAtras />
            </button>
          ) : (
            <Link
              to="/"
              aria-label="Volver al inicio"
              className="p-2 -ml-2 rounded-xl text-humo-300 hover:bg-carbon-700 active:scale-95"
            >
              <IconoAtras />
            </Link>
          )}
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-extrabold tracking-tightest truncate capitalize">
              {claseActual?.tipoClase.nombre ?? slug}
            </h1>
            <p className="text-xs text-humo-500 truncate">
              {enPasoPuesto && claseActual
                ? `${fechaLarga(claseActual.fecha)} · ${hora12(claseActual.hora)}`
                : 'Elige tu horario'}
            </p>
          </div>
          <Pasos actual={enPasoPuesto ? 2 : 1} acento={acento} />
        </div>
      </header>

      {!enPasoPuesto ? (
        <PasoHorarios
          isLoading={isLoading}
          dias={data?.dias ?? []}
          conteoPorDia={conteoPorDia}
          dia={dia}
          setDia={setDia}
          clases={clasesPorDia[dia] ?? []}
          onElegir={elegirClase}
        />
      ) : (
        <PasoPuestos
          consulta={disponibilidad}
          puesto={puesto}
          setPuesto={(codigo) => {
            setPuesto(codigo);
            setErrorReserva(null);
          }}
          acento={acento}
        />
      )}

      {errorReserva && !confirmando && (
        <div className="fixed bottom-28 left-0 right-0 px-5 z-40">
          <Aviso>{errorReserva.message}</Aviso>
        </div>
      )}

      {/* CTA fijo en la zona del pulgar. */}
      {enPasoPuesto && claseActual && (
        <div className="fixed bottom-0 left-0 right-0 z-30 bg-gradient-to-t from-carbon-900 via-carbon-900/95 to-transparent px-5 pt-8 pb-segura">
          <div className="mx-auto max-w-lg">
            <Boton
              className="w-full"
              disabled={!puesto}
              onClick={() => {
                setErrorReserva(null);
                setConfirmando(true);
              }}
              style={puesto ? { backgroundColor: acento } : undefined}
            >
              {puesto ? `Continuar con el puesto ${puesto}` : 'Elige tu puesto'}
              {puesto && <IconoCheck />}
            </Boton>
          </div>
        </div>
      )}

      <HojaConfirmacion
        abierta={confirmando}
        onCerrar={() => setConfirmando(false)}
        clase={claseActual}
        puesto={puesto}
        cliente={cliente}
        nombre={nombre}
        setNombre={setNombre}
        telefono={telefono}
        setTelefono={setTelefono}
        email={email}
        setEmail={setEmail}
        aceptaDatos={aceptaDatos}
        setAceptaDatos={setAceptaDatos}
        error={errorReserva}
        cargando={reservar.isPending}
        onConfirmar={() => {
          setErrorReserva(null);
          reservar.mutate();
        }}
        acento={acento}
      />
    </div>
  );
}

function Pasos({ actual, acento }) {
  return (
    <div className="flex items-center gap-1.5 shrink-0" aria-label={`Paso ${actual} de 2`}>
      {[1, 2].map((n) => (
        <span
          key={n}
          className={cx('h-1.5 rounded-full transition-all', n === actual ? 'w-6' : 'w-1.5 bg-carbon-600')}
          style={n === actual ? { backgroundColor: acento } : undefined}
        />
      ))}
    </div>
  );
}

function PasoHorarios({ isLoading, dias, conteoPorDia, dia, setDia, clases, onElegir }) {
  return (
    <div className="px-5 pt-4 animate-aparecer">
      <CarruselDias dias={dias} seleccionado={dia} onSeleccionar={setDia} conteoPorDia={conteoPorDia} />

      <div className="mt-6 space-y-3">
        {isLoading && <Cargando />}
        {!isLoading && clases.length === 0 && (
          <Vacio
            titulo="No hay clases este día"
            descripcion="Elige otra fecha en el calendario de arriba."
          />
        )}
        {clases.map((clase) => (
          <TarjetaHorario key={clase.id} clase={clase} onSeleccionar={onElegir} />
        ))}
      </div>
    </div>
  );
}

function PasoPuestos({ consulta, puesto, setPuesto, acento }) {
  if (consulta.isLoading) return <Cargando texto="Cargando el salón…" />;
  if (consulta.error) return <div className="px-5 pt-6"><Aviso>No pudimos cargar los puestos.</Aviso></div>;

  const { clase, mapa } = consulta.data;

  return (
    <div className="px-5 pt-5 animate-aparecer">
      <div className="flex items-center justify-between gap-3 mb-5">
        <p className="text-sm text-humo-500">
          {clase.disponibles > 0 ? (
            <>
              Quedan <span className="font-bold text-humo-100">{clase.disponibles}</span> de {clase.capacidad} puestos
            </>
          ) : (
            'Esta clase está llena'
          )}
        </p>
        <span className="text-sm font-semibold" style={{ color: acento }}>
          {pesos(clase.precioCop)}
        </span>
      </div>

      <MapaPuestos mapa={mapa} seleccionado={puesto} onSeleccionar={setPuesto} acento={acento} />
    </div>
  );
}

function HojaConfirmacion({
  abierta,
  onCerrar,
  clase,
  puesto,
  cliente,
  nombre,
  setNombre,
  telefono,
  setTelefono,
  email,
  setEmail,
  aceptaDatos,
  setAceptaDatos,
  error,
  cargando,
  onConfirmar,
  acento,
}) {
  if (!clase) return null;

  const datosCompletos =
    cliente ||
    (nombre.trim().length >= 2 && telefono.replace(/\D/g, '').length >= 7 && aceptaDatos);

  return (
    <Hoja abierta={abierta} onCerrar={onCerrar} titulo="Confirma tu reserva">
      <div className="space-y-4">
        <div className="rounded-2xl bg-carbon-700 border border-carbon-600 p-4 space-y-3">
          <Linea etiqueta="Clase" valor={clase.tipoClase.nombre} destacado />
          <Linea etiqueta="Día" valor={fechaLarga(clase.fecha)} />
          <Linea
            etiqueta="Hora"
            valor={`${hora12(clase.hora)} · ${clase.duracionMin} min`}
            icono={<IconoReloj className="w-4 h-4" />}
          />
          <Linea etiqueta="Instructor" valor={clase.instructor?.nombre ?? 'Por asignar'} />
          <div className="flex items-center justify-between pt-3 border-t border-carbon-600">
            <span className="etiqueta">Tu puesto</span>
            <span
              className="px-3 py-1.5 rounded-xl font-extrabold text-carbon-900 tabular-nums"
              style={{ backgroundColor: acento }}
            >
              {puesto}
            </span>
          </div>
        </div>

        {/* El formulario solo aparece la primera vez. Después el dispositivo ya
            tiene la sesión del cliente y se salta este bloque completo. */}
        {cliente ? (
          <div className="flex items-center gap-3 rounded-2xl bg-carbon-700/60 border border-carbon-600 px-4 py-3">
            <span className="p-2 rounded-xl bg-carbon-600 text-humo-300">
              <IconoUsuario className="w-4 h-4" />
            </span>
            <div className="min-w-0">
              <p className="font-semibold truncate">{cliente.nombre}</p>
              <p className="text-xs text-humo-500">{cliente.telefono}</p>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <Campo etiqueta="Tu nombre">
              <Entrada
                autoFocus
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="Nombre y apellido"
                autoComplete="name"
              />
            </Campo>
            <Campo etiqueta="Teléfono" ayuda="Con él recuperas tu reserva si cambias de celular.">
              <Entrada
                value={telefono}
                onChange={(e) => setTelefono(e.target.value)}
                placeholder="300 123 4567"
                inputMode="tel"
                autoComplete="tel"
              />
            </Campo>
            <Campo etiqueta="Correo (opcional)" ayuda="Te enviamos la confirmación y el recordatorio.">
              <Entrada
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tucorreo@ejemplo.com"
                type="email"
                inputMode="email"
                autoComplete="email"
              />
            </Campo>

            {/* Ley 1581 de 2012: la autorización tiene que ser explícita, por eso
                la casilla arranca desmarcada y el botón no se habilita sin ella. */}
            <label className="flex items-start gap-3 rounded-2xl bg-carbon-700/60 border border-carbon-600 p-4 cursor-pointer">
              <input
                type="checkbox"
                checked={aceptaDatos}
                onChange={(e) => setAceptaDatos(e.target.checked)}
                className="mt-0.5 w-5 h-5 shrink-0 rounded accent-volt-500"
              />
              <span className="text-xs text-humo-300 leading-relaxed">
                Autorizo el tratamiento de mis datos personales para gestionar mis reservas,
                según la{' '}
                <Link
                  to="/privacidad"
                  target="_blank"
                  className="text-volt-500 underline underline-offset-2"
                  onClick={(e) => e.stopPropagation()}
                >
                  política de privacidad
                </Link>
                .
              </span>
            </label>
          </div>
        )}

        <div className="flex items-center justify-between px-1">
          <span className="text-sm text-humo-500">Total a pagar</span>
          <span className="text-xl font-extrabold tracking-tightest">{pesos(clase.precioCop)}</span>
        </div>
        <p className="text-xs text-humo-500 -mt-2 px-1">
          Pagas en recepción antes de la clase (efectivo o transferencia).
        </p>

        {error && <Aviso>{error.message}</Aviso>}

        <Boton
          className="w-full"
          disabled={!datosCompletos}
          cargando={cargando}
          onClick={onConfirmar}
          style={datosCompletos && !cargando ? { backgroundColor: acento } : undefined}
        >
          Confirmar reserva
        </Boton>
      </div>
    </Hoja>
  );
}

function Linea({ etiqueta, valor, destacado, icono }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="etiqueta">{etiqueta}</span>
      <span
        className={cx(
          'flex items-center gap-1.5 text-right',
          destacado ? 'font-bold' : 'text-humo-100 text-sm'
        )}
      >
        {icono}
        {valor}
      </span>
    </div>
  );
}
