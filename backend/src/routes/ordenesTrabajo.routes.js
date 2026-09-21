const express = require('express');
const {
  listar,
  obtener,
  crear,
  actualizar,
  cambiarEstado,
  descargarPdf,
} = require('../controllers/ordenesTrabajo.controller');
const { verificarToken, requiereRol } = require('../middleware/auth');

const router = express.Router();

// HU14 (emisión) · HU15 (PDF) · HU16 (historial).
router.use(verificarToken);

// Listado: el controlador acota al técnico a sus propias órdenes.
router.get('/', listar);
router.get('/:id', obtener);

// HU15 — descarga del PDF institucional.
router.get('/:id/pdf', descargarPdf);

// HU14 — emitir y editar: solo administrador.
router.post('/', requiereRol('ADMINISTRADOR'), crear);
router.put('/:id', requiereRol('ADMINISTRADOR'), actualizar);

// Ciclo de vida: el técnico asignado puede avanzar la suya (el controlador
// verifica el acceso y las transiciones válidas).
router.patch('/:id/estado', cambiarEstado);

module.exports = router;
