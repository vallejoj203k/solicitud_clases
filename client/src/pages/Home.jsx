import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client.js';
import { Cargando, Aviso, cx } from '../components/ui.jsx';
import {
  ICONOS_DISCIPLINA,
  IconoFlecha,
  IconoCandado,
  IconoCalendario,
  IconoMusica,
  IconoExpandir,
  IconoContraer,
} from '../components/Iconos.jsx';
import { hora12 } from '../lib/formato.js';
import { abierta, etiquetaApertura } from '../lib/apertura.js';
import { leerCliente } from '../lib/sesion.js';
import { usePantallaCompleta } from '../lib/pantalla.js';

/**
 * La dirección que se le enseña a la gente del salón.
 *
 * VA ESCRITA A MANO, y no sale de `APP_URL` ni de `location.host` a propósito:
 * la app se sirve en `app.megavital.app`, pero lo que hay que poder dictarle a
 * alguien que la va a buscar desde su propio teléfono es el dominio corto. Son
 * dos cosas distintas, y esta es un texto, no una configuración. Si el gimnasio
 * cambia de dominio, se cambia aquí.
 */
const DIRECCION_PUBLICA = 'megavital.app';

/**
 * Pantalla principal: tres tarjetas —Spinning, Running y Música— y nada más.
 *
 * LA REGLA DE ESTA PANTALLA ES QUE NO SE DESPLAZA. La app se usa de pie, con
 * una mano y muchas veces en la tablet del mostrador: todo lo que se puede
 * hacer tiene que estar a la vista. Por eso el alto es `h-dvh` y las tarjetas
 * se reparten el espacio que sobra en vez de tener alto propio; en una pantalla
 * pequeña se encogen, pero siguen cabiendo las tres.
 *
 * Cada tarjeta lleva al listado de su disciplina, y la pastilla de abajo salta
 * directo al mapa de puestos de la próxima clase: reservar sigue siendo un
 * toque desde aquí.
 */
export default function Home() {
  const navegar = useNavigate();
  const cliente = leerCliente();
  const pantalla = usePantallaCompleta();

  const { data, isLoading, error } = useQuery({
    queryKey: ['inicio'],
    queryFn: api.inicio,
    staleTime: 30_000,
  });

  // Hasta que el gimnasio termine de pasar su horario al software, las reservas
  // por la app empiezan en una fecha. Se avisa en la tarjeta de cada disciplina
  // porque es donde la persona va a tocar.
  const { data: config } = useQuery({ queryKey: ['configuracion'], queryFn: api.configuracion });
  const reservasDesde = config?.reservasDesde ?? null;
  const desdeCuando = etiquetaApertura(reservasDesde);

  const sinClases = data && data.tipos.every((t) => t.totalProximas === 0);

  return (
    <div className="h-dvh flex flex-col overflow-hidden">
      <header className="shrink-0 px-5 pt-5 pb-3 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="etiqueta truncate">
            {cliente ? `Hola, ${cliente.nombre.split(' ')[0]}` : 'Bienvenido'}
          </p>
          <h1 className="mt-0.5 text-[26px] leading-none font-extrabold tracking-tightest">
            Reserva tu <span className="text-volt-500">puesto</span>
          </h1>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {/* Pantalla completa. Solo aparece donde el navegador la tiene
              -Android sí, el iPhone no-, porque un botón que no hace nada es
              peor que ninguno. Va aquí y no en otra pantalla porque esta es la
              que se deja puesta en la tablet del mostrador. */}
          {pantalla.disponible && (
            <button
              onClick={pantalla.alternar}
              aria-label={pantalla.activa ? 'Salir de pantalla completa' : 'Pantalla completa'}
              title={pantalla.activa ? 'Salir de pantalla completa' : 'Pantalla completa'}
              className="p-2.5 rounded-2xl bg-carbon-700 border border-carbon-600 text-humo-300 hover:text-humo-100 active:scale-95 transition-all"
            >
              {pantalla.activa ? <IconoContraer /> : <IconoExpandir />}
            </button>
          )}
          <Link
            to="/mis-reservas"
            aria-label="Mis reservas"
            className="p-2.5 rounded-2xl bg-carbon-700 border border-carbon-600 text-humo-300 hover:text-humo-100 active:scale-95 transition-all"
          >
            <IconoCalendario />
          </Link>
          {/* Acceso del personal del gimnasio. Discreto pero siempre visible. */}
          <Link
            to="/admin/login"
            aria-label="Ingreso administrador"
            title="Ingreso administrador"
            className="p-2.5 rounded-2xl bg-carbon-700 border border-carbon-600 text-humo-500 hover:text-volt-500 active:scale-95 transition-all"
          >
            <IconoCandado />
          </Link>
        </div>
      </header>

      {/* La dirección, justo encima de las tarjetas.
          POR QUE ESTA AQUI: en el gimnasio la app vive en una tablet del
          mostrador, y quien pasa por delante y la ve funcionando no tiene forma
          de saber dónde encontrarla desde su propio teléfono. Por eso va en el
          inicio y no en un pie de página: es lo que se apunta de un vistazo.
          La etiqueta es la que se recorta cuando no cabe; la dirección nunca
          (`shrink-0`), porque es el único dato que importa de esta línea. */}
      <div className="shrink-0 px-5 pb-3 flex items-baseline gap-2">
        <p className="etiqueta min-w-0 truncate">Búscalo en internet como:</p>
        <h2 className="shrink-0 text-[26px] leading-none font-extrabold tracking-tightest text-volt-500">
          {DIRECCION_PUBLICA}
        </h2>
      </div>

      {isLoading && (
        <div className="flex-1 flex items-center justify-center">
          <Cargando texto="Buscando clases…" />
        </div>
      )}

      {error && (
        <div className="px-5">
          <Aviso>No pudimos cargar las clases. Revisa tu conexión.</Aviso>
        </div>
      )}

      {data && (
        <main
          className={cx(
            'flex-1 min-h-0 px-4 pb-4 grid gap-3',
            // Vertical: una debajo de otra, repartiéndose el alto.
            'grid-rows-3',
            // Tablet horizontal: las tres en fila, que es como se ve en el
            // mostrador.
            'md:landscape:grid-rows-1 md:landscape:grid-cols-3 md:landscape:px-6 md:landscape:pb-6'
          )}
        >
          {data.tipos.map((tipo) => (
            <TarjetaDisciplina
              key={tipo.slug}
              tipo={tipo}
              desdeCuando={desdeCuando}
              reservasDesde={reservasDesde}
              onIrAPuestos={(clase) => navegar(`/reservar/${tipo.slug}?clase=${clase.id}`)}
            />
          ))}
          <TarjetaMusica />
        </main>
      )}

      {sinClases && (
        <div className="shrink-0 px-5 pb-4">
          <Aviso tono="info">
            Todavía no hay clases programadas. Vuelve pronto o escríbenos en recepción.
          </Aviso>
        </div>
      )}
    </div>
  );
}

