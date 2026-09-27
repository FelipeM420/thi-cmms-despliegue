// Reglas de acceso compartidas entre controladores y middlewares.

// El administrador opera sobre cualquier mantenimiento; el técnico solo sobre
// los que tiene asignados (HU8, HU9).
function puedeOperarMantenimiento(usuario, mantenimiento) {
  return usuario.rol === 'ADMINISTRADOR' || mantenimiento.tecnicoAsignadoId === usuario.sub;
}

module.exports = { puedeOperarMantenimiento };
