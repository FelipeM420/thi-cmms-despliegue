const express = require('express');
const {
  listar,
  obtener,
  crear,
  actualizar,
  generar,
} = require('../controllers/planesMantenimiento.controller');
const { verificarToken, requiereRol } = require('../middleware/auth');

const router = express.Router();

// HU6 — Gestionar la frecuencia del mantenimiento.
router.use(verificarToken);

router.get('/', listar);
router.get('/:id', obtener);

// Solo el administrador define la regla de frecuencia y dispara la generación.
router.post('/', requiereRol('ADMINISTRADOR'), crear);
router.put('/:id', requiereRol('ADMINISTRADOR'), actualizar);
router.post('/:id/generar', requiereRol('ADMINISTRADOR'), generar);

module.exports = router;
