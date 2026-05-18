-- ============================================================
-- Migration: Zähler, Zählerstände + Dokument-Erweiterungen
-- ============================================================

-- 1. Neues Enum: DokumentKategorie
CREATE TYPE "DokumentKategorie" AS ENUM (
  'rechnung',
  'mietvertrag',
  'minol',
  'zaehler_foto',
  'sonstiges'
);

-- 2. Dokument-Tabelle erweitern
ALTER TABLE "dokumente"
  ADD COLUMN IF NOT EXISTS "einheit_id"         UUID REFERENCES "einheiten"("id") ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS "objekt_id"          UUID REFERENCES "objekte"("id")   ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS "dokument_kategorie" "DokumentKategorie" NOT NULL DEFAULT 'sonstiges';

CREATE INDEX IF NOT EXISTS "dokumente_einheit_id_idx" ON "dokumente"("einheit_id");
CREATE INDEX IF NOT EXISTS "dokumente_objekt_id_idx"  ON "dokumente"("objekt_id");

-- 3. Zähler-Tabelle
CREATE TABLE "zaehler" (
  "id"            UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "tenant_id"     UUID        NOT NULL REFERENCES "tenants"("id"),
  "objekt_id"     UUID        REFERENCES "objekte"("id")   ON DELETE CASCADE,
  "einheit_id"    UUID        REFERENCES "einheiten"("id") ON DELETE CASCADE,
  "bezeichnung"   TEXT        NOT NULL,
  "zaehlernummer" TEXT,
  "verbrauchstyp" "Verbrauchstyp" NOT NULL,
  "einheit"       TEXT        NOT NULL DEFAULT 'kWh',
  "aktiv"         BOOLEAN     NOT NULL DEFAULT true,
  "notizen"       TEXT,
  "erstellt_am"   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX "zaehler_tenant_id_idx"  ON "zaehler"("tenant_id");
CREATE INDEX "zaehler_objekt_id_idx"  ON "zaehler"("objekt_id");
CREATE INDEX "zaehler_einheit_id_idx" ON "zaehler"("einheit_id");

-- 4. Zählerstand-Tabelle
CREATE TABLE "zaehlerstaende" (
  "id"          UUID          NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "zaehler_id"  UUID          NOT NULL REFERENCES "zaehler"("id") ON DELETE CASCADE,
  "ablesedatum" DATE          NOT NULL,
  "stand"       DECIMAL(12,3) NOT NULL,
  "verbrauch"   DECIMAL(12,3),
  "notizen"     TEXT,
  "erstellt_am" TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE INDEX "zaehlerstaende_zaehler_id_idx" ON "zaehlerstaende"("zaehler_id");
CREATE INDEX "zaehlerstaende_datum_idx"       ON "zaehlerstaende"("ablesedatum");
