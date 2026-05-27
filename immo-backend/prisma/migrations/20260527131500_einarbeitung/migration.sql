-- CreateTable
CREATE TABLE "einarbeitungen" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "titel" VARCHAR(300) NOT NULL,
    "beschreibung" TEXT,
    "typ" VARCHAR(20) NOT NULL DEFAULT 'intern',
    "ziel_rolle" VARCHAR(50),
    "zugangscode" VARCHAR(50),
    "gueltig_bis" TIMESTAMP(3),
    "aktiv" BOOLEAN NOT NULL DEFAULT true,
    "erstellt_am" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "geaendert_am" TIMESTAMP(3),

    CONSTRAINT "einarbeitungen_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "einarbeitungs_module" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "einarbeitung_id" UUID NOT NULL,
    "titel" VARCHAR(300) NOT NULL,
    "beschreibung" TEXT,
    "inhalt" TEXT,
    "schritte" JSONB NOT NULL DEFAULT '[]',
    "leitfaden_ids" JSONB NOT NULL DEFAULT '[]',
    "reihenfolge" INTEGER NOT NULL DEFAULT 0,
    "pflicht" BOOLEAN NOT NULL DEFAULT true,
    "erstellt_am" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "einarbeitungs_module_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "modul_fortschritte" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "modul_id" UUID NOT NULL,
    "user_id" UUID,
    "extern_email" VARCHAR(255),
    "extern_name" VARCHAR(200),
    "status" VARCHAR(30) NOT NULL DEFAULT 'offen',
    "notizen" TEXT,
    "erledigt_am" TIMESTAMP(3),
    "erstellt_am" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "geaendert_am" TIMESTAMP(3),

    CONSTRAINT "modul_fortschritte_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "einarbeitungen_zugangscode_key" ON "einarbeitungen"("zugangscode");

-- CreateIndex
CREATE INDEX "einarbeitungen_tenant_id_idx" ON "einarbeitungen"("tenant_id");

-- CreateIndex
CREATE INDEX "einarbeitungen_zugangscode_idx" ON "einarbeitungen"("zugangscode");

-- CreateIndex
CREATE INDEX "einarbeitungs_module_einarbeitung_id_idx" ON "einarbeitungs_module"("einarbeitung_id");

-- CreateIndex
CREATE UNIQUE INDEX "modul_fortschritte_modul_id_user_id_key" ON "modul_fortschritte"("modul_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "modul_fortschritte_modul_id_extern_email_key" ON "modul_fortschritte"("modul_id", "extern_email");

-- CreateIndex
CREATE INDEX "modul_fortschritte_modul_id_idx" ON "modul_fortschritte"("modul_id");

-- AddForeignKey
ALTER TABLE "einarbeitungen" ADD CONSTRAINT "einarbeitungen_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "einarbeitungs_module" ADD CONSTRAINT "einarbeitungs_module_einarbeitung_id_fkey" FOREIGN KEY ("einarbeitung_id") REFERENCES "einarbeitungen"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "modul_fortschritte" ADD CONSTRAINT "modul_fortschritte_modul_id_fkey" FOREIGN KEY ("modul_id") REFERENCES "einarbeitungs_module"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "modul_fortschritte" ADD CONSTRAINT "modul_fortschritte_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
