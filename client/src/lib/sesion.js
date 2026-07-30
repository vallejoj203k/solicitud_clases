/**
 * Sesiones del navegador.
 *
 * Hay dos independientes y no se pisan:
 *  - "cliente": token de larga duración que recibe el dispositivo al hacer su
 *    primera reserva. No hay contraseña; sirve para ver y cancelar sus reservas
 *    y para no volver a pedirle nombre y teléfono.
 *  - "admin": token que se obtiene con usuario y contraseña desde /admin/login.
 */
const CLAVES = {
  cliente: 'sc.token.cliente',
  admin: 'sc.token.admin',
  perfil: 'sc.cliente',
};

function seguro(fn, alterno = null) {
  try {
    return fn();
  } catch {
    // localStorage puede fallar en modo privado de algunos navegadores.
    return alterno;
  }
}

export const leerToken = (tipo = 'cliente') => seguro(() => localStorage.getItem(CLAVES[tipo]));

export const guardarToken = (tipo, token) =>
  seguro(() => localStorage.setItem(CLAVES[tipo], token));

export const borrarToken = (tipo) => seguro(() => localStorage.removeItem(CLAVES[tipo]));

export const leerCliente = () =>
  seguro(() => {
    const crudo = localStorage.getItem(CLAVES.perfil);
    return crudo ? JSON.parse(crudo) : null;
  });

export const guardarCliente = (cliente) =>
  seguro(() => localStorage.setItem(CLAVES.perfil, JSON.stringify(cliente)));

export const cerrarSesionCliente = () => {
  borrarToken('cliente');
  seguro(() => localStorage.removeItem(CLAVES.perfil));
};
