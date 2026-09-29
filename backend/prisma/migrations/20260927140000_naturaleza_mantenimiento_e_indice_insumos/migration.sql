-- Sprint 5 (HU19, HU20, HU22): tipo de mantenimiento interno e índice de consumo.
-- Escrita a mano: ante el cambio de nombre del enum, Prisma generaría "borrar y
-- volver a crear la columna naturaleza de servicios_externos", perdiendo los datos.

-- 1. La naturaleza deja de ser exclusiva de los servicios externos. Renombrar
--    el tipo conserva los valores ya guardados.
ALTER TYPE "NaturalezaServicioExterno" RENAME TO "NaturalezaMantenimiento";

-- 2. Naturaleza del mantenimiento interno. Todo lo existente salió del
--    cronograma preventivo, así que el valor por defecto es exacto. Con DEFAULT
--    constante, PostgreSQL agrega la columna sin reescribir la tabla.
ALTER TABLE "mantenimientos_programados"
    ADD COLUMN "naturaleza" "NaturalezaMantenimiento" NOT NULL DEFAULT 'PREVENTIVO';

-- 3. HU22 agrupa el consumo de recursos por insumo del inventario.
CREATE INDEX "insumos_utilizados_equipoInsumoId_idx" ON "insumos_utilizados"("equipoInsumoId");
