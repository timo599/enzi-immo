-- CreateEnum
CREATE TYPE "UebergabeTyp" AS ENUM ('einzug', 'auszug');

-- CreateTable
CREATE TABLE "wartungsaufgaben" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "objekt_id" UUID,
    "einheit_id" UUID,
    "titel" TEXT NOT NULL,
    "beschreibung" TEXT,
    "intervall_monate" INTEGER NOT NULL,
    "letzte_ausfuehrung" DATE,
    "naechst_faellig" DATE,
    "aktiv" BOOLEAN NOT NULL DEFAULT true,
    "erstellt_am" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wartungsaufgaben_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "uebergabeprotokolle" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "einheit_id" UUID NOT NULL,
    "mietvertrag_id" UUID,
    "typ" "UebergabeTyp" NOT NULL,
    "datum" DATE NOT NULL,
    "zaehlerstand_strom" DECIMAL(10,3),
    "zaehlerstand_gas" DECIMAL(10,3),
    "zaehlerstand_wasser" DECIMAL(10,3),
    "schluessel" INTEGER,
    "raeume" JSONB NOT NULL DEFAULT '[]',
    "notizen" TEXT,
    "erstellt_am" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "uebergabeprotokolle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kautionen" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "mietvertrag_id" UUID NOT NULL,
    "betrag" DECIMAL(10,2) NOT NULL,
    "erhalten_am" DATE,
    "konto" TEXT,
    "zinsen" DECIMAL(10,2),
    "rueckgabe_am" DATE,
    "rueckgabe_betrag" DECIMAL(10,2),
    "abzuege" DECIMAL(10,2) DEFAULT 0,
    "abzuege_grund" TEXT,
    "notizen" TEXT,
    "erstellt_am" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "geaendert_am" TIMESTAMP(3),

    CONSTRAINT "kautionen_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "wartungsaufgaben_tenant_id_idx" ON "wartungsaufgaben"("tenant_id");

-- CreateIndex
CREATE INDEX "uebergabeprotokolle_tenant_id_idx" ON "uebergabeprotokolle"("tenant_id");

-- CreateIndex
CREATE INDEX "uebergabeprotokolle_einheit_id_idx" ON "uebergabeprotokolle"("einheit_id");

-- CreateIndex
CREATE UNIQUE INDEX "kautionen_mietvertrag_id_key" ON "kautionen"("mietvertrag_id");

-- CreateIndex
CREATE INDEX "kautionen_tenant_id_idx" ON "kautionen"("tenant_id");

-- AddForeignKey
ALTER TABLE "wartungsaufgaben" ADD CONSTRAINT "wartungsaufgaben_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wartungsaufgaben" ADD CONSTRAINT "wartungsaufgaben_objekt_id_fkey" FOREIGN KEY ("objekt_id") REFERENCES "objekte"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wartungsaufgaben" ADD CONSTRAINT "wartungsaufgaben_einheit_id_fkey" FOREIGN KEY ("einheit_id") REFERENCES "einheiten"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "uebergabeprotokolle" ADD CONSTRAINT "uebergabeprotokolle_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "uebergabeprotokolle" ADD CONSTRAINT "uebergabeprotokolle_einheit_id_fkey" FOREIGN KEY ("einheit_id") REFERENCES "einheiten"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "uebergabeprotokolle" ADD CONSTRAINT "uebergabeprotokolle_mietvertrag_id_fkey" FOREIGN KEY ("mietvertrag_id") REFERENCES "mietvertraege"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kautionen" ADD CONSTRAINT "kautionen_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kautionen" ADD CONSTRAINT "kautionen_mietvertrag_id_fkey" FOREIGN KEY ("mietvertrag_id") REFERENCES "mietvertraege"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
