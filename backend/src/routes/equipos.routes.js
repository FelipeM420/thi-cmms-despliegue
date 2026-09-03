const express = require('express');
const multer = require('multer');
const path = require('path');
const { listar, obtener, crear, actualizar } = require('../controllers/equipos.controller');
const { verificarToken, requiereRol } = require('../middleware/auth');

const router = express.Router();

// Almacenamiento local de fotos y manuales (ver nota en .env.example sobre
// migrar a almacenamiento en la nube fuera de la fase de tesis).
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, process.env.UPLOADS_DIR || 'src/uploads'),
  filename: (req, file, cb) => {
    const sufijoUnico = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, file.fieldname + '-' + sufijoUnico + path.extname(file.originalname));
  },
});

const filtroArchivo = (req, file, cb) => {
  if (file.fieldname === 'foto' && !file.mimetype.startsWith('image/')) {
    return cb(new Error('El registro fotográfico debe ser una imagen (PNG o JPG).'));
  }
  if (file.fieldname === 'manual' && file.mimetype !== 'application/pdf') {
    return cb(new Error('El manual del equipo debe ser un archivo PDF.'));
  }
  cb(null, true);
};

const upload = multer({
  storage,
  fileFilter: filtroArchivo,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB por archivo
});

const camposArchivo = upload.fields([
  { name: 'foto', maxCount: 1 },
  { name: 'manual', maxCount: 1 },
]);

// Todas las rutas de equipos requieren sesión activa.
router.use(verificarToken);

router.get('/', listar); // HU3 — administrador y técnico pueden consultar
router.get('/:id', obtener);

// HU1 / HU2 — solo administrador registra o edita equipos, según el rol
// definido en la pantalla de Login del prototipo (toggle Administrador/Técnico).
router.post('/', requiereRol('ADMINISTRADOR'), camposArchivo, crear);
router.put('/:id', requiereRol('ADMINISTRADOR'), camposArchivo, actualizar);

module.exports = router;
