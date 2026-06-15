-- Todos: Zuständiger User direkt (nicht über TeamMitglied)
ALTER TABLE "todos"
  ADD COLUMN IF NOT EXISTS "zustaendiger_user_id" UUID REFERENCES "users"("id") ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS "idx_todos_zustaendiger" ON "todos"("zustaendiger_user_id");

-- Allgemeine Infos: einfache Key-Value Notiz-Sektionen je Tenant
CREATE TABLE IF NOT EXISTS "allgemeine_infos" (
  "id"           UUID         NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "tenant_id"    UUID         NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "schluessel"   TEXT         NOT NULL,
  "inhalt"       TEXT         NOT NULL DEFAULT '',
  "titel"        TEXT         NOT NULL DEFAULT '',
  "reihenfolge"  INTEGER      NOT NULL DEFAULT 0,
  "geaendert_am" TIMESTAMPTZ  NOT NULL DEFAULT now(),
  "geaendert_von" TEXT,
  UNIQUE ("tenant_id", "schluessel")
);

CREATE INDEX IF NOT EXISTS "idx_allg_infos_tenant" ON "allgemeine_infos"("tenant_id");

-- Standard-Sektionen anlegen (werden ignoriert wenn schon vorhanden)
-- Diese werden beim ersten Start via API angelegt
