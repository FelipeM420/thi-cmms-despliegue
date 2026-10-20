// Cuentas de usuario.
//   - Gestión de cuentas (HU24): el administrador principal crea, edita, desactiva y elimina
//     administradores y técnicos; un administrador común solo gestiona técnicos. Las reglas
//     viven en utils/permisosCuentas.js y se evalúan con los datos de la base, no los del token.
//   - Soporte para HU7: la lista de técnicos a los que se puede asignar un mantenimiento
//     (solo lectura, solo campos no sensibles), ordenada por esfuerzo pendiente (menos
//     cargado primero): ver utils/cargaTecnicos.js.
const bcrypt = require('bcryptjs');
const { z } = require('zod');
const prisma = require('../config/prisma');
const { asyncHandler, errorHttp } = require('../middleware/manejoErrores');
const { ordenarPorCarga } = require('../utils/cargaTecnicos');
const { evaluarCreacion, evaluarGestion, permisosSobre } = require('../utils/permisosCuentas');
const { esViolacionDeClaveForanea } = require('../utils/claveForanea');

const COSTO_BCRYPT = 10;

// Nunca se devuelve passwordHash. `esAdministradorPrincipal` solo lo asigna la migración
// y la semilla: ningún esquema de entrada de abajo lo acepta.
const camposPublicos = {
  id: true,
  nombre: true,
  email: true,
  rol: true,
  activo: true,
  esAdministradorPrincipal: true,
  creadoEn: true,
};

const cuentaSchema = z.object({
  nombre: z.string().trim().min(3, 'El nombre debe tener al menos 3 caracteres.').max(120, 'El nombre es demasiado largo.'),
  // El correo se guarda en minúsculas y el inicio de sesión lo normaliza igual.
  email: z.string().trim().toLowerCase().email('Correo inválido.').max(160, 'El correo es demasiado largo.'),
  rol: z.enum(['ADMINISTRADOR', 'TECNICO'], { errorMap: () => ({ message: 'El rol debe ser ADMINISTRADOR o TECNICO.' }) }),
  // bcrypt solo lee los primeros 72 bytes: más caracteres no darían más seguridad.
  password: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres.').max(72, 'La contraseña admite hasta 72 caracteres.'),
  activo: z.boolean({ invalid_type_error: 'El estado debe ser verdadero o falso.' }),
});

const crearSchema = cuentaSchema.omit({ activo: true }).extend({ rol: cuentaSchema.shape.rol.default('TECNICO') });
const editarSchema = cuentaSchema.partial();

const MENSAJE_CORREO_REPETIDO =
  'Ya existe una cuenta con ese correo. Si está desactivada, reactívala desde la lista en lugar de crearla de nuevo.';

// Quién hace la petición, según la base (verificarToken ya la consultó).
const actorDe = (req) => ({
  id: req.usuario.sub,
  rol: req.usuario.rol,
  esAdministradorPrincipal: req.usuario.esAdministradorPrincipal === true,
});

function exigir(permiso) {
  if (!permiso.permitido) throw errorHttp(permiso.error, permiso.estado);
}

async function buscarCuenta(id) {
  const cuenta = await prisma.usuario.findUnique({ where: { id }, select: camposPublicos });
  if (!cuenta) throw errorHttp('Cuenta no encontrada.', 404);
  return cuenta;
}

// Al sacar a un técnico de circulación pueden quedarle trabajos asignados sin cerrar:
// se avisa para que el administrador los reasigne desde el cronograma.
async function advertenciaDeAsignaciones(cuenta) {
  if (cuenta.rol !== 'TECNICO') return null;
  const pendientes = await prisma.mantenimientoProgramado.count({
    where: { tecnicoAsignadoId: cuenta.id, estado: { in: ['ASIGNADO', 'EN_EJECUCION'] } },
  });
  if (pendientes === 0) return null;
  return `Tenía ${pendientes} mantenimiento(s) asignado(s) sin finalizar: reasígnalos desde el Cronograma.`;
}

// GET /api/usuarios — cualquier administrador ve todas las cuentas; `permisos` dice sobre cuáles
// puede actuar (el servidor vuelve a validar cada acción).
const listarUsuarios = asyncHandler(async (req, res) => {
  const actor = actorDe(req);
  const cuentas = await prisma.usuario.findMany({
    select: camposPublicos,
    orderBy: [{ esAdministradorPrincipal: 'desc' }, { rol: 'asc' }, { nombre: 'asc' }],
  });
  return res.json(cuentas.map((cuenta) => ({ ...cuenta, permisos: permisosSobre(actor, cuenta) })));
});

