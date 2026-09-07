const express = require('express');
const {
  listar,
  listarMios,
  obtener,
  crear,
  actualizar,
  asignar,
} = require('../controllers/mantenimientosProgramados.controller');
const { verificarToken, requiereRol } = require('../middleware/auth');

const router = express.Router();

// HU5 (programar) · HU7 (asignar) · HU8 (ver asignadas).
router.use(verificarToken);

// HU8 — el técnico consulta lo suyo. Debe ir antes de '/:id'.
router.get('/mios', listarMios);

// HU5 — vista de cronograma completa: solo administrador.
router.get('/', requiereRol('ADMINISTRADOR'), listar);

// Detalle: el controlador restringe al administrador o al técnico asignado.
router.get('/:id', obtener);

// HU5 — alta manual de una ocurrencia del cronograma.
router.post('/', requiereRol('ADMINISTRADOR'), crear);

// Reprogramar fecha / prioridad / notas / cancelar.
router.put('/:id', requiereRol('ADMINISTRADOR'), actualizar);

// HU7 — asignar a un técnico.
router.patch('/:id/asignar', requiereRol('ADMINISTRADOR'), asignar);

module.exports = router;
