-- Neue Einheitstypen hinzufügen
ALTER TYPE "Einheitstyp" ADD VALUE IF NOT EXISTS 'buero';
ALTER TYPE "Einheitstyp" ADD VALUE IF NOT EXISTS 'laden';
ALTER TYPE "Einheitstyp" ADD VALUE IF NOT EXISTS 'praxis';
ALTER TYPE "Einheitstyp" ADD VALUE IF NOT EXISTS 'loft';

-- Firma-Tabelle anlegen
CREATE TABLE "firmen" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "rechtsform" TEXT,
    "strasse" TEXT,
    "plz" TEXT,
    "stadt" TEXT,
    "notizen" TEXT,
    "aktiv" BOOLEAN NOT NULL DEFAULT true,
    "erstellt_am" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "firmen_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "firmen_tenant_id_idx" ON "firmen"("tenant_id");

ALTER TABLE "firmen" ADD CONSTRAINT "firmen_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- firma_id zu Objekt hinzufügen
ALTER TABLE "objekte" ADD COLUMN "firma_id" UUID;

ALTER TABLE "objekte" ADD CONSTRAINT "objekte_firma_id_fkey"
    FOREIGN KEY ("firma_id") REFERENCES "firmen"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
