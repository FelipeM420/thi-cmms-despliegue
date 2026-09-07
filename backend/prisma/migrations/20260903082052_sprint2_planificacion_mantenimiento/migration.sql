-- CreateEnum
CREATE TYPE "FrecuenciaMantenimiento" AS ENUM ('DIARIA', 'SEMANAL', 'QUINCENAL', 'MENSUAL', 'BIMESTRAL', 'TRIMESTRAL', 'SEMESTRAL', 'ANUAL');

-- CreateEnum
CREATE TYPE "PrioridadMantenimiento" AS ENUM ('BAJA', 'MEDIA', 'ALTA', 'CRITICA');

-- CreateEnum
CREATE TYPE "EstadoMantenimientoProgramado" AS ENUM ('PROGRAMADO', 'ASIGNADO', 'EN_EJECUCION', 'COMPLETADO', 'NO_EJECUTADO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "OrigenMantenimiento" AS ENUM ('MANUAL', 'AUTOMATICO');

-- CreateTable
CREATE TABLE "tareas_mantenimiento" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "recursos" TEXT,
    "duracionEstimadaMin" INTEGER,
    "frecuenciaSugerida" "FrecuenciaMantenimiento",
    "tipoMantenimiento" "ResponsableMantenimiento" NOT NULL DEFAULT 'INTERNO',
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "creadaPorId" TEXT NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tareas_mantenimiento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "planes_mantenimiento" (
    "id" TEXT NOT NULL,
    "equipoId" TEXT NOT NULL,
    "tareaId" TEXT NOT NULL,
    "frecuencia" "FrecuenciaMantenimiento" NOT NULL,
    "fechaInicio" TIMESTAMP(3) NOT NULL,
    "prioridadPorDefecto" "PrioridadMantenimiento" NOT NULL DEFAULT 'MEDIA',
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "proximaGeneracionHasta" TIMESTAMP(3),
    "creadoPorId" TEXT NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "planes_mantenimiento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mantenimientos_programados" (
    "id" TEXT NOT NULL,
    "equipoId" TEXT NOT NULL,
    "tareaId" TEXT NOT NULL,
    "planId" TEXT,
    "fechaProgramada" TIMESTAMP(3) NOT NULL,
    "prioridad" "PrioridadMantenimiento" NOT NULL DEFAULT 'MEDIA',
    "estado" "EstadoMantenimientoProgramado" NOT NULL DEFAULT 'PROGRAMADO',
    "origen" "OrigenMantenimiento" NOT NULL DEFAULT 'MANUAL',
    "notas" TEXT,
    "tecnicoAsignadoId" TEXT,
    "asignadoPorId" TEXT,
    "fechaAsignacion" TIMESTAMP(3),
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mantenimientos_programados_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tareas_mantenimiento_activa_idx" ON "tareas_mantenimiento"("activa");

-- CreateIndex
CREATE INDEX "planes_mantenimiento_activo_idx" ON "planes_mantenimiento"("activo");

-- CreateIndex
CREATE UNIQUE INDEX "planes_mantenimiento_equipoId_tareaId_key" ON "planes_mantenimiento"("equipoId", "tareaId");

-- CreateIndex
CREATE INDEX "mantenimientos_programados_fechaProgramada_idx" ON "mantenimientos_programados"("fechaProgramada");

-- CreateIndex
CREATE INDEX "mantenimientos_programados_estado_idx" ON "mantenimientos_programados"("estado");

-- CreateIndex
CREATE INDEX "mantenimientos_programados_tecnicoAsignadoId_idx" ON "mantenimientos_programados"("tecnicoAsignadoId");

-- CreateIndex
CREATE INDEX "mantenimientos_programados_equipoId_idx" ON "mantenimientos_programados"("equipoId");

-- AddForeignKey
ALTER TABLE "tareas_mantenimiento" ADD CONSTRAINT "tareas_mantenimiento_creadaPorId_fkey" FOREIGN KEY ("creadaPorId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planes_mantenimiento" ADD CONSTRAINT "planes_mantenimiento_equipoId_fkey" FOREIGN KEY ("equipoId") REFERENCES "equipos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planes_mantenimiento" ADD CONSTRAINT "planes_mantenimiento_tareaId_fkey" FOREIGN KEY ("tareaId") REFERENCES "tareas_mantenimiento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planes_mantenimiento" ADD CONSTRAINT "planes_mantenimiento_creadoPorId_fkey" FOREIGN KEY ("creadoPorId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mantenimientos_programados" ADD CONSTRAINT "mantenimientos_programados_equipoId_fkey" FOREIGN KEY ("equipoId") REFERENCES "equipos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mantenimientos_programados" ADD CONSTRAINT "mantenimientos_programados_tareaId_fkey" FOREIGN KEY ("tareaId") REFERENCES "tareas_mantenimiento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mantenimientos_programados" ADD CONSTRAINT "mantenimientos_programados_planId_fkey" FOREIGN KEY ("planId") REFERENCES "planes_mantenimiento"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mantenimientos_programados" ADD CONSTRAINT "mantenimientos_programados_tecnicoAsignadoId_fkey" FOREIGN KEY ("tecnicoAsignadoId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mantenimientos_programados" ADD CONSTRAINT "mantenimientos_programados_asignadoPorId_fkey" FOREIGN KEY ("asignadoPorId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;
