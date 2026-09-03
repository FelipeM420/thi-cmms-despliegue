const { z } = require('zod');
const prisma = require('../config/prisma');

// Corresponde exactamente a los campos del formulario "Nuevo equipo" ya
// validado en el prototipo Figma (pantalla 04 · Equipos · Nuevo).
const equipoSchema = z.object({
  nombre: z.string().min(1, 'El nombre del equipo es obligatorio.'),
  referencia: z.string().min(1, 'La referencia / código interno es obligatoria.'),
  // BPMN "Registrar nuevo equipo" — paso "Registrar código serial" (distinto
  // de la referencia interna). Opcional porque no todo activo trae uno de
  // fábrica (ej. algunos consumibles), pero si llega, debe ser único.
  numeroSerie: z.string().optional(),
  marca: z.string().optional(),
  anioAdquisicion: z.coerce.number().int().optional(),
  zona: z.string().min(1, 'La zona / ubicación es obligatoria.'),
  tipoActivo: z.enum(['EQUIPO', 'INSUMO', 'MATERIA_PRIMA', 'CONSUMIBLE']).default('EQUIPO'),
  costo: z.coerce.number().nonnegative().optional(),
  descripcionTecnica: z.string().optional(),
  estado: z.enum(['ACTIVO', 'EN_MANTENIMIENTO', 'DADO_DE_BAJA']).default('ACTIVO'),
  tipoMantenimiento: z.enum(['INTERNO', 'EXTERNO']).default('INTERNO'),
});

// GET /api/equipos — HU3: listado con filtros (pantalla "Equipos · Listado")
// Soporta ?buscar=&zona=&tipoActivo=&estado=
async function listar(req, res) {
  try {
    const { buscar, zona, tipoActivo, estado } = req.query;

    const equipos = await prisma.equipo.findMany({
      where: {
        AND: [
          buscar
            ? {
                OR: [
                  { nombre: { contains: String(buscar), mode: 'insensitive' } },
                  { referencia: { contains: String(buscar), mode: 'insensitive' } },
                ],
              }
            : {},
          zona ? { zona: String(zona) } : {},
          tipoActivo ? { tipoActivo: String(tipoActivo) } : {},
          estado ? { estado: String(estado) } : {},
        ],
      },
      orderBy: { creadoEn: 'desc' },
      include: { registradoPor: { select: { nombre: true } } },
    });

    return res.json(equipos);
  } catch (error) {
    console.error('Error al listar equipos:', error);
    return res.status(500).json({ error: 'Error interno al listar equipos.' });
  }
}

// GET /api/equipos/:id — HU1/HU3: ficha técnica de detalle
async function obtener(req, res) {
  try {
    const equipo = await prisma.equipo.findUnique({
      where: { id: req.params.id },
      include: { registradoPor: { select: { nombre: true, email: true } } },
    });
    if (!equipo) {
      return res.status(404).json({ error: 'Equipo no encontrado.' });
    }
    return res.json(equipo);
  } catch (error) {
    console.error('Error al obtener equipo:', error);
    return res.status(500).json({ error: 'Error interno al consultar el equipo.' });
  }
}

// POST /api/equipos — HU1 (tarjeta maestra) + HU2 (clasificación)
// Solo ADMINISTRADOR (aplicado en la ruta vía middleware requiereRol).
async function crear(req, res) {
  const parseo = equipoSchema.safeParse(req.body);
  if (!parseo.success) {
    return res.status(400).json({ error: parseo.error.issues[0].message });
  }

  try {
    const yaExisteReferencia = await prisma.equipo.findUnique({ where: { referencia: parseo.data.referencia } });
    if (yaExisteReferencia) {
      return res.status(409).json({ error: `Ya existe un equipo con la referencia "${parseo.data.referencia}".` });
    }
    if (parseo.data.numeroSerie) {
      const yaExisteSerie = await prisma.equipo.findUnique({ where: { numeroSerie: parseo.data.numeroSerie } });
      if (yaExisteSerie) {
        return res.status(409).json({ error: `Ya existe un equipo con el número de serie "${parseo.data.numeroSerie}".` });
      }
    }

    const equipo = await prisma.equipo.create({
      data: {
        ...parseo.data,
        // multer (ver routes/equipos.routes.js) deja los archivos en req.files
        fotoUrl: req.files?.foto?.[0] ? `/uploads/${req.files.foto[0].filename}` : null,
        manualPdfUrl: req.files?.manual?.[0] ? `/uploads/${req.files.manual[0].filename}` : null,
        registradoPorId: req.usuario.sub,
      },
    });
    return res.status(201).json(equipo);
  } catch (error) {
    console.error('Error al crear equipo:', error);
    return res.status(500).json({ error: 'Error interno al registrar el equipo.' });
  }
}

// PUT /api/equipos/:id — edición (incluye cambio de estado, p. ej. dar de baja)
async function actualizar(req, res) {
  const parseo = equipoSchema.partial().safeParse(req.body);
  if (!parseo.success) {
    return res.status(400).json({ error: parseo.error.issues[0].message });
  }

  try {
    const datosActualizados = { ...parseo.data };
    if (req.files?.foto?.[0]) datosActualizados.fotoUrl = `/uploads/${req.files.foto[0].filename}`;
    if (req.files?.manual?.[0]) datosActualizados.manualPdfUrl = `/uploads/${req.files.manual[0].filename}`;

    const equipo = await prisma.equipo.update({
      where: { id: req.params.id },
      data: datosActualizados,
    });
    return res.json(equipo);
  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Equipo no encontrado.' });
    }
    console.error('Error al actualizar equipo:', error);
    return res.status(500).json({ error: 'Error interno al actualizar el equipo.' });
  }
}

module.exports = { listar, obtener, crear, actualizar };
