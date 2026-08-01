import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client.js';
import SalonClase from '../../components/SalonClase.jsx';
import { BarraDisponibilidad, Cargando, Hoja, Insignia, cx } from '../../components/ui.jsx';
import { IconoAtras, IconoFlecha } from '../../components/Iconos.jsx';
import { hora12, fechaLarga, hoyISO } from '../../lib/formato.js';

/**
 * Calendario del mes con las clases de cada día.
 *
 * El camino es: día → disciplina → clase → salón. Se para en el mismo salón que
 * usa Recepción (`SalonClase`), así que tocar un puesto ocupado muestra quién lo
 * reservó y deja marcar asistencia o cobrar sin salir de ahí.
 *
 * Las fechas se manejan como texto "YYYY-MM-DD" y la rejilla se arma con
 * aritmética en UTC: construirla con fechas locales corre un día en cuanto el
 * navegador está en otra zona horaria que el gimnasio.
 */

const DIAS_SEMANA = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

const iso = (a, m, d) => new Date(Date.UTC(a, m, d)).toISOString().slice(0, 10);

/** Semanas del mes, de lunes a domingo, rellenando con los días vecinos. */
function semanasDelMes(anio, mes) {
  const primero = new Date(Date.UTC(anio, mes, 1));
  // getUTCDay: 0 = domingo. Se corre para que la semana empiece en lunes.
  const desplazamiento = (primero.getUTCDay() + 6) % 7;
  const dias = [];
  for (let i = 0; i < 42; i += 1) {
    const fecha = new Date(Date.UTC(anio, mes, 1 - desplazamiento + i));
    dias.push({
      fecha: fecha.toISOString().slice(0, 10),
      dia: fecha.getUTCDate(),
      delMes: fecha.getUTCMonth() === mes,
    });
  }
  // La sexta fila solo se dibuja si el mes de verdad la ocupa.
  const semanas = [];
  for (let i = 0; i < dias.length; i += 7) semanas.push(dias.slice(i, i + 7));
  return semanas.filter((s) => s.some((d) => d.delMes));
}

export default function CalendarioClases() {
  const hoy = hoyISO();
  const [anio, setAnio] = useState(Number(hoy.slice(0, 4)));
  const [mes, setMes] = useState(Number(hoy.slice(5, 7)) - 1);
  const [diaAbierto, setDiaAbierto] = useState(null);
  const [claseSalon, setClaseSalon] = useState(null);

  const semanas = semanasDelMes(anio, mes);
  const desde = semanas[0][0].fecha;
  const hasta = semanas.at(-1).at(-1).fecha;

  const { data: clases, isLoading } = useQuery({
    queryKey: ['adminClases', { desde, hasta, calendario: true }],
    queryFn: () => api.admin.clases({ desde, hasta, incluirPasadas: true }),
  });

  // Un índice por fecha ahorra recorrer la lista completa en cada casilla.
  const porFecha = {};
  for (const clase of clases ?? []) {
    if (clase.estado === 'CANCELADA') continue;
    (porFecha[clase.fecha] ??= []).push(clase);
  }

  const mover = (n) => {
    const d = new Date(Date.UTC(anio, mes + n, 1));
    setAnio(d.getUTCFullYear());
    setMes(d.getUTCMonth());
  };

  if (claseSalon) {
    return <SalonClase claseId={claseSalon} onVolver={() => setClaseSalon(null)} />;
  }

  const nombreMes = new Intl.DateTimeFormat('es-CO', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(anio, mes, 1)));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <button
          onClick={() => mover(-1)}
          aria-label="Mes anterior"
          className="p-2 rounded-xl text-humo-300 hover:bg-carbon-700 active:scale-95"
        >
          <IconoAtras className="w-5 h-5" />
        </button>
        <p className="font-bold tracking-tight first-letter:uppercase">{nombreMes}</p>
        <button
          onClick={() => mover(1)}
          aria-label="Mes siguiente"
          className="p-2 rounded-xl text-humo-300 hover:bg-carbon-700 active:scale-95"
        >
          <IconoFlecha className="w-5 h-5" />
        </button>
      </div>

      {isLoading && <Cargando />}

      <div className="tarjeta overflow-hidden">
        <div className="grid grid-cols-7 border-b border-carbon-600 bg-carbon-800">
          {DIAS_SEMANA.map((d) => (
            <span key={d} className="py-2 text-center text-[11px] font-bold text-humo-500">
              {d}
            </span>
          ))}
        </div>

        {semanas.map((semana) => (
          <div key={semana[0].fecha} className="grid grid-cols-7 border-b border-carbon-700 last:border-0">
            {semana.map((celda) => (
              <Casilla
                key={celda.fecha}
                celda={celda}
                clases={porFecha[celda.fecha] ?? []}
                esHoy={celda.fecha === hoy}
                onAbrir={() => setDiaAbierto(celda.fecha)}
              />
            ))}
          </div>
        ))}
      </div>

      {diaAbierto && (
        <HojaDelDia
          fecha={diaAbierto}
          clases={porFecha[diaAbierto] ?? []}
          onCerrar={() => setDiaAbierto(null)}
          onAbrirClase={(id) => {
            setDiaAbierto(null);
            setClaseSalon(id);
          }}
        />
      )}
    </div>
  );
}

