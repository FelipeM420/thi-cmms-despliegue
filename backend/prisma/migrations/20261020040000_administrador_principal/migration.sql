ALTER TABLE "usuarios"
ADD COLUMN "esAdministradorPrincipal" BOOLEAN NOT NULL DEFAULT false;

UPDATE "usuarios"
SET "esAdministradorPrincipal" = true
WHERE "email" = 'sefemoreno123@umariana.edu.co';
