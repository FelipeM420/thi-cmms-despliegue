-- AlterTable
ALTER TABLE "mantenimientos_programados" ADD COLUMN     "reprogramadoDeId" TEXT;

-- AddForeignKey
ALTER TABLE "mantenimientos_programados" ADD CONSTRAINT "mantenimientos_programados_reprogramadoDeId_fkey" FOREIGN KEY ("reprogramadoDeId") REFERENCES "mantenimientos_programados"("id") ON DELETE SET NULL ON UPDATE CASCADE;