/**
 * Envoltura común de las tres tarjetas.
 *
 * `min-h-0` es lo que permite que la tarjeta se encoja dentro de la rejilla: sin
 * él, el contenido impone un alto mínimo y la pantalla vuelve a desplazarse en
 * los teléfonos cortos.
 */
function Tarjeta({ children, className = '' }) {
  return (
    <section
      className={cx(
        'relative min-h-0 rounded-3xl overflow-hidden border border-carbon-600 animate-aparecer',
        className
      )}
    >
      {children}
    </section>
  );
}

function TarjetaDisciplina({ tipo, desdeCuando, reservasDesde, onIrAPuestos }) {
  const Icono = ICONOS_DISCIPLINA[tipo.icono] ?? ICONOS_DISCIPLINA.run;
  const acento = tipo.color;
  const siguiente = tipo.proximas.find((c) => !c.agotada) ?? tipo.proximas[0] ?? null;

  // El atajo a la próxima clase se esconde mientras esa clase no se pueda
  // reservar: lleva a un mapa de puestos donde no se puede tomar ninguno, y de
  // paso deja el sitio que necesita el aviso para caber centrado en un teléfono
  // corto, donde la tarjeta mide un tercio de la pantalla.
  const proxima = siguiente && abierta(siguiente.fecha, reservasDesde) ? siguiente : null;

  return (
    <Tarjeta>
      {/* El enlace cubre toda la tarjeta y va debajo del contenido; así se puede
          tocar en cualquier parte sin anidar un <a> dentro de otro, que no es
          HTML válido y rompe la pastilla de la próxima clase. */}
      <Link
        to={`/reservar/${tipo.slug}`}
        aria-label={`Ver clases de ${tipo.nombre}`}
        className="absolute inset-0 z-10"
      />

      {/* La foto del salón, resuelta por el slug (/images/spinning.jpg). Si no
          existe, el `url()` falla en silencio y queda el fondo oscuro. */}
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: `url(/images/${tipo.slug}.jpg)` }}
      />
      {/* Degradado con paradas explícitas: sólido solo en la franja donde va el
          texto y limpio arriba, para que la foto se vea. Las paradas van en
          porcentaje, así que en una tarjeta alta -la tablet- tapan lo mismo en
          proporción y la foto no queda ahogada. Sin tinte de color encima: las
          fotos ya traen los neones de la paleta. */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(to top, #1C2028 0%, rgba(28,32,40,0.90) 26%, rgba(28,32,40,0.30) 58%, rgba(28,32,40,0) 100%)',
        }}
      />

      <div className="relative z-20 h-full p-4 flex flex-col justify-end pointer-events-none">
        {/* El aviso de que las reservas todavía no abren: SOBRE la foto y
            centrado, porque es lo primero que tiene que ver quien abre la app.
            Ocupa el hueco que sobra encima del texto (`flex-1`) y se centra
            dentro de él; con un desplazamiento fijo quedaba bien en la tablet y
            encima del nombre en un teléfono corto, donde la tarjeta mide un
            tercio. `min-h-0` es lo que le permite encogerse ahí.
            El fondo con desenfoque es lo que hace legible un texto rojo sobre la
            foto del salón. */}
        {desdeCuando && (
          <div className="flex-1 min-h-0 flex items-center justify-center pb-2">
            <p
              className="rounded-2xl bg-carbon-900/80 backdrop-blur-sm px-3 py-2 text-center
                         text-[17px] leading-tight font-extrabold text-alerta"
            >
              Reservas desde el {desdeCuando} en adelante
            </p>
          </div>
        )}

        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <span
              className="inline-flex w-9 h-9 rounded-xl items-center justify-center mb-1.5 backdrop-blur-sm"
              style={{ backgroundColor: `${acento}2E`, color: acento }}
            >
              <Icono className="w-5 h-5" />
            </span>
            <h2 className="text-[22px] leading-none font-extrabold tracking-tightest">
              {tipo.nombre}
            </h2>
          </div>
          <span className="shrink-0 p-2 rounded-full bg-carbon-900/60 backdrop-blur-sm text-humo-100 border border-white/10">
            <IconoFlecha />
          </span>
        </div>

        {/* Un toque desde el inicio hasta el mapa de puestos de la próxima
            clase. `pointer-events-auto` la rescata del enlace de la tarjeta. */}
        {proxima ? (
          <button
            disabled={proxima.agotada}
            onClick={() => onIrAPuestos(proxima)}
            className={cx(
              'pointer-events-auto mt-2.5 w-full rounded-2xl px-3 py-2 text-left',
              'bg-carbon-900/70 backdrop-blur-sm border border-white/10 transition-all',
              proxima.agotada ? 'opacity-60 cursor-not-allowed' : 'hover:border-white/25 active:scale-[.98]'
            )}
          >
            <span className="block text-[11px] font-semibold uppercase tracking-wider text-humo-500">
              Próxima
            </span>
            <span className="flex items-baseline gap-2">
              <span className="font-extrabold tracking-tightest tabular-nums">
                {proxima.diaEtiqueta ?? etiquetaRelativa(proxima.fecha)} {hora12(proxima.hora)}
              </span>
              <span className="text-[11px] text-humo-500 truncate">
                {proxima.agotada ? 'Agotada' : `${proxima.disponibles} libres`}
              </span>
            </span>
          </button>
        ) : (
          !desdeCuando && <p className="mt-2.5 text-xs text-humo-500">Sin horarios próximos.</p>
        )}
      </div>
    </Tarjeta>
  );
}

