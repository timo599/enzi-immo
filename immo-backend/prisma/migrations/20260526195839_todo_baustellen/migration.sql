-- CreateEnum
CREATE TYPE "TodoStatus" AS ENUM ('offen', 'in_bearbeitung', 'erledigt', 'abgebrochen');

-- CreateEnum
CREATE TYPE "TodoPrioritaet" AS ENUM ('niedrig', 'mittel', 'hoch', 'dringend');

-- CreateEnum
CREATE TYPE "BaustelleStatus" AS ENUM ('planung', 'aktiv', 'pausiert', 'abgeschlossen');

-- CreateTable
CREATE TABLE "team_mitglieder" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "telefon" TEXT,
    "rolle" TEXT NOT NULL DEFAULT 'mitarbeiter',
    "aktiv" BOOLEAN NOT NULL DEFAULT true,
    "erstellt_am" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "team_mitglieder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "todos" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "titel" TEXT NOT NULL,
    "beschreibung" TEXT,
    "status" "TodoStatus" NOT NULL DEFAULT 'offen',
    "prioritaet" "TodoPrioritaet" NOT NULL DEFAULT 'mittel',
    "kategorie" TEXT,
    "firma_id" UUID,
    "objekt_id" UUID,
    "einheit_id" UUID,
    "baustelle_id" UUID,
    "faellig_am" DATE,
    "erledigt_am" TIMESTAMP(3),
    "erstellt_von" TEXT,
    "erstellt_am" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "geaendert_am" TIMESTAMP(3),

    CONSTRAINT "todos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "todo_zuweisungen" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "todo_id" UUID NOT NULL,
    "team_mitglied_id" UUID NOT NULL,
    "zugewiesen_am" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "todo_zuweisungen_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "baustellen" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "beschreibung" TEXT,
    "status" "BaustelleStatus" NOT NULL DEFAULT 'planung',
    "firma_id" UUID,
    "objekt_id" UUID,
    "start_datum" DATE,
    "end_datum" DATE,
    "budget" DECIMAL(12,2),
    "kosten_bisher" DECIMAL(12,2),
    "zugangscode" TEXT,
    "notizen" TEXT,
    "erstellt_am" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "geaendert_am" TIMESTAMP(3),

    CONSTRAINT "baustellen_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "baustelle_zuweisungen" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "baustelle_id" UUID NOT NULL,
    "team_mitglied_id" UUID NOT NULL,
    "rolle" TEXT NOT NULL DEFAULT 'arbeiter',
    "zugewiesen_am" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "baustelle_zuweisungen_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "team_mitglieder_tenant_id_idx" ON "team_mitglieder"("tenant_id");

-- CreateIndex
CREATE INDEX "todos_tenant_id_idx" ON "todos"("tenant_id");

-- CreateIndex
CREATE INDEX "todos_status_idx" ON "todos"("status");

-- CreateIndex
CREATE UNIQUE INDEX "todo_zuweisungen_todo_id_team_mitglied_id_key" ON "todo_zuweisungen"("todo_id", "team_mitglied_id");

-- CreateIndex
CREATE INDEX "baustellen_tenant_id_idx" ON "baustellen"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "baustelle_zuweisungen_baustelle_id_team_mitglied_id_key" ON "baustelle_zuweisungen"("baustelle_id", "team_mitglied_id");

-- AddForeignKey
ALTER TABLE "team_mitglieder" ADD CONSTRAINT "team_mitglieder_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "todos" ADD CONSTRAINT "todos_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "todos" ADD CONSTRAINT "todos_firma_id_fkey" FOREIGN KEY ("firma_id") REFERENCES "firmen"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "todos" ADD CONSTRAINT "todos_objekt_id_fkey" FOREIGN KEY ("objekt_id") REFERENCES "objekte"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "todos" ADD CONSTRAINT "todos_einheit_id_fkey" FOREIGN KEY ("einheit_id") REFERENCES "einheiten"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "todos" ADD CONSTRAINT "todos_baustelle_id_fkey" FOREIGN KEY ("baustelle_id") REFERENCES "baustellen"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "todo_zuweisungen" ADD CONSTRAINT "todo_zuweisungen_todo_id_fkey" FOREIGN KEY ("todo_id") REFERENCES "todos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "todo_zuweisungen" ADD CONSTRAINT "todo_zuweisungen_team_mitglied_id_fkey" FOREIGN KEY ("team_mitglied_id") REFERENCES "team_mitglieder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "baustellen" ADD CONSTRAINT "baustellen_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "baustellen" ADD CONSTRAINT "baustellen_firma_id_fkey" FOREIGN KEY ("firma_id") REFERENCES "firmen"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "baustellen" ADD CONSTRAINT "baustellen_objekt_id_fkey" FOREIGN KEY ("objekt_id") REFERENCES "objekte"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "baustelle_zuweisungen" ADD CONSTRAINT "baustelle_zuweisungen_baustelle_id_fkey" FOREIGN KEY ("baustelle_id") REFERENCES "baustellen"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "baustelle_zuweisungen" ADD CONSTRAINT "baustelle_zuweisungen_team_mitglied_id_fkey" FOREIGN KEY ("team_mitglied_id") REFERENCES "team_mitglieder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
