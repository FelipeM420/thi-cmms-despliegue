const express = require('express');
const {
  listar,
  obtener,
  actualizar,
  agregarInsumo,
  actualizarInsumo,
  eliminarInsumo,
  agregarPendiente,
  actualizarPendiente,
  eliminarPendiente,
  finalizar,
} = require('../controllers/ejecuciones.controller');
const prisma = require('../config/prisma');
const { verificarToken, requiereRol } = require('../middleware/auth');
const { crearSubida } = require('../middleware/subidaArchivos');
const { respaldoEnBase } = require('../utils/respaldoArchivos');
const { respaldarEvidenciasEnDrive } = require('../services/googleDriveRespaldo.service');
const { crearAutorizadorEjecucion } = require('../middleware/autorizarEjecucion');
const { crearRequiereConsentimiento } = require('../middleware/consentimiento');

const router = express.Router();

// HU9 — evidencia fotográfica antes / después. Mismo patrón que equipos.routes:
// almacenamiento local con copia en la base, solo PNG o JPG, 10 MB. Fase 3: una
// vez guardada la ejecución, copia en segundo plano a Google Drive (Antes / Después).
const subirEvidencias = crearSubida(
  {
    evidenciaAntes: { tipo: 'imagen', etiqueta: 'La evidencia fotográfica' },
    evidenciaDespues: { tipo: 'imagen', etiqueta: 'La evidencia fotográfica' },
  },
  { respaldo: respaldoEnBase, copiaExterna: respaldarEvidenciasEnDrive }
);

// Se autoriza ANTES de leer la subida: un usuario sin acceso a la ejecución no
// llega a escribir archivos en disco.
const autorizarEjecucion = crearAutorizadorEjecucion(prisma);

// Ley 1581 — la firma y las fotografías son datos personales: quien registra o
// cierra una ejecución debe haber aceptado antes el aviso de tratamiento.
const requiereConsentimiento = crearRequiereConsentimiento(prisma);

router.use(verificarToken);

// HU9/HU12 — listado transversal de ejecuciones (base para reportes S5).
router.get('/', requiereRol('ADMINISTRADOR'), listar);

// Detalle y edición: el controlador restringe a admin o técnico dueño.
router.get('/:id', obtener);
router.put('/:id', autorizarEjecucion, requiereConsentimiento, ...subirEvidencias, actualizar);
router.post('/:id/finalizar', requiereConsentimiento, finalizar);

// HU11 — insumos / consumibles / repuestos.
router.post('/:id/insumos', agregarInsumo);
router.put('/:id/insumos/:lineaId', actualizarInsumo);
router.delete('/:id/insumos/:lineaId', eliminarInsumo);

// HU13 — hallazgos / tareas pendientes.
router.post('/:id/pendientes', agregarPendiente);
router.put('/:id/pendientes/:pendienteId', actualizarPendiente);
router.delete('/:id/pendientes/:pendienteId', eliminarPendiente);

module.exports = router;
