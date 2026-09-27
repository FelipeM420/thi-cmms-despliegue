-- DropForeignKey
ALTER TABLE "alertas" DROP CONSTRAINT "alertas_mantenimientoProgramadoId_fkey";

-- DropForeignKey
ALTER TABLE "alertas" DROP CONSTRAINT "alertas_tecnicoDestinoId_fkey";

-- DropForeignKey
ALTER TABLE "insumos_utilizados" DROP CONSTRAINT "insumos_utilizados_equipoInsumoId_fkey";

-- DropForeignKey
ALTER TABLE "insumos_utilizados" DROP CONSTRAINT "insumos_utilizados_registroEjecucionId_fkey";

-- DropForeignKey
ALTER TABLE "mantenimientos_programados" DROP CONSTRAINT "mantenimientos_programados_asignadoPorId_fkey";

-- DropForeignKey
ALTER TABLE "mantenimientos_programados" DROP CONSTRAINT "mantenimientos_programados_planId_fkey";

-- DropForeignKey
ALTER TABLE "mantenimientos_programados" DROP CONSTRAINT "mantenimientos_programados_reprogramadoDeId_fkey";

-- DropForeignKey
ALTER TABLE "mantenimientos_programados" DROP CONSTRAINT "mantenimientos_programados_tecnicoAsignadoId_fkey";

-- DropForeignKey
ALTER TABLE "ordenes_trabajo" DROP CONSTRAINT "ordenes_trabajo_mantenimientoProgramadoId_fkey";

-- DropForeignKey
ALTER TABLE "ordenes_trabajo" DROP CONSTRAINT "ordenes_trabajo_tareaId_fkey";

-- DropForeignKey
ALTER TABLE "ordenes_trabajo" DROP CONSTRAINT "ordenes_trabajo_tecnicoAsignadoId_fkey";

-- DropForeignKey
ALTER TABLE "tareas_pendientes" DROP CONSTRAINT "tareas_pendientes_registroEjecucionId_fkey";

-- AddForeignKey
ALTER TABLE "mantenimientos_programados" ADD CONSTRAINT "mantenimientos_programados_planId_fkey" FOREIGN KEY ("planId") REFERENCES "planes_mantenimiento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mantenimientos_programados" ADD CONSTRAINT "mantenimientos_programados_tecnicoAsignadoId_fkey" FOREIGN KEY ("tecnicoAsignadoId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mantenimientos_programados" ADD CONSTRAINT "mantenimientos_programados_asignadoPorId_fkey" FOREIGN KEY ("asignadoPorId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mantenimientos_programados" ADD CONSTRAINT "mantenimientos_programados_reprogramadoDeId_fkey" FOREIGN KEY ("reprogramadoDeId") REFERENCES "mantenimientos_programados"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "insumos_utilizados" ADD CONSTRAINT "insumos_utilizados_registroEjecucionId_fkey" FOREIGN KEY ("registroEjecucionId") REFERENCES "registros_ejecucion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "insumos_utilizados" ADD CONSTRAINT "insumos_utilizados_equipoInsumoId_fkey" FOREIGN KEY ("equipoInsumoId") REFERENCES "equipos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tareas_pendientes" ADD CONSTRAINT "tareas_pendientes_registroEjecucionId_fkey" FOREIGN KEY ("registroEjecucionId") REFERENCES "registros_ejecucion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ordenes_trabajo" ADD CONSTRAINT "ordenes_trabajo_mantenimientoProgramadoId_fkey" FOREIGN KEY ("mantenimientoProgramadoId") REFERENCES "mantenimientos_programados"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ordenes_trabajo" ADD CONSTRAINT "ordenes_trabajo_tareaId_fkey" FOREIGN KEY ("tareaId") REFERENCES "tareas_mantenimiento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ordenes_trabajo" ADD CONSTRAINT "ordenes_trabajo_tecnicoAsignadoId_fkey" FOREIGN KEY ("tecnicoAsignadoId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alertas" ADD CONSTRAINT "alertas_mantenimientoProgramadoId_fkey" FOREIGN KEY ("mantenimientoProgramadoId") REFERENCES "mantenimientos_programados"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alertas" ADD CONSTRAINT "alertas_tecnicoDestinoId_fkey" FOREIGN KEY ("tecnicoDestinoId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
