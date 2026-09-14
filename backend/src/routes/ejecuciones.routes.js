const express = require('express');
const multer = require('multer');
const path = require('path');
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
const { verificarToken, requiereRol } = require('../middleware/auth');

const router = express.Router();

// HU9 — evidencia fotográfica antes / después. Mismo patrón que equipos.routes:
// almacenamiento local, solo imágenes, 10 MB.
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, process.env.UPLOADS_DIR || 'src/uploads'),
  filename: (req, file, cb) => {
    const sufijoUnico = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, file.fieldname + '-' + sufijoUnico + path.extname(file.originalname));
  },
});

const soloImagenes = (req, file, cb) => {
  if (!file.mimetype.startsWith('image/')) {
    return cb(new Error('La evidencia fotográfica debe ser una imagen (PNG o JPG).'));
  }
  cb(null, true);
};

const subirEvidencias = multer({
  storage,
  fileFilter: soloImagenes,
  limits: { fileSize: 10 * 1024 * 1024 },
}).fields([
  { name: 'evidenciaAntes', maxCount: 1 },
  { name: 'evidenciaDespues', maxCount: 1 },
]);

router.use(verificarToken);

// HU9/HU12 — listado transversal de ejecuciones (base para reportes S5).
router.get('/', requiereRol('ADMINISTRADOR'), listar);

// Detalle y edición: el controlador restringe a admin o técnico dueño.
router.get('/:id', obtener);
router.put('/:id', subirEvidencias, actualizar);
router.post('/:id/finalizar', finalizar);

// HU11 — insumos / consumibles / repuestos.
router.post('/:id/insumos', agregarInsumo);
router.put('/:id/insumos/:lineaId', actualizarInsumo);
router.delete('/:id/insumos/:lineaId', eliminarInsumo);

// HU13 — hallazgos / tareas pendientes.
router.post('/:id/pendientes', agregarPendiente);
router.put('/:id/pendientes/:pendienteId', actualizarPendiente);
router.delete('/:id/pendientes/:pendienteId', eliminarPendiente);

module.exports = router;
