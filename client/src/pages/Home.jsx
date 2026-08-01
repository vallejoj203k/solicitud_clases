import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client.js';
import { Cargando, Aviso, BarraDisponibilidad, cx } from '../components/ui.jsx';
import { ICONOS_DISCIPLINA, IconoFlecha, IconoCandado, IconoCalendario } from '../components/Iconos.jsx';
import { hora12 } from '../lib/formato.js';
import { leerCliente } from '../lib/sesion.js';

/**
 * Pantalla principal.
 *
 * Los próximos horarios de cada disciplina se ven SIN dar clic, y cada uno lleva
 * directo al mapa de puestos: desde aquí una reserva son 3 toques
 * (horario → puesto → confirmar).
 *
 * TABLET HORIZONTAL (`md:landscape:`): la pantalla se congela a la altura de la
 * ventana y las disciplinas se reparten en dos columnas que crecen para
 * llenarla. En el mostrador nadie debería tener que desplazar la página para
 * encontrar el botón de su clase.
 */
export default function Home() {
  const navegar = useNavigate();
  const cliente = leerCliente();

  const { data, isLoading, error } = useQuery({
    queryKey: ['inicio'],
    queryFn: api.inicio,
    staleTime: 30_000,
  });

  return (
    <div className="min-h-dvh md:landscape:h-dvh md:landscape:min-h-0 md:landscape:flex md:landscape:flex-col md:landscape:overflow-hidden">
      <header className="px-5 pt-8 pb-6 flex items-start justify-between gap-4 md:landscape:px-8 md:landscape:pt-6 md:landscape:pb-4 md:landscape:shrink-0">
        <div>
          <p className="etiqueta">
            {cliente ? `Hola, ${cliente.nombre.split(' ')[0]}` : 'Bienvenido'}
          </p>
          <h1 className="mt-1 text-[32px] leading-[1.05] font-extrabold tracking-tightest md:landscape:text-[28px]">
            Reserva tu
            {/* En horizontal cabe en un renglón y así el título no roba altura. */}
            <br className="md:landscape:hidden" />{' '}
            <span className="text-volt-500">puesto</span> hoy
          </h1>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Link
            to="/mis-reservas"
            aria-label="Mis reservas"
            className="p-3 rounded-2xl bg-carbon-700 border border-carbon-600 text-humo-300 hover:text-humo-100 active:scale-95 transition-all"
          >
            <IconoCalendario />
          </Link>
          {/* Acceso del personal del gimnasio. Discreto pero siempre visible. */}
          <Link
            to="/admin/login"
            aria-label="Ingreso administrador"
            title="Ingreso administrador"
            className="p-3 rounded-2xl bg-carbon-700 border border-carbon-600 text-humo-500 hover:text-volt-500 active:scale-95 transition-all"
          >
            <IconoCandado />
          </Link>
        </div>
      </header>

      <main
        className={cx(
          'px-5 pb-16 space-y-5',
          'md:landscape:flex-1 md:landscape:min-h-0 md:landscape:px-8 md:landscape:pb-6',
          'md:landscape:grid md:landscape:grid-cols-2 md:landscape:gap-5 md:landscape:space-y-0'
        )}
      >
        {isLoading && <Cargando texto="Buscando clases…" className="md:landscape:col-span-2" />}
        {error && (
          <Aviso className="md:landscape:col-span-2">
            No pudimos cargar las clases. Revisa tu conexión.
          </Aviso>
        )}

        {data?.tipos.map((tipo) => (
          <TarjetaDisciplina key={tipo.slug} tipo={tipo} onIrAPuestos={(clase) =>
            navegar(`/reservar/${tipo.slug}?clase=${clase.id}`)
          } />
        ))}

        {data && data.tipos.every((t) => t.totalProximas === 0) && (
          <Aviso tono="info" className="md:landscape:col-span-2">
            Todavía no hay clases programadas. Vuelve pronto o escríbenos en recepción.
          </Aviso>
        )}
      </main>
    </div>
  );
}

