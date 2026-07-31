import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client.js';
import { IconoAtras } from '../components/Iconos.jsx';

/**
 * Política de tratamiento de datos (Ley 1581 de 2012 y Decreto 1074 de 2015).
 *
 * Es el texto al que remite la casilla de autorización del formulario de
 * reserva. Los datos del responsable salen de la configuración del servidor
 * (GIMNASIO_NOMBRE, GIMNASIO_DIRECCION, GIMNASIO_CONTACTO) para no tener que
 * tocar código al cambiarlos.
 */
export default function Privacidad() {
  const { data } = useQuery({ queryKey: ['configuracion'], queryFn: api.configuracion });
  const gimnasio = data?.gimnasio ?? {};

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
        <h1 className="text-2xl font-extrabold tracking-tightest">Política de privacidad</h1>
      </header>

      <main className="px-5 max-w-2xl mx-auto space-y-6 text-sm leading-relaxed text-humo-300">
        <p className="text-humo-500">
          Última actualización: agosto de 2026. Aplica al tratamiento de datos personales
          recolectados a través de esta aplicación de reservas.
        </p>

        <Seccion titulo="Responsable del tratamiento">
          <p>
            {gimnasio.nombre || 'El gimnasio'}
            {gimnasio.direccion ? `, con domicilio en ${gimnasio.direccion}` : ''}
            {gimnasio.contacto ? `. Contacto: ${gimnasio.contacto}` : '.'}
          </p>
        </Seccion>

        <Seccion titulo="Qué datos recolectamos">
          <ul className="list-disc pl-5 space-y-1">
            <li>Nombre y número de teléfono, obligatorios para identificar tu reserva.</li>
            <li>Correo electrónico, opcional, solo si quieres recibir la confirmación.</li>
            <li>Historial de tus reservas: clase, fecha, puesto y estado de pago.</li>
          </ul>
          <p className="mt-2">
            No pedimos ni almacenamos datos de tarjetas, documentos de identidad ni datos
            sensibles.
          </p>
        </Seccion>

        <Seccion titulo="Para qué los usamos">
          <ul className="list-disc pl-5 space-y-1">
            <li>Gestionar tu reserva y asignarte un puesto.</li>
            <li>Confirmarte la reserva y avisarte si la clase se cancela.</li>
            <li>Llevar el control de asistencia y de pagos en recepción.</li>
          </ul>
          <p className="mt-2">
            No vendemos ni compartimos tus datos con terceros con fines comerciales.
          </p>
        </Seccion>

        <Seccion titulo="Tus derechos">
          <p>
            Puedes conocer, actualizar, rectificar y suprimir tus datos, y revocar esta
            autorización en cualquier momento
            {gimnasio.contacto ? ` escribiendo a ${gimnasio.contacto}` : ' contactando al gimnasio'}.
            Atendemos la solicitud dentro de los términos de la Ley 1581 de 2012.
          </p>
        </Seccion>

        <Seccion titulo="Conservación">
          <p>
            Conservamos tus datos mientras seas cliente activo y por el tiempo necesario para
            cumplir obligaciones contables y legales. Después se eliminan o se anonimizan.
          </p>
        </Seccion>

        <div className="pt-4">
          <Link to="/" className="text-volt-500 font-semibold hover:underline">
            Volver al inicio
          </Link>
        </div>
      </main>
    </div>
  );
}

function Seccion({ titulo, children }) {
  return (
    <section className="tarjeta p-5">
      <h2 className="font-bold tracking-tight text-humo-100 mb-2">{titulo}</h2>
      {children}
    </section>
  );
}
