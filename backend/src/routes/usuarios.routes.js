const express = require('express');
const {
  listarTecnicos,
  listarUsuarios,
  crearUsuario,
  actualizarUsuario,
  eliminarUsuario,
} = require('../controllers/usuarios.controller');
const { verificarToken, requiereRol } = require('../middleware/auth');

const router = express.Router();

router.use(verificarToken);

// Soporte HU7 — lista de técnicos asignables (selector del administrador).
router.get('/tecnicos', requiereRol('ADMINISTRADOR'), listarTecnicos);

// HU24 — gestión de cuentas. Entra cualquier administrador; qué cuentas puede tocar cada uno
// lo decide utils/permisosCuentas.js (el administrador principal gestiona a todos; un
// administrador común, solo a los técnicos).
router.get('/', requiereRol('ADMINISTRADOR'), listarUsuarios);
router.post('/', requiereRol('ADMINISTRADOR'), crearUsuario);
router.put('/:id', requiereRol('ADMINISTRADOR'), actualizarUsuario);
router.delete('/:id', requiereRol('ADMINISTRADOR'), eliminarUsuario);

module.exports = router;