/**
 * Música. No tiene foto propia: va con la paleta de la app para que se lea como
 * "otra cosa" y no como una tercera disciplina.
 */
function TarjetaMusica() {
  return (
    <Tarjeta className="bg-carbon-800">
      <Link to="/musica" className="absolute inset-0 z-10" aria-label="Pedir música" />

      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(130% 105% at 100% 0%, rgba(200,247,81,0.26) 0%, rgba(200,247,81,0.04) 55%, rgba(200,247,81,0) 75%)',
        }}
      />

      {/* La nota grande ocupa el espacio que en las otras dos tarjetas llena la
          foto del salón; sin ella la tarjeta se ve como un hueco. Sale del
          marco a propósito, para que se lea como textura y no como un botón. */}
      <IconoMusica className="absolute -top-8 -right-6 w-44 h-44 text-volt-500/[0.07] rotate-12" />

      <div className="relative z-20 h-full p-4 flex flex-col justify-end pointer-events-none">
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <span className="inline-flex w-9 h-9 rounded-xl items-center justify-center mb-1.5 bg-volt-500/20 text-volt-500">
              <IconoMusica className="w-5 h-5" />
            </span>
            <h2 className="text-[22px] leading-none font-extrabold tracking-tightest">Música</h2>
            <p className="mt-1.5 text-sm text-humo-500 leading-snug truncate">
              Pide las canciones de tu clase.
            </p>
          </div>
          <span className="shrink-0 p-2 rounded-full bg-carbon-900/60 text-humo-100 border border-white/10">
            <IconoFlecha />
          </span>
        </div>
      </div>
    </Tarjeta>
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
