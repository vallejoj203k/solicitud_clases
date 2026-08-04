import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client.js';
import { guardarCliente, guardarToken } from '../lib/sesion.js';
import { Aviso, Boton, Campo, Entrada } from '../components/ui.jsx';
import { IconoAtras, IconoBuscar } from '../components/Iconos.jsx';

/**
 * Recuperar el acceso a las reservas desde otro dispositivo.
 *
 * El cliente no tiene contraseña: su sesión vive en el navegador. Si cambia de
 * celular o borra los datos, esta pantalla es la única forma de volver a entrar.
 * Pide código Y teléfono: con uno solo se podrían ver reservas ajenas.
 */
export default function Recuperar() {
  const navegar = useNavigate();
  const queryClient = useQueryClient();
  const [codigo, setCodigo] = useState('');
  const [telefono, setTelefono] = useState('');
  const [error, setError] = useState(null);
  const [cargando, setCargando] = useState(false);

  const enviar = async (e) => {
    e.preventDefault();
    setCargando(true);
    setError(null);
    try {
      const { token, cliente } = await api.recuperarReserva(codigo.trim(), telefono.trim());
      guardarToken('cliente', token);
      guardarCliente(cliente);
      // Cambió la identidad del dispositivo: lo que haya en caché es de otra
      // persona (o del estado "sin sesión"). Sin esto, quien acaba de recuperar
      // su reserva ve la lista vacía hasta que caduque la caché.
      queryClient.clear();
      navegar('/mis-reservas', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setCargando(false);
    }
  };

  return (
    <div className="min-h-dvh flex flex-col">
      <header className="px-5 pt-6">
        <Link
          to="/"
          aria-label="Volver"
          className="inline-flex p-2 -ml-2 rounded-xl text-humo-300 hover:bg-carbon-700"
        >
          <IconoAtras />
        </Link>
      </header>

      <main className="flex-1 flex items-center justify-center px-5 pb-20">
        <form onSubmit={enviar} className="w-full max-w-sm">
          <div className="text-center mb-8">
            <span className="inline-flex p-3.5 rounded-2xl bg-volt-500/10 text-volt-500 border border-volt-500/20">
              <IconoBuscar className="w-6 h-6" />
            </span>
            <h1 className="mt-4 text-2xl font-extrabold tracking-tightest">Recupera tu reserva</h1>
            <p className="mt-1.5 text-sm text-humo-500">
              ¿Cambiaste de celular o no ves tus reservas? Escribe el código que te dimos y tu
              teléfono.
            </p>
          </div>

          <div className="space-y-3">
            <Campo etiqueta="Código de la reserva" ayuda="Los 6 caracteres que aparecen sobre el QR.">
              <Entrada
                value={codigo}
                onChange={(e) => setCodigo(e.target.value.toUpperCase())}
                placeholder="K7QF2M"
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck="false"
                className="tracking-[0.3em] font-bold text-center"
                autoFocus
              />
            </Campo>
            {/* Antes pedía el teléfono. Desde que el gimnasio dejó de pedirlo,
                la mayoría de reservas no tienen ninguno, así que también vale el
                nombre: es algo que sabe quien reservó y que, junto al código, no
                se adivina desde fuera. */}
            <Campo etiqueta="Tu nombre" ayuda="El mismo con el que reservaste. También vale tu teléfono, si lo diste.">
              <Entrada
                value={telefono}
                onChange={(e) => setTelefono(e.target.value)}
                placeholder="Nombre y apellido"
                autoComplete="name"
              />
            </Campo>
          </div>

          {error && (
            <div className="mt-4">
              <Aviso>{error}</Aviso>
            </div>
          )}

          <Boton
            type="submit"
            className="w-full mt-6"
            cargando={cargando}
            disabled={codigo.trim().length < 4 || telefono.trim().length < 2}
          >
            Recuperar
          </Boton>

          <p className="mt-6 text-center text-xs text-humo-500">
            Si perdiste el código, pregunta en recepción: ahí pueden buscarte por tu nombre o
            tu teléfono.
          </p>
        </form>
      </main>
    </div>
  );
}