/**
 * Una casilla del calendario. En pantallas grandes lista las clases; en el
 * teléfono, donde no caben, se resumen en un punto por disciplina y el conteo.
 */
function Casilla({ celda, clases, esHoy, onAbrir }) {
  const vacia = clases.length === 0;
  const colores = [...new Set(clases.map((c) => c.tipoClase.color))];

  return (
    <button
      onClick={onAbrir}
      disabled={vacia}
      className={cx(
        'min-h-[64px] md:min-h-[92px] p-1.5 md:p-2 text-left border-r border-carbon-700 last:border-0',
        'transition-colors align-top',
        celda.delMes ? 'bg-transparent' : 'bg-carbon-800/40',
        vacia ? 'cursor-default' : 'hover:bg-carbon-700/60 active:bg-carbon-700'
      )}
    >
      <span
        className={cx(
          'inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold tabular-nums',
          esHoy && 'bg-volt-500 text-carbon-900',
          !esHoy && celda.delMes && 'text-humo-300',
          !esHoy && !celda.delMes && 'text-carbon-500'
        )}
      >
        {celda.dia}
      </span>

      {!vacia && (
        <>
          {/* Teléfono: puntos + conteo. */}
          <span className="md:hidden mt-1 flex items-center gap-1">
            {colores.map((color) => (
              <span key={color} className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }} />
            ))}
            <span className="text-[10px] font-semibold text-humo-500 tabular-nums">
              {clases.length}
            </span>
          </span>

          {/* Escritorio: las primeras clases con su hora. */}
          <span className="hidden md:block mt-1 space-y-0.5">
            {clases.slice(0, 3).map((c) => (
              <span key={c.id} className="flex items-center gap-1">
                <span
                  className="w-1.5 h-1.5 rounded-full shrink-0"
                  style={{ backgroundColor: c.tipoClase.color }}
                />
                <span className="text-[10px] text-humo-300 tabular-nums truncate">
                  {hora12(c.hora)}
                </span>
              </span>
            ))}
            {clases.length > 3 && (
              <span className="block text-[10px] text-humo-500">+{clases.length - 3} más</span>
            )}
          </span>
        </>
      )}
    </button>
  );
}

/**
 * Hoja del día: primero se elige disciplina y después la clase.
 *
 * Si ese día solo hay una disciplina no tiene sentido preguntar: se salta el
 * paso y se muestran sus clases directamente.
 */
function HojaDelDia({ fecha, clases, onCerrar, onAbrirClase }) {
  const disciplinas = [];
  for (const clase of clases) {
    const yaEsta = disciplinas.find((d) => d.slug === clase.tipoClase.slug);
    if (yaEsta) yaEsta.clases.push(clase);
    else disciplinas.push({ ...clase.tipoClase, clases: [clase] });
  }

  const [slug, setSlug] = useState(disciplinas.length === 1 ? disciplinas[0].slug : null);
  const elegida = disciplinas.find((d) => d.slug === slug);

  return (
    <Hoja abierta onCerrar={onCerrar} titulo={fechaLarga(fecha)}>
      {!elegida ? (
        <div className="space-y-2">
          <p className="text-sm text-humo-500 mb-3">¿Qué disciplina quieres ver?</p>
          {disciplinas.map((d) => (
            <button
              key={d.slug}
              onClick={() => setSlug(d.slug)}
              className="w-full tarjeta p-4 flex items-center justify-between gap-3 hover:border-carbon-500 transition-colors"
            >
              <span className="flex items-center gap-3">
                <span className="w-3 h-3 rounded-full" style={{ backgroundColor: d.color }} />
                <span className="font-bold tracking-tight">{d.nombre}</span>
              </span>
              <span className="flex items-center gap-2 text-sm text-humo-500">
                {d.clases.length} clase{d.clases.length === 1 ? '' : 's'}
                <IconoFlecha className="w-4 h-4" />
              </span>
            </button>
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {disciplinas.length > 1 && (
            <button
              onClick={() => setSlug(null)}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-humo-500 hover:text-humo-100"
            >
              <IconoAtras className="w-4 h-4" />
              Otra disciplina
            </button>
          )}

          <ul className="space-y-2">
            {elegida.clases.map((clase) => (
              <li key={clase.id}>
                <button
                  onClick={() => onAbrirClase(clase.id)}
                  className="w-full text-left tarjeta p-4 hover:border-carbon-500 transition-colors"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ backgroundColor: clase.tipoClase.color }}
                        />
                        <p className="font-bold tracking-tight">{hora12(clase.hora)}</p>
                        {clase.agotada && <Insignia tono="peligro">Llena</Insignia>}
                      </div>
                      <p className="mt-0.5 text-xs text-humo-500 truncate">
                        {clase.instructor?.nombre ?? 'Sin instructor'} · {clase.duracionMin} min
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

          <p className="text-xs text-humo-500 pt-1">
            Abre una clase para ver el salón y quién ocupa cada puesto.
          </p>
        </div>
      )}
    </Hoja>
  );
}
