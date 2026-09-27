const express = require('express');
const prisma = require('../config/prisma');
const { verificarToken } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/manejoErrores');
const { crearControladorConsentimiento } = require('../controllers/consentimiento.controller');

const router = express.Router();
const controlador = crearControladorConsentimiento(prisma);

// Cualquier usuario autenticado lee el aviso y acepta el suyo (Ley 1581).
router.use(verificarToken);
router.get('/', asyncHandler(controlador.obtener));
router.post('/', asyncHandler(controlador.aceptar));

module.exports = router;
