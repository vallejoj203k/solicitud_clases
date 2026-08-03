import { idDispositivo, leerToken } from '../lib/sesion.js';

// En produccion el frontend y la API comparten dominio, asi que basta con rutas
// relativas. VITE_API_URL solo hace falta si se despliegan por separado.
const BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

export class ApiError extends Error {
  constructor(mensaje, status, codigo, detalles) {
    super(mensaje);
    this.status = status;
    this.codigo = codigo;
    this.detalles = detalles;
  }
}

async function pedir(ruta, { metodo = 'GET', cuerpo, tipoToken = 'cliente' } = {}) {
  const cabeceras = { Accept: 'application/json' };
  const token = leerToken(tipoToken);
  if (token) cabeceras.Authorization = `Bearer ${token}`;
  // Identifica al navegador para pedir musica sin sesion: reparte los turnos y
  // permite quitar lo propio.
  const dispositivo = idDispositivo();
  if (dispositivo) cabeceras['X-Dispositivo'] = dispositivo;
  if (cuerpo !== undefined) cabeceras['Content-Type'] = 'application/json';

  const respuesta = await fetch(`${BASE}/api${ruta}`, {
    method: metodo,
    headers: cabeceras,
    body: cuerpo !== undefined ? JSON.stringify(cuerpo) : undefined,
  });

  if (respuesta.status === 204) return null;

  const texto = await respuesta.text();
  let datos = null;
  try {
    datos = texto ? JSON.parse(texto) : null;
  } catch {
    datos = { error: texto };
  }

  if (!respuesta.ok) {
    throw new ApiError(
      datos?.error || 'No pudimos completar la operación.',
      respuesta.status,
      datos?.codigo,
      datos?.detalles
    );
  }
  return datos;
}

