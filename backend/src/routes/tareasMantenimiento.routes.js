const express = require('express');
const { listar, obtener, crear, actualizar } = require('../controllers/tareasMantenimiento.controller');
const { verificarToken, requiereRol } = require('../middleware/auth');

const router = express.Router();

// HU4 — Definir tareas de mantenimiento preventivo.
router.use(verificarToken);

router.get('/', listar); // consultan administrador y técnico
router.get('/:id', obtener);

// Solo el administrador define o edita las tareas del catálogo.
router.post('/', requiereRol('ADMINISTRADOR'), crear);
router.put('/:id', requiereRol('ADMINISTRADOR'), actualizar);

module.exports = router;
