-- ── Erweitere DokumentKategorie um neue Werte ──────────────────────────────
ALTER TYPE "DokumentKategorie" ADD VALUE IF NOT EXISTS 'mietvertrag_anlage';
ALTER TYPE "DokumentKategorie" ADD VALUE IF NOT EXISTS 'kuendigung';
ALTER TYPE "DokumentKategorie" ADD VALUE IF NOT EXISTS 'uebergabeprotokoll';
ALTER TYPE "DokumentKategorie" ADD VALUE IF NOT EXISTS 'zaehlerstand';
ALTER TYPE "DokumentKategorie" ADD VALUE IF NOT EXISTS 'betriebskostenabrechnung';
ALTER TYPE "DokumentKategorie" ADD VALUE IF NOT EXISTS 'versicherung';
ALTER TYPE "DokumentKategorie" ADD VALUE IF NOT EXISTS 'grundsteuer';
ALTER TYPE "DokumentKategorie" ADD VALUE IF NOT EXISTS 'korrespondenz';
ALTER TYPE "DokumentKategorie" ADD VALUE IF NOT EXISTS 'ausweis';
ALTER TYPE "DokumentKategorie" ADD VALUE IF NOT EXISTS 'bankverbindung';

-- ── Erweitere dokumente um Relationen + Metadaten ──────────────────────────
ALTER TABLE "dokumente" ADD COLUMN IF NOT EXISTS "mieter_id" UUID;
ALTER TABLE "dokumente" ADD COLUMN IF NOT EXISTS "mietvertrag_id" UUID;
ALTER TABLE "dokumente" ADD COLUMN IF NOT EXISTS "titel" TEXT;
ALTER TABLE "dokumente" ADD COLUMN IF NOT EXISTS "beschreibung" TEXT;
-- Fehlende Spalte aus älterer Schema-Definition nachholen
ALTER TABLE "dokumente" ADD COLUMN IF NOT EXISTS "extracted_data" JSONB;

-- ── Foreign Keys ───────────────────────────────────────────────────────────
ALTER TABLE "dokumente"
  ADD CONSTRAINT "dokumente_mieter_id_fkey"
    FOREIGN KEY ("mieter_id") REFERENCES "mieter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "dokumente"
  ADD CONSTRAINT "dokumente_mietvertrag_id_fkey"
    FOREIGN KEY ("mietvertrag_id") REFERENCES "mietvertraege"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── Indizes ────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS "dokumente_mieter_id_idx" ON "dokumente"("mieter_id");
CREATE INDEX IF NOT EXISTS "dokumente_mietvertrag_id_idx" ON "dokumente"("mietvertrag_id");
CREATE INDEX IF NOT EXISTS "dokumente_tenant_id_dokument_kategorie_idx" ON "dokumente"("tenant_id", "dokument_kategorie");
