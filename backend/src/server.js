require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const authRoutes = require('./routes/auth.routes');
const equiposRoutes = require('./routes/equipos.routes');
const usuariosRoutes = require('./routes/usuarios.routes');
const tareasMantenimientoRoutes = require('./routes/tareasMantenimiento.routes');
const planesMantenimientoRoutes = require('./routes/planesMantenimiento.routes');
const mantenimientosProgramadosRoutes = require('./routes/mantenimientosProgramados.routes');
const ejecucionesRoutes = require('./routes/ejecuciones.routes');
const ordenesTrabajoRoutes = require('./routes/ordenesTrabajo.routes');
const alertasRoutes = require('./routes/alertas.routes');
const serviciosExternosRoutes = require('./routes/serviciosExternos.routes');
const consentimientoRoutes = require('./routes/consentimiento.routes');
const reportesRoutes = require('./routes/reportes.routes');
const { registrarAuditoria, registrarAccesoArchivo, registrarEventoSistema } = require('./middleware/auditoria');
const { manejadorErrores } = require('./middleware/manejoErrores');
const { crearServidorArchivos } = require('./middleware/servidorArchivos');
const { crearLimitadorEscrituras, crearLimitadorArchivos } = require('./middleware/limitadores');
const { directorioUploads } = require('./config/uploads');
const prisma = require('./config/prisma');
const { generarAlertas } = require('./utils/alertas');
const { generarOrdenesAutomaticas } = require('./utils/ordenesAutomaticas');
const { validarSecretoJwt } = require('./config/secretoJwt');

// ISO 25010 (Seguridad) — fail-fast: si falta un secreto de firma robusto, o es
// uno de ejemplo o uno que estuvo publicado en el repositorio, el servidor ni
// siquiera arranca en vez de correr con una llave conocida.
const validacionSecreto = validarSecretoJwt(process.env.JWT_SECRET);
if (!validacionSecreto.valido) {
  console.error(`${validacionSecreto.motivo} Revisa tu archivo .env.`);
  console.error("Genera uno con: node -e \"console.log(require('crypto').randomBytes(48).toString('hex'))\"");
  process.exit(1);
}

const app = express();

// ISO 25010 (Seguridad) — cabeceras HTTP seguras por defecto (protege contra
// clickjacking, sniffing de MIME type, y expone menos huella del stack).
app.use(helmet());

app.use(cors());
app.use(express.json());

// ISO 25010 (Seguridad) — tope de escrituras por IP ANTES de la bitácora: un
// bucle de peticiones recibe 429 y no llena el disco con líneas de auditoría.
app.use(crearLimitadorEscrituras());

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

// Fotos, manuales y evidencias subidos (almacenamiento local). Solo con sesión:
// ver middleware/servidorArchivos.js (cookie HttpOnly emitida al iniciar sesión).
app.use(
  '/uploads',
  crearLimitadorArchivos(),
  crearServidorArchivos({
    prisma,
    directorio: directorioUploads(),
    secreto: process.env.JWT_SECRET,
    registrarLectura: registrarAccesoArchivo,
  })
);

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

// HU1 — mantenimiento externo (servicios contratados a proveedores)
app.use('/api/servicios-externos', serviciosExternosRoutes);

// Ley 1581 — aviso de tratamiento de datos personales y su aceptación
app.use('/api/consentimiento', consentimientoRoutes);

// Sprint 5 — indicadores y reportes (HU19-HU23), solo administrador
app.use('/api/reportes', reportesRoutes);

// Manejador central de errores (multer, JSON mal formado y todo lo que un
// controlador deje escapar con asyncHandler). Rechazos del cliente -> 4xx con
// su mensaje; fallos internos -> 500 genérico, sin filtrar detalles.
app.use(manejadorErrores);

// Los motores corren solos: una pasada al arrancar y otra cada 12 horas. Los dos
// son idempotentes, asi que repetirlos no duplica nada.
const INTERVALO_MOTORES_MS = 12 * 60 * 60 * 1000;

// HU14 — cada OT consume un consecutivo institucional, asi que la generacion
// automatica se puede apagar (GENERAR_OT_AUTOMATICAS=false) sin tocar el codigo.
const GENERAR_OT_AUTOMATICAS = process.env.GENERAR_OT_AUTOMATICAS !== 'false';

async function ejecutarMotorDeOrdenes() {
  if (!GENERAR_OT_AUTOMATICAS) return;
  try {
    const { generadas, consecutivos } = await generarOrdenesAutomaticas(prisma, {
      registrarEvento: registrarEventoSistema,
      registrarError: (mensaje, error) => console.error(`Motor de OT: ${mensaje}:`, error.message),
    });
    if (generadas > 0) {
      console.log(`Motor de OT: ${generadas} orden(es) de trabajo generada(s): ${consecutivos.join(', ')}.`);
    }
  } catch (error) {
    // Un fallo del motor no debe tumbar el servidor: se reintenta al siguiente ciclo.
    console.error('Motor de OT: no se pudo completar la generacion automatica:', error.message);
  }
}

// HU17/HU18 — alertas preventivas y de vencimiento.

async function ejecutarMotorDeAlertas() {
  try {
    const { generadas, revisados } = await generarAlertas(prisma);
    if (generadas > 0) {
      console.log(`Motor de alertas: ${generadas} alerta(s) generada(s) de ${revisados} mantenimientos revisados.`);
    }
  } catch (error) {
    // Un fallo del motor no debe tumbar el servidor: se reintenta al
    // siguiente ciclo.
    console.error('Motor de alertas: no se pudo completar la generacion automatica:', error.message);
  }
}

// Primero las OT y despues las alertas: ambas leen el cronograma, ninguna depende de la otra.
async function ejecutarMotores() {
  await ejecutarMotorDeOrdenes();
  await ejecutarMotorDeAlertas();
}

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`API del CMMS THI S.A.S. escuchando en http://localhost:${PORT}`);
  ejecutarMotores();
  setInterval(ejecutarMotores, INTERVALO_MOTORES_MS);
});
