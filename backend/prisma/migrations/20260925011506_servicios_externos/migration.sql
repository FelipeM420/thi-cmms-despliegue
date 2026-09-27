-- CreateEnum
CREATE TYPE "NaturalezaServicioExterno" AS ENUM ('PREVENTIVO', 'CORRECTIVO');

-- CreateTable
CREATE TABLE "servicios_externos" (
    "id" TEXT NOT NULL,
    "equipoId" TEXT NOT NULL,
    "mantenimientoProgramadoId" TEXT,
    "proveedor" TEXT NOT NULL,
    "descripcion" TEXT NOT NULL,
    "naturaleza" "NaturalezaServicioExterno" NOT NULL,
    "fechaServicio" TIMESTAMP(3) NOT NULL,
    "numeroFactura" TEXT,
    "costoFacturado" DECIMAL(14,2) NOT NULL,
    "informePdfUrl" TEXT,
    "registradoPorId" TEXT NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "servicios_externos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "servicios_externos_mantenimientoProgramadoId_key" ON "servicios_externos"("mantenimientoProgramadoId");

-- CreateIndex
CREATE INDEX "servicios_externos_equipoId_fechaServicio_idx" ON "servicios_externos"("equipoId", "fechaServicio");

-- CreateIndex
CREATE INDEX "servicios_externos_fechaServicio_idx" ON "servicios_externos"("fechaServicio");

-- AddForeignKey
ALTER TABLE "servicios_externos" ADD CONSTRAINT "servicios_externos_equipoId_fkey" FOREIGN KEY ("equipoId") REFERENCES "equipos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "servicios_externos" ADD CONSTRAINT "servicios_externos_mantenimientoProgramadoId_fkey" FOREIGN KEY ("mantenimientoProgramadoId") REFERENCES "mantenimientos_programados"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "servicios_externos" ADD CONSTRAINT "servicios_externos_registradoPorId_fkey" FOREIGN KEY ("registradoPorId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CheckConstraint
-- Prisma no expresa CHECK en el esquema. El valor facturado no puede ser
-- negativo y el proveedor y la descripción (texto explicativo del servicio) no
-- pueden quedar en blanco: la validación de la API no basta para un registro
-- de retención.
ALTER TABLE "servicios_externos" ADD CONSTRAINT "servicios_externos_costo_no_negativo" CHECK ("costoFacturado" >= 0);
ALTER TABLE "servicios_externos" ADD CONSTRAINT "servicios_externos_textos_no_vacios" CHECK (btrim("proveedor") <> '' AND btrim("descripcion") <> '');
