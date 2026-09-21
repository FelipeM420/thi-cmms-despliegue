const express = require('express');
const {
  listar,
  resumen,
  generar,
  marcarLeida,
  marcarResuelta,
  marcarTodasLeidas,
} = require('../controllers/alertas.controller');
const { verificarToken, requiereRol } = require('../middleware/auth');

const router = express.Router();

// HU17 (alertas preventivas) · HU18 (mantenimientos vencidos).
router.use(verificarToken);

// Rutas literales antes de '/:id/...' para que no las capture el parámetro.
router.get('/resumen', resumen);
router.patch('/leer-todas', marcarTodasLeidas);

// Listado: el controlador acota al técnico a las alertas dirigidas a él.
router.get('/', listar);

// Motor de generación — solo administrador (o una tarea programada del sistema).
router.post('/generar', requiereRol('ADMINISTRADOR'), generar);

router.patch('/:id/leer', marcarLeida);
router.patch('/:id/resolver', marcarResuelta);

module.exports = router;
