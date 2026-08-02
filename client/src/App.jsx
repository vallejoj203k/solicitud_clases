import { Navigate, Route, Routes } from 'react-router-dom';
import Home from './pages/Home.jsx';
import Reservar from './pages/Reservar.jsx';
import Reserva from './pages/Reserva.jsx';
import MisReservas from './pages/MisReservas.jsx';
import Musica from './pages/Musica.jsx';
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

export default function App() {
  return (
    <Routes>
      {/* --- Cliente --- */}
      <Route path="/" element={<Home />} />
      <Route path="/reservar/:slug" element={<Reservar />} />
      <Route path="/reserva/:codigo" element={<Reserva />} />
      <Route path="/mis-reservas" element={<MisReservas />} />
      <Route path="/musica" element={<Musica />} />
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
