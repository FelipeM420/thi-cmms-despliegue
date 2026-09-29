const express = require('express');
const { costos, equipos, areas, recursos, historial, resumen } = require('../controllers/reportes.controller');
const { verificarToken, requiereRol } = require('../middleware/auth');
const { crearLimitadorReportes } = require('../middleware/limitadores');

const router = express.Router();

// Sprint 5 — indicadores y reportes (HU19-HU23). Son información contable y de
// gestión (costos, horas por técnico): todo el módulo es solo para el
// administrador. El límite propio acota consultas y exportaciones repetidas.
router.use(verificarToken, requiereRol('ADMINISTRADOR'), crearLimitadorReportes());

router.get('/resumen', resumen);
router.get('/costos', costos);
router.get('/equipos', equipos);
router.get('/areas', areas);
router.get('/recursos', recursos);
router.get('/historial', historial);

module.exports = router;
