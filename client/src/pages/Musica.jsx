import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client.js';
import PedirMusica from '../components/PedirMusica.jsx';
import { Boton, Cargando, Vacio } from '../components/ui.jsx';
import { IconoAtras, IconoFlecha, IconoMusica } from '../components/Iconos.jsx';
import { leerToken } from '../lib/sesion.js';

/**
 * "Pide tu música", desde el inicio.
 *
 * Pedir canciones exige tener reserva en esa clase, así que la pantalla es la
 * lista de las clases a las que la persona va: elige una y se abre la hoja para
 * pedir. Sin reservas no hay nada que decidir, y se le manda a reservar.
 */
export default function Musica() {
  const haySesion = Boolean(leerToken('cliente'));
  const [claseAbierta, setClaseAbierta] = useState(null);

  const { data: reservas, isLoading } = useQuery({
    queryKey: ['misReservas'],
    queryFn: api.misReservas,
    enabled: haySesion,
  });

  const ahora = Date.now();
  // Se puede pedir hasta que la clase TERMINE: a mitad del spinning es cuando a
  // uno se le antoja una canción.
  const vigentes = (reservas ?? []).filter(
    (r) =>
      r.estado !== 'CANCELADA' &&
      r.estado !== 'EXPIRADA' &&
      r.estado !== 'PENDIENTE_PAGO' &&
      new Date(r.clase.inicioEn).getTime() + r.clase.duracionMin * 60_000 > ahora
  );

  // Una pareja puede tener dos puestos en la misma clase: la música se pide una
  // sola vez por clase, no una por puesto.
  const clases = [];
  for (const r of vigentes) {
    if (!clases.some((c) => c.id === r.clase.id)) clases.push(r.clase);
  }
  clases.sort((a, b) => new Date(a.inicioEn) - new Date(b.inicioEn));

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
          <h1 className="text-2xl font-extrabold tracking-tightest">Pide tu música</h1>
          <p className="text-xs text-humo-500">
            Elige las canciones que quieres que suenen en tu clase.
          </p>
        </div>
      </header>

      <main className="px-5 space-y-4">
        {isLoading && <Cargando />}

        {(!haySesion || (!isLoading && clases.length === 0)) && (
          <Vacio
            titulo="No tienes clases próximas"
            descripcion="La música se pide para una clase reservada: primero aparta tu puesto y vuelve aquí."
            accion={
              <Link to="/" className="block">
                <Boton className="w-full">
                  Reservar una clase
                  <IconoFlecha />
                </Boton>
              </Link>
            }
          />
        )}

        {clases.map((clase) => (
          <button
            key={clase.id}
            onClick={() => setClaseAbierta(clase)}
            className="w-full text-left tarjeta p-4 flex items-center gap-4 hover:border-carbon-500 active:scale-[.99] transition-all"
          >
            <span
              className="w-12 h-12 shrink-0 rounded-2xl flex items-center justify-center"
              style={{ backgroundColor: `${clase.tipoClase.color}2E`, color: clase.tipoClase.color }}
            >
              <IconoMusica className="w-6 h-6" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="etiqueta" style={{ color: clase.tipoClase.color }}>
                {clase.tipoClase.nombre}
              </p>
              <p className="mt-0.5 font-bold tracking-tight first-letter:uppercase truncate">
                {clase.etiqueta}
              </p>
            </div>
            <IconoFlecha className="w-5 h-5 shrink-0 text-humo-500" />
          </button>
        ))}
      </main>

      <PedirMusica
        claseId={claseAbierta?.id}
        acento={claseAbierta?.tipoClase.color}
        abierta={Boolean(claseAbierta)}
        onCerrar={() => setClaseAbierta(null)}
      />
    </div>
  );
}
