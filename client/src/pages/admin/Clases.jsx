import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client.js';
import { CabeceraAdmin } from './Layout.jsx';
import {
  Aviso,
  BarraDisponibilidad,
  Boton,
  Campo,
  Cargando,
  Chip,
  Entrada,
  Hoja,
  Insignia,
  Seleccion,
  Vacio,
  cx,
} from '../../components/ui.jsx';
import { IconoMas } from '../../components/Iconos.jsx';
import CalendarioClases from './Calendario.jsx';
import { hoyISO, sumarDiasISO, hora12, fechaLarga, pesos } from '../../lib/formato.js';

const DIAS = [
  { n: 1, t: 'L' },
  { n: 2, t: 'M' },
  { n: 3, t: 'X' },
  { n: 4, t: 'J' },
  { n: 5, t: 'V' },
  { n: 6, t: 'S' },
  { n: 0, t: 'D' },
];

export default function AdminClases() {
  const queryClient = useQueryClient();
  const [rango, setRango] = useState({ desde: hoyISO(), hasta: sumarDiasISO(hoyISO(), 13) });
  const [tipo, setTipo] = useState('');
  const [editando, setEditando] = useState(null); // null | "nueva" | clase
  const [vista, setVista] = useState('calendario');
  const [error, setError] = useState(null);

  const { data: tipos } = useQuery({ queryKey: ['adminTipos'], queryFn: api.admin.tiposClase });
  const { data: instructores } = useQuery({
    queryKey: ['adminInstructores'],
    queryFn: api.admin.instructores,
  });

  const { data: clases, isLoading } = useQuery({
    queryKey: ['adminClases', rango, tipo],
    queryFn: () => api.admin.clases({ ...rango, tipo: tipo || undefined, incluirPasadas: true }),
  });

  const refrescar = () => {
    queryClient.invalidateQueries({ queryKey: ['adminClases'] });
    queryClient.invalidateQueries({ queryKey: ['adminDashboard'] });
  };

  const cancelar = useMutation({
    mutationFn: (id) => api.admin.cancelarClase(id),
    onSuccess: refrescar,
    onError: (e) => setError(e.message),
  });

  const eliminar = useMutation({
    mutationFn: (id) => api.admin.eliminarClase(id),
    onSuccess: refrescar,
    onError: (e) => setError(e.message),
  });

  const porDia = {};
  for (const clase of clases ?? []) (porDia[clase.fecha] ??= []).push(clase);

  return (
    <div>
      <CabeceraAdmin
        titulo="Clases"
        descripcion="Crea, edita y cancela los horarios."
        acciones={
          <Boton className="min-h-[44px] text-sm" onClick={() => setEditando('nueva')}>
            <IconoMas className="w-4 h-4" />
            Nueva clase
          </Boton>
        }
      />

      <div className="px-5 md:px-8 pb-10 space-y-5">
        {/* Dos maneras de mirar lo mismo: el calendario para ver el mes y entrar
            a un día, la lista para crear, editar y borrar. */}
        <div className="flex gap-2">
          <Chip activo={vista === 'calendario'} onClick={() => setVista('calendario')}>
            Calendario
          </Chip>
          <Chip activo={vista === 'lista'} onClick={() => setVista('lista')}>
            Lista
          </Chip>
        </div>

        <PreciosPorDisciplina tipos={tipos ?? []} alGuardar={refrescar} />

        {vista === 'calendario' && <CalendarioClases />}

        {vista === 'lista' && (
        <>
        <div className="flex flex-wrap items-end gap-3">
          <Campo etiqueta="Desde" className="w-[152px]">
            <Entrada
              type="date"
              value={rango.desde}
              onChange={(e) => setRango((r) => ({ ...r, desde: e.target.value }))}
            />
          </Campo>
          <Campo etiqueta="Hasta" className="w-[152px]">
            <Entrada
              type="date"
              value={rango.hasta}
              onChange={(e) => setRango((r) => ({ ...r, hasta: e.target.value }))}
            />
          </Campo>
          <div className="flex gap-2 pb-0.5">
            <Chip activo={tipo === ''} onClick={() => setTipo('')}>
              Todas
            </Chip>
            {(tipos ?? []).map((t) => (
              <Chip key={t.slug} activo={tipo === t.slug} onClick={() => setTipo(t.slug)}>
                {t.nombre}
              </Chip>
            ))}
          </div>
        </div>

        {error && <Aviso>{error}</Aviso>}
        {isLoading && <Cargando />}

        {!isLoading && (clases ?? []).length === 0 && (
          <Vacio titulo="No hay clases en este rango" descripcion="Ajusta las fechas o crea una nueva." />
        )}

        {Object.entries(porDia).map(([fecha, delDia]) => (
          <section key={fecha}>
            <p className="etiqueta mb-2 first-letter:uppercase">{fechaLarga(fecha)}</p>
            <ul className="space-y-2">
              {delDia.map((clase) => (
                <li key={clase.id} className="tarjeta p-4">
                  <div className="flex items-start justify-between gap-3">
                    <Link to={`/admin/clases/${clase.id}`} className="min-w-0 flex-1 group">
                      <div className="flex items-center gap-2">
                        <span
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ backgroundColor: clase.tipoClase.color }}
                        />
                        <p className="font-bold tracking-tight truncate group-hover:text-volt-500 transition-colors">
                          {hora12(clase.hora)} · {clase.tipoClase.nombre}
                        </p>
                        {clase.estado === 'CANCELADA' && <Insignia tono="peligro">Cancelada</Insignia>}
                      </div>
                      <p className="mt-0.5 text-xs text-humo-500 truncate">
                        {clase.instructor?.nombre ?? 'Sin instructor'} · {clase.duracionMin} min ·{' '}
                        {pesos(clase.precioCop)}
                      </p>
                      <div className="mt-2 flex items-center gap-2">
                        <BarraDisponibilidad
                          porcentaje={clase.porcentajeOcupacion}
                          agotada={clase.agotada}
                          className="flex-1 max-w-[180px]"
                        />
                        <span className="text-xs font-bold tabular-nums">
                          {clase.ocupados}
                          <span className="text-humo-500 font-normal">/{clase.capacidad}</span>
                        </span>
                      </div>
                    </Link>

                    <div className="flex flex-col gap-1.5 shrink-0">
                      <button
                        onClick={() => setEditando(clase)}
                        className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-carbon-600 hover:bg-carbon-500 transition-colors"
                      >
                        Editar
                      </button>
                      {/* Una clase activa a la que nadie se inscribió -la típica
                          creada a la hora equivocada- se borra directo, sin
                          obligar a cancelarla primero. */}
                      {clase.estado === 'ACTIVA' && clase.ocupados > 0 ? (
                        <button
                          onClick={() => {
                            if (window.confirm('¿Cancelar la clase? Se cancelarán todas sus reservas.'))
                              cancelar.mutate(clase.id);
                          }}
                          className="px-3 py-1.5 rounded-xl text-xs font-semibold text-alerta hover:bg-alerta/10 transition-colors"
                        >
                          Cancelar
                        </button>
                      ) : (
                        <button
                          onClick={() => {
                            if (window.confirm('¿Eliminar la clase definitivamente?'))
                              eliminar.mutate(clase.id);
                          }}
                          className="px-3 py-1.5 rounded-xl text-xs font-semibold text-humo-500 hover:text-alerta transition-colors"
                        >
                          Eliminar
                        </button>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))}
        </>
        )}
      </div>

      {/* Se monta solo al abrir: así los valores por defecto se calculan cuando
          los tipos de clase ya están cargados, sin efectos de sincronización. */}
      {editando && (
        <FormularioClase
          key={editando === 'nueva' ? 'nueva' : editando.id}
          clase={editando === 'nueva' ? null : editando}
          tipos={tipos ?? []}
          instructores={instructores ?? []}
          onCerrar={() => setEditando(null)}
          onGuardado={() => {
            setEditando(null);
            refrescar();
          }}
        />
      )}
    </div>
  );
}

/**
 * Precio de cada disciplina: el que hereda cada clase nueva. Es distinto del
 * precio de una clase suelta, que se edita en su formulario, y esa diferencia no
 * se veía por ningún lado.
 *
 * El cliente nunca ve este número: en la pantalla principal no se anuncia
 * ningún precio, justamente porque cada clase puede tener el suyo.
 */
function PreciosPorDisciplina({ tipos, alGuardar }) {
  const [editando, setEditando] = useState(null);

  if (tipos.length === 0) return null;

  return (
    <>
      <div className="tarjeta p-4">
        <div className="flex items-center justify-between gap-3">
          <p className="etiqueta">Precio por disciplina</p>
          <p className="text-[11px] text-humo-500">Con el que nacen las clases nuevas</p>
        </div>
        <ul className="mt-3 flex flex-wrap gap-2">
          {tipos.map((t) => (
            <li key={t.id}>
              <button
                onClick={() => setEditando(t)}
                className="flex items-center gap-2 rounded-xl border border-carbon-600 bg-carbon-700 px-3 py-2 text-sm hover:border-carbon-500 transition-colors"
              >
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: t.color }} />
                <span className="font-semibold">{t.nombre}</span>
                <span className="font-extrabold tabular-nums">{pesos(t.precioCop)}</span>
                <span className="text-[11px] text-humo-500">Cambiar</span>
              </button>
            </li>
          ))}
        </ul>
      </div>

      {editando && (
        <FormularioPrecioTipo
          key={editando.id}
          tipo={editando}
          onCerrar={() => setEditando(null)}
          onGuardado={() => {
            setEditando(null);
            alGuardar();
          }}
        />
      )}
    </>
  );
}

function FormularioPrecioTipo({ tipo, onCerrar, onGuardado }) {
  const queryClient = useQueryClient();
  const [precio, setPrecio] = useState(String(tipo.precioCop));
  const [aplicarAProximas, setAplicarAProximas] = useState(true);
  const [error, setError] = useState(null);
  const [resultado, setResultado] = useState(null);

  const guardar = useMutation({
    mutationFn: () =>
      api.admin.actualizarPrecioTipo(tipo.id, {
        precioCop: Number(precio),
        aplicarAProximas,
      }),
    onSuccess: (r) => {
      queryClient.invalidateQueries({ queryKey: ['adminTipos'] });
      setResultado(r);
    },
    onError: (e) => setError(e.message),
  });

  // Tras guardar se muestra qué pasó con las clases ya programadas: es la parte
  // que no es obvia y la que decide si hay que ir a ajustar alguna a mano.
  if (resultado) {
    return (
      <Hoja abierta onCerrar={onGuardado} titulo="Precio actualizado">
        <div className="space-y-4">
          <p className="text-sm">
            {tipo.nombre} queda en{' '}
            <span className="font-extrabold">{pesos(resultado.tipo.precioCop)}</span> en las clases
            que crees de ahora en adelante.
          </p>
          {aplicarAProximas && (
            <p className="text-sm text-humo-300">
              {resultado.clasesActualizadas === 0
                ? 'No había clases próximas con el precio anterior.'
                : `Se actualizaron ${resultado.clasesActualizadas} clase(s) ya programadas.`}
              {resultado.clasesConPrecioPropio > 0 && (
                <>
                  {' '}
                  {resultado.clasesConPrecioPropio} tenían un precio propio y quedaron como estaban;
                  cámbialas una por una si también deben subir.
                </>
              )}
            </p>
          )}
          <Boton className="w-full" onClick={onGuardado}>
            Listo
          </Boton>
        </div>
      </Hoja>
    );
  }

  return (
    <Hoja abierta onCerrar={onCerrar} titulo={`Precio de ${tipo.nombre}`}>
      <div className="space-y-3">
        <Campo etiqueta="Precio" ayuda="Es el que heredan las clases nuevas de esta disciplina.">
          <Entrada
            type="number"
            min="0"
            step="1000"
            value={precio}
            onChange={(e) => setPrecio(e.target.value)}
          />
        </Campo>

        <label className="flex items-start gap-3 cursor-pointer rounded-2xl border border-carbon-600 bg-carbon-700/50 p-4">
          <input
            type="checkbox"
            checked={aplicarAProximas}
            onChange={(e) => setAplicarAProximas(e.target.checked)}
            className="w-5 h-5 mt-0.5 rounded accent-volt-500"
          />
          <span className="text-sm">
            <span className="font-semibold">Aplicar a las clases ya programadas</span>
            <span className="block text-xs text-humo-500 mt-0.5">
              Solo las futuras que aún tengan el precio anterior. Las que pasaron y las que tengan un
              precio propio no se tocan.
            </span>
          </span>
        </label>

        {error && <Aviso>{error}</Aviso>}

        <div className="flex gap-2 pt-1">
          <Boton variante="contorno" className="flex-1" onClick={onCerrar}>
            Cancelar
          </Boton>
          <Boton
            className="flex-1"
            cargando={guardar.isPending}
            disabled={precio === '' || Number(precio) < 0}
            onClick={() => {
              setError(null);
              guardar.mutate();
            }}
          >
            Guardar
          </Boton>
        </div>
      </div>
    </Hoja>
  );
}

function FormularioClase({ clase, tipos, instructores, onCerrar, onGuardado }) {
  const esEdicion = Boolean(clase);
  const [error, setError] = useState(null);
  const [repetir, setRepetir] = useState(false);
  const [diasSemana, setDiasSemana] = useState([1, 3, 5]);
  const [hasta, setHasta] = useState(sumarDiasISO(hoyISO(), 28));

  const [form, setForm] = useState(() => valoresIniciales(clase, tipos));

  const guardar = useMutation({
    mutationFn: () => {
      const datos = {
        tipoClaseId: form.tipoClaseId,
        instructorId: form.instructorId || null,
        fecha: form.fecha,
        hora: form.hora,
        duracionMin: Number(form.duracionMin),
        cupoMaximo: Number(form.cupoMaximo),
        precioCop: Number(form.precioCop),
        puestosBloqueados: form.puestosBloqueados
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
        notas: form.notas || null,
      };
      if (esEdicion) return api.admin.actualizarClase(clase.id, datos);
      if (repetir) {
        const { fecha, hora, ...resto } = datos;
        return api.admin.crearClasesLote({
          ...resto,
          desde: fecha,
          hasta,
          diasSemana,
          horas: [hora],
        });
      }
      return api.admin.crearClase(datos);
    },
    onSuccess: onGuardado,
    onError: (e) => setError(e.message),
  });

  const tipoSeleccionado = tipos.find((t) => t.id === form.tipoClaseId);
  const totalPuestos = tipoSeleccionado?.layoutExpandido?.total;

  return (
    <Hoja abierta onCerrar={onCerrar} titulo={esEdicion ? 'Editar clase' : 'Nueva clase'}>
      <div className="space-y-3">
        <Campo etiqueta="Disciplina">
          <Seleccion
            value={form.tipoClaseId}
            onChange={(e) => {
              const t = tipos.find((x) => x.id === e.target.value);
              setForm((f) => ({
                ...f,
                tipoClaseId: e.target.value,
                precioCop: t?.precioCop ?? f.precioCop,
                cupoMaximo: t?.layoutExpandido?.total ?? f.cupoMaximo,
              }));
            }}
          >
            {tipos.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nombre}
              </option>
            ))}
          </Seleccion>
        </Campo>

        <div className="grid grid-cols-2 gap-3">
          <Campo etiqueta={repetir && !esEdicion ? 'Desde' : 'Fecha'}>
            <Entrada
              type="date"
              value={form.fecha}
              onChange={(e) => setForm((f) => ({ ...f, fecha: e.target.value }))}
            />
          </Campo>
          <Campo etiqueta="Hora">
            <Entrada
              type="time"
              value={form.hora}
              onChange={(e) => setForm((f) => ({ ...f, hora: e.target.value }))}
            />
          </Campo>
        </div>

        {!esEdicion && (
          <div className="rounded-2xl border border-carbon-600 bg-carbon-700/50 p-4">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={repetir}
                onChange={(e) => setRepetir(e.target.checked)}
                className="w-5 h-5 rounded accent-volt-500"
              />
              <span className="text-sm font-semibold">Repetir todas las semanas</span>
            </label>

            {repetir && (
              <div className="mt-4 space-y-3 animate-aparecer">
                <div>
                  <span className="etiqueta block mb-2">Días</span>
                  <div className="flex gap-1.5">
                    {DIAS.map((d) => (
                      <button
                        key={d.n}
                        type="button"
                        onClick={() =>
                          setDiasSemana((prev) =>
                            prev.includes(d.n) ? prev.filter((x) => x !== d.n) : [...prev, d.n]
                          )
                        }
                        className={cx(
                          'w-10 h-10 rounded-xl text-sm font-bold transition-colors',
                          diasSemana.includes(d.n)
                            ? 'bg-volt-500 text-carbon-900'
                            : 'bg-carbon-600 text-humo-500'
                        )}
                      >
                        {d.t}
                      </button>
                    ))}
                  </div>
                </div>
                <Campo etiqueta="Hasta" ayuda="Se omiten las fechas que ya tengan esa clase.">
                  <Entrada type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
                </Campo>
              </div>
            )}
          </div>
        )}

        <Campo etiqueta="Instructor">
          <Seleccion
            value={form.instructorId}
            onChange={(e) => setForm((f) => ({ ...f, instructorId: e.target.value }))}
          >
            <option value="">Sin asignar</option>
            {instructores.map((i) => (
              <option key={i.id} value={i.id}>
                {i.nombre}
              </option>
            ))}
          </Seleccion>
        </Campo>

        <div className="grid grid-cols-3 gap-3">
          <Campo etiqueta="Cupo" ayuda={totalPuestos ? `Máx ${totalPuestos}` : undefined}>
            <Entrada
              type="number"
              min="1"
              value={form.cupoMaximo}
              onChange={(e) => setForm((f) => ({ ...f, cupoMaximo: e.target.value }))}
            />
          </Campo>
          <Campo etiqueta="Minutos">
            <Entrada
              type="number"
              min="10"
              step="5"
              value={form.duracionMin}
              onChange={(e) => setForm((f) => ({ ...f, duracionMin: e.target.value }))}
            />
          </Campo>
          <Campo etiqueta="Precio" ayuda="Solo esta clase">
            <Entrada
              type="number"
              min="0"
              step="1000"
              value={form.precioCop}
              onChange={(e) => setForm((f) => ({ ...f, precioCop: e.target.value }))}
            />
          </Campo>
        </div>

        <Campo
          etiqueta="Puestos fuera de servicio"
          ayuda="Códigos separados por coma, por ejemplo: B3, C4"
        >
          <Entrada
            value={form.puestosBloqueados}
            onChange={(e) => setForm((f) => ({ ...f, puestosBloqueados: e.target.value }))}
            placeholder="Ninguno"
          />
        </Campo>

        <Campo etiqueta="Notas">
          <Entrada
            value={form.notas}
            onChange={(e) => setForm((f) => ({ ...f, notas: e.target.value }))}
            placeholder="Opcional"
          />
        </Campo>

        {error && <Aviso>{error}</Aviso>}

        <div className="flex gap-2 pt-1">
          <Boton variante="contorno" className="flex-1" onClick={onCerrar}>
            Cancelar
          </Boton>
          <Boton className="flex-1" cargando={guardar.isPending} onClick={() => {
            setError(null);
            guardar.mutate();
          }}>
            {esEdicion ? 'Guardar' : 'Crear'}
          </Boton>
        </div>
      </div>
    </Hoja>
  );
}

function valoresIniciales(clase, tipos) {
  if (clase) {
    return {
      tipoClaseId: clase.tipoClase.id,
      instructorId: clase.instructor?.id ?? '',
      fecha: clase.fecha,
      hora: clase.hora,
      duracionMin: clase.duracionMin,
      cupoMaximo: clase.cupoMaximo,
      precioCop: clase.precioCop,
      puestosBloqueados: (clase.puestosBloqueados ?? []).join(', '),
      notas: clase.notas ?? '',
    };
  }
  const primero = tipos[0];
  return {
    tipoClaseId: primero?.id ?? '',
    instructorId: '',
    fecha: hoyISO(),
    hora: '18:00',
    duracionMin: 50,
    cupoMaximo: primero?.layoutExpandido?.total ?? 12,
    precioCop: primero?.precioCop ?? 0,
    puestosBloqueados: '',
    notas: '',
  };
}
