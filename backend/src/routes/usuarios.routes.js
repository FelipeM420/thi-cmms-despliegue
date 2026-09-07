const express = require('express');
const { listarTecnicos } = require('../controllers/usuarios.controller');
const { verificarToken, requiereRol } = require('../middleware/auth');

const router = express.Router();

router.use(verificarToken);

// Soporte HU7 — lista de técnicos asignables (selector del administrador).
router.get('/tecnicos', requiereRol('ADMINISTRADOR'), listarTecnicos);

module.exports = router;