/** Descarga un archivo generado por la API (CSV, ICS) respetando el token. */
export async function descargar(ruta, nombreArchivo, tipoToken = 'cliente') {
  const token = leerToken(tipoToken);
  const respuesta = await fetch(`${BASE}/api${ruta}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!respuesta.ok) throw new ApiError('No pudimos generar el archivo.', respuesta.status);

  const blob = await respuesta.blob();
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = nombreArchivo;
  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();
  URL.revokeObjectURL(url);
}

export const api = {
  // --- Publico -------------------------------------------------------------
  inicio: () => pedir('/inicio'),
  tiposClase: () => pedir('/tipos-clase'),
  clases: ({ tipo, desde, hasta } = {}) => {
    const q = new URLSearchParams();
    if (tipo) q.set('tipo', tipo);
    if (desde) q.set('desde', desde);
    if (hasta) q.set('hasta', hasta);
    return pedir(`/clases?${q}`);
  },
  disponibilidad: (claseId) => pedir(`/clases/${claseId}/disponibilidad`),
  crearReserva: (datos) => pedir('/reservas', { metodo: 'POST', cuerpo: datos }),
  reserva: (codigo) => pedir(`/reservas/${codigo}`),
  misReservas: () => pedir('/mis-reservas'),
  cancelarReserva: (codigo) => pedir(`/reservas/${codigo}/cancelar`, { metodo: 'POST' }),
  recuperarReserva: (codigo, telefono) =>
    pedir('/reservas/recuperar', { metodo: 'POST', cuerpo: { codigo, telefono } }),
  configuracion: () => pedir('/configuracion'),
  estadoPago: (codigo, idTransaccion) =>
    pedir(`/reservas/${codigo}/estado-pago${idTransaccion ? `?id=${encodeURIComponent(idTransaccion)}` : ''}`),
  checkout: (codigo) => pedir(`/reservas/${codigo}/checkout`),
  avisarPago: (codigo) => pedir(`/reservas/${codigo}/aviso-pago`, { metodo: 'POST' }),

  // --- Musica --------------------------------------------------------------
  buscarMusica: (q) => pedir(`/musica/buscar?q=${encodeURIComponent(q)}`),
  catalogoMusica: () => pedir('/musica/catalogo'),
  popularesMusica: () => pedir('/musica/populares'),
  // Que suena ahora en los parlantes del gimnasio.
  musicaAhora: () => pedir('/musica/ahora'),
  canciones: (q) => pedir(`/canciones${q ? `?q=${encodeURIComponent(q)}` : ''}`),
  cancionesDeLaCasa: () => pedir('/canciones/de-la-casa'),
  cola: () => pedir('/musica/cola'),
  pedirCancion: (cuerpo) => pedir('/musica/pedir', { metodo: 'POST', cuerpo }),
  quitarPedido: (pedidoId) => pedir(`/musica/${pedidoId}`, { metodo: 'DELETE' }),

  // --- Admin ---------------------------------------------------------------
  admin: {
    login: (usuario, password) =>
      pedir('/auth/admin/login', { metodo: 'POST', cuerpo: { usuario, password } }),
    yo: () => pedir('/auth/me', { tipoToken: 'admin' }),
    dashboard: () => pedir('/admin/dashboard', { tipoToken: 'admin' }),
    clases: ({ desde, hasta, tipo, incluirPasadas } = {}) => {
      const q = new URLSearchParams();
      if (desde) q.set('desde', desde);
      if (hasta) q.set('hasta', hasta);
      if (tipo) q.set('tipo', tipo);
      if (incluirPasadas) q.set('incluirPasadas', 'true');
      return pedir(`/admin/clases?${q}`, { tipoToken: 'admin' });
    },
    crearClase: (datos) => pedir('/admin/clases', { metodo: 'POST', cuerpo: datos, tipoToken: 'admin' }),
    crearClasesLote: (datos) =>
      pedir('/admin/clases/lote', { metodo: 'POST', cuerpo: datos, tipoToken: 'admin' }),
    actualizarClase: (id, datos) =>
      pedir(`/admin/clases/${id}`, { metodo: 'PATCH', cuerpo: datos, tipoToken: 'admin' }),
    cancelarClase: (id) => pedir(`/admin/clases/${id}/cancelar`, { metodo: 'POST', tipoToken: 'admin' }),
    eliminarClasesEnLote: (datos) =>
      pedir('/admin/clases/eliminar-lote', { metodo: 'POST', cuerpo: datos, tipoToken: 'admin' }),
    eliminarClase: (id) => pedir(`/admin/clases/${id}`, { metodo: 'DELETE', tipoToken: 'admin' }),
    reservasDeClase: (id) => pedir(`/admin/clases/${id}/reservas`, { tipoToken: 'admin' }),
    marcarPago: (id, datos) =>
      pedir(`/admin/reservas/${id}/pago`, { metodo: 'PATCH', cuerpo: datos, tipoToken: 'admin' }),
    cancelarReserva: (id) =>
      pedir(`/admin/reservas/${id}/cancelar`, { metodo: 'POST', tipoToken: 'admin' }),
    marcarAsistencia: (id, asistio) =>
      pedir(`/admin/reservas/${id}/asistencia`, { metodo: 'POST', cuerpo: { asistio }, tipoToken: 'admin' }),
    reportePagos: ({ desde, hasta, tipo, estadoPago } = {}) => {
      const q = new URLSearchParams();
      if (desde) q.set('desde', desde);
      if (hasta) q.set('hasta', hasta);
      if (tipo) q.set('tipo', tipo);
      if (estadoPago) q.set('estadoPago', estadoPago);
      return pedir(`/admin/reportes/pagos?${q}`, { tipoToken: 'admin' });
    },
    descargarCsv: ({ desde, hasta, tipo } = {}) => {
      const q = new URLSearchParams();
      if (desde) q.set('desde', desde);
      if (hasta) q.set('hasta', hasta);
      if (tipo) q.set('tipo', tipo);
      return descargar(
        `/admin/reportes/pagos.csv?${q}`,
        `pagos_${desde || 'inicio'}_${hasta || 'hoy'}.csv`,
        'admin'
      );
    },
    buscar: (q) => pedir(`/admin/buscar?q=${encodeURIComponent(q)}`, { tipoToken: 'admin' }),
    pagosPorConfirmar: () => pedir('/admin/pagos-por-confirmar', { tipoToken: 'admin' }),
    agenda: (dias = 7) => pedir(`/admin/agenda?dias=${dias}`, { tipoToken: 'admin' }),
    mapaClase: (id) => pedir(`/admin/clases/${id}/mapa`, { tipoToken: 'admin' }),
    clientes: (q) => pedir(`/admin/clientes${q ? `?q=${encodeURIComponent(q)}` : ''}`, { tipoToken: 'admin' }),
    cliente: (id) => pedir(`/admin/clientes/${id}`, { tipoToken: 'admin' }),
    tiposClase: () => pedir('/admin/tipos-clase', { tipoToken: 'admin' }),
    actualizarPrecioTipo: (id, datos) =>
      pedir(`/admin/tipos-clase/${id}`, { metodo: 'PATCH', cuerpo: datos, tipoToken: 'admin' }),
    instructores: () => pedir('/admin/instructores', { tipoToken: 'admin' }),
    canciones: (q) =>
      pedir(`/admin/canciones${q ? `?q=${encodeURIComponent(q)}` : ''}`, { tipoToken: 'admin' }),
    crearCancion: (datos) =>
      pedir('/admin/canciones', { metodo: 'POST', cuerpo: datos, tipoToken: 'admin' }),
    importarCanciones: (texto, deLaCasa = true) =>
      pedir('/admin/canciones/importar', {
        metodo: 'POST',
        cuerpo: { texto, deLaCasa },
        tipoToken: 'admin',
      }),
    buscarEnYoutube: (q) =>
      pedir(`/admin/musica/buscar?q=${encodeURIComponent(q)}`, { tipoToken: 'admin' }),
    agregarDeYoutube: (videoId, deLaCasa = true) =>
      pedir('/admin/musica/agregar', {
        metodo: 'POST',
        cuerpo: { videoId, deLaCasa },
        tipoToken: 'admin',
      }),
    // El reproductor del gimnasio avanza la fila.
    siguienteCancion: (clase = null) =>
      pedir('/admin/musica/siguiente', { metodo: 'POST', cuerpo: { clase }, tipoToken: 'admin' }),
    // Qué poner cuando nadie ha pedido nada. Devuelve varias para que la
    // pantalla pueda enseñarlas y el administrador escoger.
    sugeridas: (desde, excluir = [], limite = 12) => {
      const q = new URLSearchParams({ limite: String(limite) });
      if (desde) q.set('desde', desde);
      // Se recorta la lista de excluidas: la URL tiene un límite y con las
      // últimas basta para que no se repita nada reciente.
      if (excluir.length) q.set('excluir', excluir.slice(-60).join(','));
      return pedir(`/admin/musica/sugeridas?${q}`, { tipoToken: 'admin' });
    },
    actualizarCancion: (id, datos) =>
      pedir(`/admin/canciones/${id}`, { metodo: 'PATCH', cuerpo: datos, tipoToken: 'admin' }),
    eliminarCancion: (id) =>
      pedir(`/admin/canciones/${id}`, { metodo: 'DELETE', tipoToken: 'admin' }),
    colaMusica: () => pedir('/admin/musica/cola', { tipoToken: 'admin' }),
    marcarSono: (pedidoId, sono = true) =>
      pedir(`/admin/musica/${pedidoId}/sono`, { metodo: 'POST', cuerpo: { sono }, tipoToken: 'admin' }),
    quitarPedidoMusica: (pedidoId) =>
      pedir(`/admin/musica/${pedidoId}`, { metodo: 'DELETE', tipoToken: 'admin' }),
    crearInstructor: (nombre) =>
      pedir('/admin/instructores', { metodo: 'POST', cuerpo: { nombre }, tipoToken: 'admin' }),
  },
};
