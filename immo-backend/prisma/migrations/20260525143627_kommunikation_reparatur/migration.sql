-- CreateEnum
CREATE TYPE "KommunikationKategorie" AS ENUM ('anruf', 'brief', 'email', 'vor_ort', 'sonstiges');

-- CreateEnum
CREATE TYPE "ReparaturStatus" AS ENUM ('offen', 'in_bearbeitung', 'erledigt');

-- CreateTable
CREATE TABLE "kommunikation" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "mieter_id" UUID,
    "einheit_id" UUID,
    "datum" DATE NOT NULL,
    "kategorie" "KommunikationKategorie" NOT NULL DEFAULT 'sonstiges',
    "betreff" TEXT,
    "text" TEXT NOT NULL,
    "erstellt_am" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "kommunikation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reparaturen" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "einheit_id" UUID,
    "objekt_id" UUID,
    "titel" TEXT NOT NULL,
    "beschreibung" TEXT,
    "status" "ReparaturStatus" NOT NULL DEFAULT 'offen',
    "kosten" DECIMAL(10,2),
    "datum" DATE NOT NULL,
    "erledigt_am" DATE,
    "handwerker" TEXT,
    "erstellt_am" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reparaturen_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "kommunikation_tenant_id_idx" ON "kommunikation"("tenant_id");

-- CreateIndex
CREATE INDEX "kommunikation_mieter_id_idx" ON "kommunikation"("mieter_id");

-- CreateIndex
CREATE INDEX "kommunikation_einheit_id_idx" ON "kommunikation"("einheit_id");

-- CreateIndex
CREATE INDEX "reparaturen_tenant_id_idx" ON "reparaturen"("tenant_id");

-- CreateIndex
CREATE INDEX "reparaturen_einheit_id_idx" ON "reparaturen"("einheit_id");

-- CreateIndex
CREATE INDEX "reparaturen_objekt_id_idx" ON "reparaturen"("objekt_id");

-- AddForeignKey
ALTER TABLE "kommunikation" ADD CONSTRAINT "kommunikation_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kommunikation" ADD CONSTRAINT "kommunikation_mieter_id_fkey" FOREIGN KEY ("mieter_id") REFERENCES "mieter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kommunikation" ADD CONSTRAINT "kommunikation_einheit_id_fkey" FOREIGN KEY ("einheit_id") REFERENCES "einheiten"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reparaturen" ADD CONSTRAINT "reparaturen_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reparaturen" ADD CONSTRAINT "reparaturen_einheit_id_fkey" FOREIGN KEY ("einheit_id") REFERENCES "einheiten"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reparaturen" ADD CONSTRAINT "reparaturen_objekt_id_fkey" FOREIGN KEY ("objekt_id") REFERENCES "objekte"("id") ON DELETE SET NULL ON UPDATE CASCADE;
