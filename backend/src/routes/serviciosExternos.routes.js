const express = require('express');
const { listar, obtener, crear, actualizar } = require('../controllers/serviciosExternos.controller');
const { verificarToken, requiereRol } = require('../middleware/auth');
const { crearSubida } = require('../middleware/subidaArchivos');

const router = express.Router();

// HU1 — mantenimiento externo. Es información contable (costos facturados por
// proveedores): todo el módulo es solo para el administrador, y el rol se
// comprueba antes de leer cualquier subida.
router.use(verificarToken, requiereRol('ADMINISTRADOR'));

// Informe del proveedor (manual, garantía o certificado), solo PDF.
const subirInforme = crearSubida({ informe: { tipo: 'pdf', etiqueta: 'El informe del servicio' } });

router.get('/', listar);
router.get('/:id', obtener);
router.post('/', ...subirInforme, crear);
router.put('/:id', ...subirInforme, actualizar);

module.exports = router;