// POST /api/usuarios
const crearUsuario = asyncHandler(async (req, res) => {
  const parseo = crearSchema.safeParse(req.body);
  if (!parseo.success) throw errorHttp(parseo.error.issues[0].message);
  const { password, ...datos } = parseo.data;
  exigir(evaluarCreacion(actorDe(req), datos.rol));

  try {
    const usuario = await prisma.usuario.create({
      data: { ...datos, passwordHash: await bcrypt.hash(password, COSTO_BCRYPT) },
      select: camposPublicos,
    });
    return res.status(201).json({ ...usuario, permisos: permisosSobre(actorDe(req), usuario) });
  } catch (error) {
    if (error.code === 'P2002') throw errorHttp(MENSAJE_CORREO_REPETIDO, 409);
    throw error;
  }
});

// PUT /api/usuarios/:id — nombre, correo, contraseña, rol y estado (activar / desactivar).
const actualizarUsuario = asyncHandler(async (req, res) => {
  const parseo = editarSchema.safeParse(req.body);
  if (!parseo.success) throw errorHttp(parseo.error.issues[0].message);
  const { password, ...cambios } = parseo.data;
  if (Object.keys(cambios).length === 0 && !password) throw errorHttp('No hay cambios que guardar.');

  const actor = actorDe(req);
  const objetivo = await buscarCuenta(req.params.id);
  exigir(evaluarGestion(actor, objetivo, { rol: cambios.rol, activo: cambios.activo }));

  const data = { ...cambios };
  if (password) data.passwordHash = await bcrypt.hash(password, COSTO_BCRYPT);

  try {
    const usuario = await prisma.usuario.update({ where: { id: objetivo.id }, data, select: camposPublicos });
    const respuesta = { ...usuario, permisos: permisosSobre(actor, usuario) };
    if (objetivo.activo && usuario.activo === false) {
      const advertencia = await advertenciaDeAsignaciones(usuario);
      if (advertencia) respuesta.advertencia = advertencia;
    }
    return res.json(respuesta);
  } catch (error) {
    if (error.code === 'P2002') throw errorHttp(MENSAJE_CORREO_REPETIDO, 409);
    throw error;
  }
});

// DELETE /api/usuarios/:id — elimina la cuenta. Una cuenta con actividad registrada (equipos que
// dio de alta, mantenimientos, órdenes, aceptación del aviso de datos...) no se puede borrar:
// todas las claves foráneas son RESTRICT para no perder la trazabilidad. En ese caso queda
// desactivada, que para quien la usaba es lo mismo (no puede iniciar sesión) y se puede revertir.
const eliminarUsuario = asyncHandler(async (req, res) => {
  const actor = actorDe(req);
  const objetivo = await buscarCuenta(req.params.id);
  exigir(evaluarGestion(actor, objetivo, { eliminar: true }));

  try {
    await prisma.usuario.delete({ where: { id: objetivo.id } });
    return res.json({ eliminada: true, mensaje: `La cuenta de ${objetivo.nombre} se eliminó.` });
  } catch (error) {
    if (!esViolacionDeClaveForanea(error)) throw error;
  }

  const usuario = await prisma.usuario.update({ where: { id: objetivo.id }, data: { activo: false }, select: camposPublicos });
  const respuesta = {
    eliminada: false,
    usuario: { ...usuario, permisos: permisosSobre(actor, usuario) },
    mensaje: `La cuenta de ${objetivo.nombre} tiene actividad registrada, así que no se puede borrar sin perder la trazabilidad: quedó desactivada y ya no puede iniciar sesión.`,
  };
  const advertencia = objetivo.activo ? await advertenciaDeAsignaciones(usuario) : null;
  if (advertencia) respuesta.advertencia = advertencia;
  return res.json(respuesta);
});

// GET /api/usuarios/tecnicos — solo ADMINISTRADOR (aplicado en la ruta).
async function listarTecnicos(req, res) {
  try {
    const tecnicos = await prisma.usuario.findMany({
      where: { rol: 'TECNICO', activo: true },
      select: { id: true, nombre: true, email: true },
    });
    const ids = tecnicos.map((t) => t.id);
    const [mantenimientos, ordenesDirectas] = await Promise.all([
      prisma.mantenimientoProgramado.findMany({
        where: { tecnicoAsignadoId: { in: ids }, estado: { in: ['ASIGNADO', 'EN_EJECUCION'] } },
        select: { tecnicoAsignadoId: true, tarea: { select: { duracionEstimadaMin: true } } },
      }),
      prisma.ordenTrabajo.findMany({
        where: { tecnicoAsignadoId: { in: ids }, mantenimientoProgramadoId: null, estado: { in: ['EMITIDA', 'EN_PROCESO'] } },
        select: { tecnicoAsignadoId: true, tarea: { select: { duracionEstimadaMin: true } } },
      }),
    ]);
    return res.json(ordenarPorCarga(tecnicos, [...mantenimientos, ...ordenesDirectas]));
  } catch (error) {
    console.error('Error al listar técnicos:', error);
    return res.status(500).json({ error: 'Error interno al listar los técnicos.' });
  }
}

module.exports = { listarTecnicos, listarUsuarios, crearUsuario, actualizarUsuario, eliminarUsuario };
