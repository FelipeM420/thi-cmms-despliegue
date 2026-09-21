-- CreateEnum
CREATE TYPE "EstadoOrdenTrabajo" AS ENUM ('EMITIDA', 'EN_PROCESO', 'CERRADA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "TipoAlerta" AS ENUM ('PREVENTIVA_15D', 'PREVENTIVA_8D', 'PREVENTIVA_1D', 'VENCIDA');

-- CreateEnum
CREATE TYPE "EstadoAlerta" AS ENUM ('PENDIENTE', 'LEIDA', 'RESUELTA');

-- CreateTable
CREATE TABLE "ordenes_trabajo" (
    "id" TEXT NOT NULL,
    "consecutivo" TEXT NOT NULL,
    "anio" INTEGER NOT NULL,
    "numero" INTEGER NOT NULL,
    "mantenimientoProgramadoId" TEXT,
    "equipoId" TEXT NOT NULL,
    "tareaId" TEXT,
    "tecnicoAsignadoId" TEXT,
    "emitidaPorId" TEXT NOT NULL,
    "descripcion" TEXT,
    "prioridad" "PrioridadMantenimiento" NOT NULL DEFAULT 'MEDIA',
    "estado" "EstadoOrdenTrabajo" NOT NULL DEFAULT 'EMITIDA',
    "origen" "OrigenMantenimiento" NOT NULL DEFAULT 'MANUAL',
    "fechaEmision" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaProgramada" TIMESTAMP(3),
    "fechaCierre" TIMESTAMP(3),
    "observacionesCierre" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ordenes_trabajo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alertas" (
    "id" TEXT NOT NULL,
    "tipo" "TipoAlerta" NOT NULL,
    "estado" "EstadoAlerta" NOT NULL DEFAULT 'PENDIENTE',
    "mantenimientoProgramadoId" TEXT NOT NULL,
    "equipoId" TEXT NOT NULL,
    "tecnicoDestinoId" TEXT,
    "mensaje" TEXT NOT NULL,
    "fechaProgramada" TIMESTAMP(3) NOT NULL,
    "diasAnticipacion" INTEGER,
    "leidaEn" TIMESTAMP(3),
    "resueltaEn" TIMESTAMP(3),
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "alertas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ordenes_trabajo_consecutivo_key" ON "ordenes_trabajo"("consecutivo");

-- CreateIndex
CREATE UNIQUE INDEX "ordenes_trabajo_mantenimientoProgramadoId_key" ON "ordenes_trabajo"("mantenimientoProgramadoId");

-- CreateIndex
CREATE INDEX "ordenes_trabajo_estado_idx" ON "ordenes_trabajo"("estado");

-- CreateIndex
CREATE INDEX "ordenes_trabajo_equipoId_idx" ON "ordenes_trabajo"("equipoId");

-- CreateIndex
CREATE INDEX "ordenes_trabajo_tecnicoAsignadoId_idx" ON "ordenes_trabajo"("tecnicoAsignadoId");

-- CreateIndex
CREATE INDEX "ordenes_trabajo_fechaEmision_idx" ON "ordenes_trabajo"("fechaEmision");

-- CreateIndex
CREATE UNIQUE INDEX "ordenes_trabajo_anio_numero_key" ON "ordenes_trabajo"("anio", "numero");

-- CreateIndex
CREATE INDEX "alertas_estado_idx" ON "alertas"("estado");

-- CreateIndex
CREATE INDEX "alertas_tipo_idx" ON "alertas"("tipo");

-- CreateIndex
CREATE INDEX "alertas_tecnicoDestinoId_idx" ON "alertas"("tecnicoDestinoId");

-- CreateIndex
CREATE INDEX "alertas_fechaProgramada_idx" ON "alertas"("fechaProgramada");

-- CreateIndex
CREATE UNIQUE INDEX "alertas_mantenimientoProgramadoId_tipo_key" ON "alertas"("mantenimientoProgramadoId", "tipo");

-- AddForeignKey
ALTER TABLE "ordenes_trabajo" ADD CONSTRAINT "ordenes_trabajo_mantenimientoProgramadoId_fkey" FOREIGN KEY ("mantenimientoProgramadoId") REFERENCES "mantenimientos_programados"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ordenes_trabajo" ADD CONSTRAINT "ordenes_trabajo_equipoId_fkey" FOREIGN KEY ("equipoId") REFERENCES "equipos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ordenes_trabajo" ADD CONSTRAINT "ordenes_trabajo_tareaId_fkey" FOREIGN KEY ("tareaId") REFERENCES "tareas_mantenimiento"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ordenes_trabajo" ADD CONSTRAINT "ordenes_trabajo_tecnicoAsignadoId_fkey" FOREIGN KEY ("tecnicoAsignadoId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ordenes_trabajo" ADD CONSTRAINT "ordenes_trabajo_emitidaPorId_fkey" FOREIGN KEY ("emitidaPorId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alertas" ADD CONSTRAINT "alertas_mantenimientoProgramadoId_fkey" FOREIGN KEY ("mantenimientoProgramadoId") REFERENCES "mantenimientos_programados"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alertas" ADD CONSTRAINT "alertas_equipoId_fkey" FOREIGN KEY ("equipoId") REFERENCES "equipos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alertas" ADD CONSTRAINT "alertas_tecnicoDestinoId_fkey" FOREIGN KEY ("tecnicoDestinoId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;
