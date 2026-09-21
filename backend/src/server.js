require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');

const authRoutes = require('./routes/auth.routes');
const equiposRoutes = require('./routes/equipos.routes');
const usuariosRoutes = require('./routes/usuarios.routes');
const tareasMantenimientoRoutes = require('./routes/tareasMantenimiento.routes');
const planesMantenimientoRoutes = require('./routes/planesMantenimiento.routes');
const mantenimientosProgramadosRoutes = require('./routes/mantenimientosProgramados.routes');
const ejecucionesRoutes = require('./routes/ejecuciones.routes');
const ordenesTrabajoRoutes = require('./routes/ordenesTrabajo.routes');
const alertasRoutes = require('./routes/alertas.routes');
const { registrarAuditoria } = require('./middleware/auditoria');

// ISO 25010 (Seguridad) — fail-fast: si falta un secreto de firma robusto,
// el servidor ni siquiera arranca en vez de correr con una llave débil por
// defecto (error común que deja producción con la clave de ejemplo del repo).
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 16) {
  console.error('JWT_SECRET no está configurado o es demasiado corto (mínimo 16 caracteres). Revisa tu archivo .env.');
  process.exit(1);
}

const app = express();

// ISO 25010 (Seguridad) — cabeceras HTTP seguras por defecto (protege contra
// clickjacking, sniffing de MIME type, y expone menos huella del stack).
app.use(helmet());

app.use(cors());
app.use(express.json());

// Ley 1581 Art. 4 (Responsabilidad) / ISO 19011 (trazabilidad) — bitácora de
// auditoría de toda operación de escritura, con quién la hizo y cuándo.
app.use(registrarAuditoria);

// ISO 25010 (Seguridad) — protección contra fuerza bruta: máximo 10 intentos
// de login por IP cada 15 minutos. Sin esto, nada impide probar contraseñas
// de forma automatizada contra /api/auth/login.
const limitadorLogin = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Demasiados intentos de inicio de sesión. Intenta de nuevo en unos minutos.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Sirve las fotos/manuales subidos (Sprint 1 — almacenamiento local).
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.get('/api/health', (req, res) => {
  res.json({ estado: 'ok', servicio: 'thi-cmms-backend', sprints: [1, 2, 3, 4] });
});

app.use('/api/auth/login', limitadorLogin);
app.use('/api/auth', authRoutes);
app.use('/api/equipos', equiposRoutes);

// Sprint 2 — Planificación del mantenimiento (HU4, HU5, HU6, HU7, HU8)
app.use('/api/usuarios', usuariosRoutes);
app.use('/api/tareas-mantenimiento', tareasMantenimientoRoutes);
app.use('/api/planes-mantenimiento', planesMantenimientoRoutes);
app.use('/api/mantenimientos-programados', mantenimientosProgramadosRoutes);

// Sprint 3 — Ejecución del mantenimiento (HU9, HU10, HU11, HU12, HU13)
app.use('/api/ejecuciones', ejecucionesRoutes);

// Sprint 4 — Ordenes de trabajo y alertas (HU14, HU15, HU16, HU17, HU18)
app.use('/api/ordenes-trabajo', ordenesTrabajoRoutes);
app.use('/api/alertas', alertasRoutes);

// Manejador de errores de multer y otros errores no capturados en rutas
// (evita que un archivo inválido, p. ej., tumbe el proceso sin respuesta).
app.use((err, req, res, next) => {
  console.error('Error no controlado:', err.message);
  res.status(400).json({ error: err.message || 'Error al procesar la solicitud.' });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`API del CMMS THI S.A.S. escuchando en http://localhost:${PORT}`);
});
