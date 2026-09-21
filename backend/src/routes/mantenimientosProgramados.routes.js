const express = require('express');
const {
  listar,
  listarMios,
  obtener,
  crear,
  actualizar,
  asignar,
  reprogramar,
} = require('../controllers/mantenimientosProgramados.controller');
const {
  iniciar: iniciarEjecucion,
  obtenerPorMantenimiento: obtenerEjecucion,
} = require('../controllers/ejecuciones.controller');
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

// BPMN «Reprogramar mantenimiento» — clona una ocurrencia no ejecutada en una
// nueva fecha, conservando la original cerrada como evidencia.
router.post('/:id/reprogramar', requiereRol('ADMINISTRADOR'), reprogramar);

// HU9 (Sprint 3) — el técnico asignado (o el admin) abre / consulta la
// ejecución de este mantenimiento. El controlador de ejecuciones restringe
// el acceso.
router.post('/:id/ejecucion/iniciar', iniciarEjecucion);
router.get('/:id/ejecucion', obtenerEjecucion);

module.exports = router;
