// HU24 — reglas de quién puede gestionar qué cuenta. Funciones puras: el
// controlador les entrega al actor y a la cuenta objetivo tal como están en la
// base de datos (nunca los datos del token, que pueden estar desactualizados).
//
//   - Administrador principal: crea, edita, desactiva y elimina administradores y técnicos.
//     Su propia cuenta solo la modifica él.
//   - Administrador común: solo gestiona técnicos. No toca a otros administradores
//     ni al principal, y no puede crear ni promover administradores.
//   - Nadie cambia su propio rol, se desactiva ni se elimina: así el principal
//     no puede dejar el sistema sin quien administre cuentas. Sí puede editar
//     sus propios datos (nombre, correo, contraseña).
//
// Resultado: { permitido: true } o { permitido: false, estado, error }, donde
// `estado` es el código HTTP que debe responder el controlador.

const ADMINISTRADOR = 'ADMINISTRADOR';
const TECNICO = 'TECNICO';

const PERMITIDO = { permitido: true };
const denegar = (estado, error) => ({ permitido: false, estado, error });

const esAdministrador = (cuenta) => cuenta?.rol === ADMINISTRADOR;
const esPrincipal = (cuenta) => esAdministrador(cuenta) && cuenta.esAdministradorPrincipal === true;

function evaluarCreacion(actor, rolNuevo) {
  if (!esAdministrador(actor)) return denegar(403, 'Solo un administrador gestiona cuentas.');
  if (!esPrincipal(actor) && rolNuevo !== TECNICO) {
    return denegar(403, 'Solo el administrador principal puede crear administradores.');
  }
  return PERMITIDO;
}

// cambios: { rol?, activo?, eliminar? }. Un valor igual al que la cuenta ya tiene no cuenta como cambio.
function evaluarGestion(actor, objetivo, cambios = {}) {
  if (!esAdministrador(actor)) return denegar(403, 'Solo un administrador gestiona cuentas.');

  const propia = actor.id === objetivo.id;
  const cambiaRol = cambios.rol !== undefined && cambios.rol !== objetivo.rol;
  const cambiaEstado = cambios.activo !== undefined && cambios.activo !== objetivo.activo;

  // La cuenta principal solo la toca su titular: ni un administrador común ni otro principal.
  if (esPrincipal(objetivo) && !propia) {
    return denegar(403, 'La cuenta del administrador principal solo la puede modificar su titular.');
  }
  if (propia && (cambiaRol || cambiaEstado || cambios.eliminar)) {
    return denegar(409, 'No puedes cambiar tu propio rol, desactivar ni eliminar tu propia cuenta.');
  }
  if (!esPrincipal(actor) && !propia) {
    if (objetivo.rol !== TECNICO) {
      return denegar(403, 'Un administrador solo gestiona cuentas de técnicos. Pide al administrador principal que gestione esta cuenta.');
    }
    if (cambios.rol !== undefined && cambios.rol !== TECNICO) {
      return denegar(403, 'Solo el administrador principal puede promover a un técnico a administrador.');
    }
  }
  return PERMITIDO;
}

// Lo que la interfaz puede ofrecer sobre una cuenta (el servidor sigue validando cada acción).
function permisosSobre(actor, objetivo) {
  return {
    editar: evaluarGestion(actor, objetivo).permitido,
    cambiarEstado: evaluarGestion(actor, objetivo, { activo: !objetivo.activo }).permitido,
    eliminar: evaluarGestion(actor, objetivo, { eliminar: true }).permitido,
  };
}

module.exports = { evaluarCreacion, evaluarGestion, permisosSobre };
