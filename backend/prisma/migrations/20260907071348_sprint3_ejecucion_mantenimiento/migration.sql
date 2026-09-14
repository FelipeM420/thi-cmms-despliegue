-- CreateEnum
CREATE TYPE "MotivoNoEjecucion" AS ENUM ('FALTA_INSUMOS', 'FALTA_PERSONAL', 'OTRO');

-- CreateTable
CREATE TABLE "registros_ejecucion" (
    "id" TEXT NOT NULL,
    "mantenimientoProgramadoId" TEXT NOT NULL,
    "tecnicoId" TEXT NOT NULL,
    "fechaEjecucion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "horaInicio" TIMESTAMP(3),
    "horaFin" TIMESTAMP(3),
    "minutosPausa" INTEGER NOT NULL DEFAULT 0,
    "minutosTrabajados" INTEGER,
    "numeroTecnicos" INTEGER NOT NULL DEFAULT 1,
    "observaciones" TEXT,
    "firmaTecnico" TEXT,
    "evidenciaAntesUrl" TEXT,
    "evidenciaDespuesUrl" TEXT,
    "motivoNoEjecucion" TEXT,
    "categoriaNoEjecucion" "MotivoNoEjecucion",
    "valorHoraManoObra" DECIMAL(14,2),
    "costoManoObra" DECIMAL(14,2),
    "costoInsumos" DECIMAL(14,2),
    "costoTotal" DECIMAL(14,2),
    "finalizadoEn" TIMESTAMP(3),
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "registros_ejecucion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "insumos_utilizados" (
    "id" TEXT NOT NULL,
    "registroEjecucionId" TEXT NOT NULL,
    "descripcion" TEXT NOT NULL,
    "equipoInsumoId" TEXT,
    "cantidad" DECIMAL(14,2) NOT NULL,
    "unidad" TEXT,
    "costoUnitario" DECIMAL(14,2),
    "costoLinea" DECIMAL(14,2),
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "insumos_utilizados_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tareas_pendientes" (
    "id" TEXT NOT NULL,
    "registroEjecucionId" TEXT NOT NULL,
    "descripcion" TEXT NOT NULL,
    "categoria" "MotivoNoEjecucion" NOT NULL,
    "prioridad" "PrioridadMantenimiento" NOT NULL DEFAULT 'MEDIA',
    "resuelta" BOOLEAN NOT NULL DEFAULT false,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tareas_pendientes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "registros_ejecucion_mantenimientoProgramadoId_key" ON "registros_ejecucion"("mantenimientoProgramadoId");

-- CreateIndex
CREATE INDEX "registros_ejecucion_tecnicoId_idx" ON "registros_ejecucion"("tecnicoId");

-- CreateIndex
CREATE INDEX "registros_ejecucion_fechaEjecucion_idx" ON "registros_ejecucion"("fechaEjecucion");

-- CreateIndex
CREATE INDEX "insumos_utilizados_registroEjecucionId_idx" ON "insumos_utilizados"("registroEjecucionId");

-- CreateIndex
CREATE INDEX "tareas_pendientes_registroEjecucionId_idx" ON "tareas_pendientes"("registroEjecucionId");

-- CreateIndex
CREATE INDEX "tareas_pendientes_resuelta_idx" ON "tareas_pendientes"("resuelta");

-- AddForeignKey
ALTER TABLE "registros_ejecucion" ADD CONSTRAINT "registros_ejecucion_mantenimientoProgramadoId_fkey" FOREIGN KEY ("mantenimientoProgramadoId") REFERENCES "mantenimientos_programados"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registros_ejecucion" ADD CONSTRAINT "registros_ejecucion_tecnicoId_fkey" FOREIGN KEY ("tecnicoId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "insumos_utilizados" ADD CONSTRAINT "insumos_utilizados_registroEjecucionId_fkey" FOREIGN KEY ("registroEjecucionId") REFERENCES "registros_ejecucion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "insumos_utilizados" ADD CONSTRAINT "insumos_utilizados_equipoInsumoId_fkey" FOREIGN KEY ("equipoInsumoId") REFERENCES "equipos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tareas_pendientes" ADD CONSTRAINT "tareas_pendientes_registroEjecucionId_fkey" FOREIGN KEY ("registroEjecucionId") REFERENCES "registros_ejecucion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
