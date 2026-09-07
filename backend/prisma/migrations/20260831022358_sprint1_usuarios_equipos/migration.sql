-- CreateEnum
CREATE TYPE "Rol" AS ENUM ('ADMINISTRADOR', 'TECNICO');

-- CreateEnum
CREATE TYPE "TipoActivo" AS ENUM ('EQUIPO', 'INSUMO', 'MATERIA_PRIMA', 'CONSUMIBLE');

-- CreateEnum
CREATE TYPE "EstadoEquipo" AS ENUM ('ACTIVO', 'EN_MANTENIMIENTO', 'DADO_DE_BAJA');

-- CreateEnum
CREATE TYPE "ResponsableMantenimiento" AS ENUM ('INTERNO', 'EXTERNO');

-- CreateTable
CREATE TABLE "usuarios" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "rol" "Rol" NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "usuarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "equipos" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "referencia" TEXT NOT NULL,
    "numeroSerie" TEXT,
    "marca" TEXT,
    "anioAdquisicion" INTEGER,
    "zona" TEXT NOT NULL,
    "tipoActivo" "TipoActivo" NOT NULL DEFAULT 'EQUIPO',
    "costo" DECIMAL(14,2),
    "descripcionTecnica" TEXT,
    "fotoUrl" TEXT,
    "manualPdfUrl" TEXT,
    "estado" "EstadoEquipo" NOT NULL DEFAULT 'ACTIVO',
    "tipoMantenimiento" "ResponsableMantenimiento" NOT NULL DEFAULT 'INTERNO',
    "registradoPorId" TEXT NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "equipos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_email_key" ON "usuarios"("email");

-- CreateIndex
CREATE UNIQUE INDEX "equipos_referencia_key" ON "equipos"("referencia");

-- CreateIndex
CREATE UNIQUE INDEX "equipos_numeroSerie_key" ON "equipos"("numeroSerie");

-- CreateIndex
CREATE INDEX "equipos_zona_idx" ON "equipos"("zona");

-- CreateIndex
CREATE INDEX "equipos_estado_idx" ON "equipos"("estado");

-- CreateIndex
CREATE INDEX "equipos_tipoActivo_idx" ON "equipos"("tipoActivo");

-- AddForeignKey
ALTER TABLE "equipos" ADD CONSTRAINT "equipos_registradoPorId_fkey" FOREIGN KEY ("registradoPorId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
