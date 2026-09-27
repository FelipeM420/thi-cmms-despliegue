-- AlterTable
ALTER TABLE "ordenes_trabajo" ALTER COLUMN "emitidaPorId" DROP NOT NULL;

-- CheckConstraint
-- Prisma no expresa CHECK en el esquema. Una OT sin usuario emisor solo puede
-- ser la que genera el sistema (origen AUTOMATICO, HU14); una solicitud directa
-- (MANUAL) siempre lleva quién la emitió. Las OT existentes ya cumplen la regla:
-- todas tienen emisor.
ALTER TABLE "ordenes_trabajo" ADD CONSTRAINT "ordenes_trabajo_emisor_o_automatica" CHECK ("emitidaPorId" IS NOT NULL OR "origen" = 'AUTOMATICO');
