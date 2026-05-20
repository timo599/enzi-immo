-- DropForeignKey
ALTER TABLE "dokumente" DROP CONSTRAINT "dokumente_einheit_id_fkey";

-- DropForeignKey
ALTER TABLE "dokumente" DROP CONSTRAINT "dokumente_objekt_id_fkey";

-- DropForeignKey
ALTER TABLE "kontoauszuege" DROP CONSTRAINT "kontoauszuege_bankkonto_id_fkey";

-- DropForeignKey
ALTER TABLE "zaehler" DROP CONSTRAINT "zaehler_einheit_id_fkey";

-- DropForeignKey
ALTER TABLE "zaehler" DROP CONSTRAINT "zaehler_objekt_id_fkey";

-- DropForeignKey
ALTER TABLE "zaehler" DROP CONSTRAINT "zaehler_tenant_id_fkey";

-- DropForeignKey
ALTER TABLE "zaehlerstaende" DROP CONSTRAINT "zaehlerstaende_zaehler_id_fkey";

-- AlterTable
ALTER TABLE "dokumente" ADD COLUMN     "dokument_typ" TEXT NOT NULL DEFAULT 'rechnung';

-- AlterTable
ALTER TABLE "zaehler" ALTER COLUMN "erstellt_am" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "zaehlerstaende" ALTER COLUMN "erstellt_am" SET DATA TYPE TIMESTAMP(3);

-- CreateTable
CREATE TABLE "lernmodus_sessionen" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "dokument_id" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'extrahiert',
    "roh_daten" JSONB NOT NULL DEFAULT '{}',
    "erstellt_am" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "erstellt_von" UUID NOT NULL,
    "geaendert_am" TIMESTAMP(3),

    CONSTRAINT "lernmodus_sessionen_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lernmodus_fragen" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "session_id" UUID NOT NULL,
    "frage_typ" TEXT NOT NULL,
    "fragentext" TEXT NOT NULL,
    "einheit_ref" TEXT,
    "vorschlag_wert" TEXT,
    "bestaetigt" BOOLEAN NOT NULL DEFAULT false,
    "antwort_wert" TEXT,
    "einheit_id" UUID,
    "erstellt_am" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "beantwortet_am" TIMESTAMP(3),

    CONSTRAINT "lernmodus_fragen_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "einheit_lernwissen" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "einheit_id" UUID NOT NULL,
    "quelle_session_id" UUID,
    "personen_anzahl_bestaetigt" INTEGER,
    "wohnflaeche_bestaetigt" DECIMAL(8,2),
    "notizen" TEXT,
    "erstellt_am" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "geaendert_am" TIMESTAMP(3),

    CONSTRAINT "einheit_lernwissen_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kostenart_lernwissen" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "kostenart_kuerzel" TEXT NOT NULL,
    "bevorzugter_schluessel" "Umlageschluessel" NOT NULL,
    "quelle_session_id" UUID,
    "erstellt_am" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "kostenart_lernwissen_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "lernmodus_sessionen_dokument_id_key" ON "lernmodus_sessionen"("dokument_id");

-- CreateIndex
CREATE INDEX "lernmodus_sessionen_tenant_id_idx" ON "lernmodus_sessionen"("tenant_id");

-- CreateIndex
CREATE INDEX "lernmodus_fragen_session_id_idx" ON "lernmodus_fragen"("session_id");

-- CreateIndex
CREATE UNIQUE INDEX "einheit_lernwissen_einheit_id_key" ON "einheit_lernwissen"("einheit_id");

-- CreateIndex
CREATE INDEX "einheit_lernwissen_tenant_id_idx" ON "einheit_lernwissen"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "einheit_lernwissen_tenant_id_einheit_id_key" ON "einheit_lernwissen"("tenant_id", "einheit_id");

-- CreateIndex
CREATE INDEX "kostenart_lernwissen_tenant_id_idx" ON "kostenart_lernwissen"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "kostenart_lernwissen_tenant_id_kostenart_kuerzel_key" ON "kostenart_lernwissen"("tenant_id", "kostenart_kuerzel");

-- AddForeignKey
ALTER TABLE "dokumente" ADD CONSTRAINT "dokumente_einheit_id_fkey" FOREIGN KEY ("einheit_id") REFERENCES "einheiten"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dokumente" ADD CONSTRAINT "dokumente_objekt_id_fkey" FOREIGN KEY ("objekt_id") REFERENCES "objekte"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kontoauszuege" ADD CONSTRAINT "kontoauszuege_bankkonto_id_fkey" FOREIGN KEY ("bankkonto_id") REFERENCES "bankkonten"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "zaehler" ADD CONSTRAINT "zaehler_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "zaehler" ADD CONSTRAINT "zaehler_objekt_id_fkey" FOREIGN KEY ("objekt_id") REFERENCES "objekte"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "zaehler" ADD CONSTRAINT "zaehler_einheit_id_fkey" FOREIGN KEY ("einheit_id") REFERENCES "einheiten"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "zaehlerstaende" ADD CONSTRAINT "zaehlerstaende_zaehler_id_fkey" FOREIGN KEY ("zaehler_id") REFERENCES "zaehler"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lernmodus_sessionen" ADD CONSTRAINT "lernmodus_sessionen_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lernmodus_sessionen" ADD CONSTRAINT "lernmodus_sessionen_dokument_id_fkey" FOREIGN KEY ("dokument_id") REFERENCES "dokumente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lernmodus_fragen" ADD CONSTRAINT "lernmodus_fragen_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "lernmodus_sessionen"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lernmodus_fragen" ADD CONSTRAINT "lernmodus_fragen_einheit_id_fkey" FOREIGN KEY ("einheit_id") REFERENCES "einheiten"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "einheit_lernwissen" ADD CONSTRAINT "einheit_lernwissen_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "einheit_lernwissen" ADD CONSTRAINT "einheit_lernwissen_einheit_id_fkey" FOREIGN KEY ("einheit_id") REFERENCES "einheiten"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kostenart_lernwissen" ADD CONSTRAINT "kostenart_lernwissen_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "zaehlerstaende_datum_idx" RENAME TO "zaehlerstaende_ablesedatum_idx";