function TarjetaDisciplina({ tipo, onIrAPuestos }) {
  const Icono = ICONOS_DISCIPLINA[tipo.icono] ?? ICONOS_DISCIPLINA.run;
  const acento = tipo.color;

  return (
    <section className="tarjeta overflow-hidden animate-aparecer md:landscape:flex md:landscape:flex-col md:landscape:h-full md:landscape:min-h-0">
      {/* Cabecera: la foto del salón, resuelta por el slug igual que en la
          pantalla de reserva (/images/spinning.jpg, /images/running.jpg). Si la
          foto no existe, el `url()` falla en silencio y queda el fondo oscuro.
          Toda el área es tocable y lleva al listado completo del tipo. */}
      <Link
        to={`/reservar/${tipo.slug}`}
        className={cx(
          'group block relative h-[210px] active:scale-[.995] transition-transform',
          // En horizontal la foto se estira para llenar la ventana en vez de
          // medir siempre lo mismo.
          'md:landscape:h-auto md:landscape:flex-1 md:landscape:min-h-[180px]'
        )}
      >
        <div
          className="absolute inset-0 bg-cover bg-center transition-transform duration-500 group-hover:scale-105"
          style={{ backgroundImage: `url(/images/${tipo.slug}.jpg)` }}
        />
        {/* Degradado con paradas explícitas: sólido donde va el texto (el tercio
            inferior) y casi limpio arriba, para que la foto se vea de verdad.
            Sin él, el nombre compite con las bicicletas de la imagen.
            No se le pone tinte de color encima: ensuciaba las fotos, que ya
            traen los neones verdes y morados de la paleta. */}
        <div
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(to top, #1C2028 30%, rgba(28,32,40,0.82) 55%, rgba(28,32,40,0.10) 100%)',
          }}
        />

        {/* Aquí iba el precio de la disciplina, pero cada clase puede tener el
            suyo: anunciar uno solo terminaba contradiciendo lo que después se
            cobraba. El precio real se muestra al abrir la clase, junto al mapa
            de puestos, y otra vez en la confirmación. */}
        <div className="absolute inset-x-0 bottom-0 p-5 flex items-end justify-between gap-4">
          <div className="min-w-0">
            <div
              className="w-11 h-11 rounded-2xl flex items-center justify-center mb-2.5 backdrop-blur-sm"
              style={{ backgroundColor: `${acento}2E`, color: acento }}
            >
              <Icono className="w-6 h-6" />
            </div>
            <h2 className="text-[26px] leading-none font-extrabold tracking-tightest">
              {tipo.nombre}
            </h2>
            <p className="mt-1.5 text-sm text-humo-500 leading-snug max-w-[32ch]">
              {tipo.descripcion}
            </p>
          </div>
          <span className="shrink-0 p-2.5 rounded-full bg-carbon-900/60 backdrop-blur-sm text-humo-100 border border-white/10">
            <IconoFlecha />
          </span>
        </div>
      </Link>

      {/* Próximos horarios visibles sin necesidad de abrir nada. */}
      <div className="border-t border-carbon-600 bg-carbon-800/50 px-5 py-4 md:landscape:shrink-0">
        {tipo.proximas.length === 0 ? (
          <p className="text-sm text-humo-500">Sin horarios próximos.</p>
        ) : (
          <>
            <p className="etiqueta mb-2.5">Próximos horarios</p>
            {/* En horizontal no se arrastra: los horarios se reparten en una
                rejilla para que se vean todos de una vez. */}
            <div
              className={cx(
                'fila-scroll -mx-5 px-5',
                'md:landscape:grid md:landscape:grid-cols-4 md:landscape:mx-0 md:landscape:px-0 md:landscape:overflow-visible'
              )}
            >
              {tipo.proximas.map((clase) => (
                <button
                  key={clase.id}
                  disabled={clase.agotada}
                  onClick={() => onIrAPuestos(clase)}
                  className={cx(
                    'snap-start shrink-0 w-[132px] text-left rounded-2xl border p-3 transition-all',
                    'md:landscape:w-auto md:landscape:shrink',
                    'bg-carbon-700 border-carbon-600 active:scale-[.97]',
                    clase.agotada ? 'opacity-50 cursor-not-allowed' : 'hover:border-carbon-500'
                  )}
                >
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-humo-500">
                    {clase.diaEtiqueta ?? etiquetaRelativa(clase.fecha)}
                  </p>
                  <p className="mt-0.5 text-lg font-extrabold tracking-tightest tabular-nums whitespace-nowrap md:landscape:text-[17px]">
                    {hora12(clase.hora)}
                  </p>
                  <p className="text-[11px] text-humo-500 mb-2 truncate">
                    {clase.agotada ? 'Agotada' : `${clase.disponibles} libres`}
                  </p>
                  <BarraDisponibilidad porcentaje={clase.porcentajeOcupacion} agotada={clase.agotada} />
                </button>
              ))}
              <Link
                to={`/reservar/${tipo.slug}`}
                className="snap-start shrink-0 w-[92px] rounded-2xl border border-dashed border-carbon-600 flex flex-col items-center justify-center gap-1 text-humo-500 hover:text-humo-300 hover:border-carbon-500 transition-colors md:landscape:w-auto md:landscape:shrink"
              >
                <IconoFlecha className="w-4 h-4" />
                <span className="text-[11px] font-semibold">Ver todos</span>
              </Link>
            </div>
          </>
        )}
      </div>
    </section>
  );
}

/** "Hoy" / "Mañana" / "vie 1" según la fecha ISO. */
function etiquetaRelativa(fechaISO) {
  const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());
  if (fechaISO === hoy) return 'Hoy';

  const [a, m, d] = hoy.split('-').map(Number);
  const manana = new Date(Date.UTC(a, m - 1, d + 1)).toISOString().slice(0, 10);
  if (fechaISO === manana) return 'Mañana';

  const [a2, m2, d2] = fechaISO.split('-').map(Number);
  return new Intl.DateTimeFormat('es-CO', {
    weekday: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(a2, m2 - 1, d2)));
}
