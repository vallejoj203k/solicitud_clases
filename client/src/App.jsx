import { Navigate, Route, Routes } from 'react-router-dom';
import Home from './pages/Home.jsx';
import Reservar from './pages/Reservar.jsx';
import Reserva from './pages/Reserva.jsx';
import MisReservas from './pages/MisReservas.jsx';
import Musica from './pages/Musica.jsx';
import Reproductor from './pages/Reproductor.jsx';
import Recuperar from './pages/Recuperar.jsx';
import Privacidad from './pages/Privacidad.jsx';
import AdminLogin from './pages/admin/Login.jsx';
import AdminLayout from './pages/admin/Layout.jsx';
import AdminDashboard from './pages/admin/Dashboard.jsx';
import AdminClases from './pages/admin/Clases.jsx';
import AdminClaseDetalle from './pages/admin/ClaseDetalle.jsx';
import AdminPagos from './pages/admin/Pagos.jsx';
import AdminClientes from './pages/admin/Clientes.jsx';
import AdminRecepcion from './pages/admin/Recepcion.jsx';
import AdminMusica from './pages/admin/Musica.jsx';
import { INICIO_TABLET, MUSICA_TABLET } from './lib/tablet.js';

export default function App() {
  return (
    <Routes>
      {/* --- Cliente --- */}
      <Route path="/" element={<Home />} />
      <Route path="/reservar/:slug" element={<Reservar />} />
      <Route path="/reserva/:codigo" element={<Reserva />} />
      <Route path="/mis-reservas" element={<MisReservas />} />

      {/* La tablet del salón: el mismo inicio, pero con Música, en una
          dirección que no está enlazada desde ninguna parte. Ver `lib/tablet.js`
          para hasta dónde protege eso -y hasta dónde no-. */}
      <Route path={INICIO_TABLET} element={<Home tablet />} />
      <Route path={MUSICA_TABLET} element={<Musica />} />

      {/* La dirección vieja de la música ya no lleva a ninguna parte: pedir
          canciones dejó de hacerse desde el teléfono de cada quien. Se deja
          escrita en vez de dejarla caer en el comodín de abajo para que quien
          la busque en el código encuentre el porqué. */}
      <Route path="/musica" element={<Navigate to="/" replace />} />
      {/* La pantalla del gimnasio: fuera del layout del panel a propósito, para
          que ocupe todo el televisor sin la barra de navegación. */}
      <Route path="/musica/reproductor" element={<Reproductor />} />
      <Route path="/recuperar" element={<Recuperar />} />
      <Route path="/privacidad" element={<Privacidad />} />

      {/* --- Administración --- */}
      <Route path="/admin/login" element={<AdminLogin />} />
      <Route path="/admin" element={<AdminLayout />}>
        <Route index element={<AdminDashboard />} />
        <Route path="recepcion" element={<AdminRecepcion />} />
        <Route path="clases" element={<AdminClases />} />
        <Route path="clases/:id" element={<AdminClaseDetalle />} />
        <Route path="musica" element={<AdminMusica />} />
        <Route path="pagos" element={<AdminPagos />} />
        <Route path="clientes" element={<AdminClientes />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
