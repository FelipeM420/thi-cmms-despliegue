const express = require('express');
const { login, me, renovar, logout } = require('../controllers/auth.controller');
const { verificarToken } = require('../middleware/auth');

const router = express.Router();

router.post('/login', login);
router.get('/me', verificarToken, me);
router.post('/refresh', renovar);
router.post('/logout', logout);

module.exports = router;
