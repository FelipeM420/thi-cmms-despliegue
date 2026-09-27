const express = require('express');
const { listar, obtener, crear, actualizar } = require('../controllers/equipos.controller');
const { verificarToken, requiereRol } = require('../middleware/auth');
const { crearSubida } = require('../middleware/subidaArchivos');

const router = express.Router();

// Almacenamiento local de fotos y manuales (ver nota en .env.example sobre
// migrar a almacenamiento en la nube fuera de la fase de tesis). La validación
// de tipo, nombre y contenido vive en middleware/subidaArchivos.js.
const camposArchivo = crearSubida({
  foto: { tipo: 'imagen', etiqueta: 'El registro fotográfico' },
  manual: { tipo: 'pdf', etiqueta: 'El manual del equipo' },
});

// Todas las rutas de equipos requieren sesión activa.
router.use(verificarToken);

router.get('/', listar); // HU3 — administrador y técnico pueden consultar
router.get('/:id', obtener);

// HU1 / HU2 — solo administrador registra o edita equipos, según el rol
// definido en la pantalla de Login del prototipo (toggle Administrador/Técnico).
// requiereRol va antes de la subida: un técnico no llega a escribir archivos.
router.post('/', requiereRol('ADMINISTRADOR'), ...camposArchivo, crear);
router.put('/:id', requiereRol('ADMINISTRADOR'), ...camposArchivo, actualizar);

module.exports = router;
