import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../../api/client.js';
import { guardarToken } from '../../lib/sesion.js';
import { Aviso, Boton, Campo, Entrada } from '../../components/ui.jsx';
import { IconoCandado, IconoAtras } from '../../components/Iconos.jsx';

export default function AdminLogin() {
  const navegar = useNavigate();
  const [usuario, setUsuario] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [cargando, setCargando] = useState(false);

  const enviar = async (e) => {
    e.preventDefault();
    setCargando(true);
    setError(null);
    try {
      const { token } = await api.admin.login(usuario, password);
      guardarToken('admin', token);
      navegar('/admin', { replace: true });
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
              <IconoCandado className="w-6 h-6" />
            </span>
            <h1 className="mt-4 text-2xl font-extrabold tracking-tightest">Panel de administración</h1>
            <p className="mt-1 text-sm text-humo-500">Solo para el personal del gimnasio.</p>
          </div>

          <div className="space-y-3">
            <Campo etiqueta="Usuario" ayuda="Tu teléfono o correo registrado.">
              <Entrada
                value={usuario}
                onChange={(e) => setUsuario(e.target.value)}
                placeholder="3001234567"
                autoComplete="username"
                autoFocus
              />
            </Campo>
            <Campo etiqueta="Contraseña">
              <Entrada
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
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
            disabled={!usuario || !password}
          >
            Ingresar
          </Boton>
        </form>
      </main>
    </div>
  );
}
