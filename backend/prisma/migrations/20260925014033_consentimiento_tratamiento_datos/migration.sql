-- CreateTable
CREATE TABLE "consentimientos_tratamiento" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "versionPolitica" TEXT NOT NULL,
    "aceptadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "consentimientos_tratamiento_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "consentimientos_tratamiento_usuarioId_idx" ON "consentimientos_tratamiento"("usuarioId");

-- CreateIndex
CREATE UNIQUE INDEX "consentimientos_tratamiento_usuarioId_versionPolitica_key" ON "consentimientos_tratamiento"("usuarioId", "versionPolitica");

-- AddForeignKey
ALTER TABLE "consentimientos_tratamiento" ADD CONSTRAINT "consentimientos_tratamiento_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Registro inmutable
-- Prisma no expresa disparadores. La aceptación del aviso (Ley 1581) es una
-- prueba: solo se agregan filas. Modificar o borrar una es un error, venga de
-- la aplicación o de una consulta manual.
CREATE FUNCTION "consentimientos_tratamiento_inmutable"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Los consentimientos de tratamiento de datos son inmutables (Ley 1581): no se modifican ni se eliminan.';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "consentimientos_tratamiento_solo_altas"
  BEFORE UPDATE OR DELETE ON "consentimientos_tratamiento"
  FOR EACH ROW EXECUTE FUNCTION "consentimientos_tratamiento_inmutable"();
