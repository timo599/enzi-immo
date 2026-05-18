-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "unaccent";

-- CreateEnum
CREATE TYPE "Heizungsart" AS ENUM ('oel', 'gas', 'fernwaerme', 'strom', 'waermepumpe', 'pellets', 'sonstiges');

-- CreateEnum
CREATE TYPE "Einheitstyp" AS ENUM ('wohnung', 'gewerbe', 'stellplatz', 'lager', 'sonstiges');

-- CreateEnum
CREATE TYPE "Mietart" AS ENUM ('wohnraum', 'gewerbe');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('admin', 'verwalter', 'assistent', 'eigentuemer_readonly');

-- CreateEnum
CREATE TYPE "ExtractionStatus" AS ENUM ('pending', 'processing', 'extracted', 'needs_review', 'reviewed', 'failed', 'manual');

-- CreateEnum
CREATE TYPE "MatchingStatus" AS ENUM ('unmatched', 'auto_matched', 'manually_matched', 'ambiguous', 'ignored');

-- CreateEnum
CREATE TYPE "Buchungstyp" AS ENUM ('miete', 'nk_vorauszahlung', 'miete_und_nk', 'nk_nachzahlung', 'kaution', 'nk_guthaben', 'sonstiges');

-- CreateEnum
CREATE TYPE "AbrechnungStatus" AS ENUM ('entwurf', 'in_pruefung', 'freigegeben', 'versendet', 'abgeschlossen');

-- CreateEnum
CREATE TYPE "AmpelStatus" AS ENUM ('faellig', 'bald_faellig', 'geplant', 'kein_handlungsbedarf', 'manuelle_pruefung');

-- CreateEnum
CREATE TYPE "Erhoehungstyp" AS ENUM ('staffel', 'index', 'vertraglich', 'sonstig');

-- CreateEnum
CREATE TYPE "Umlageschluessel" AS ENUM ('wohnflaeche', 'gesamtflaeche', 'personenanzahl', 'verbrauchsmessung', 'miteigentumsanteile', 'gleiche_teile');

-- CreateEnum
CREATE TYPE "Umlagefaehig" AS ENUM ('ja', 'nein', 'teilweise');

-- CreateEnum
CREATE TYPE "PostenStatus" AS ENUM ('offen', 'teilbezahlt', 'bezahlt', 'storniert');

-- CreateEnum
CREATE TYPE "Vollstaendigkeitsstatus" AS ENUM ('vollstaendig', 'kosten_ohne_verbrauch', 'fehlt');

-- CreateEnum
CREATE TYPE "Verbrauchstyp" AS ENUM ('oel', 'strom_gemein', 'strom_einheit', 'gas', 'wasser_kalt', 'wasser_warm', 'fernwaerme');

-- CreateEnum
CREATE TYPE "Plan" AS ENUM ('starter', 'professional', 'enterprise');

-- CreateTable
CREATE TABLE "tenants" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "plan" "Plan" NOT NULL DEFAULT 'starter',
    "aktiv" BOOLEAN NOT NULL DEFAULT true,
    "erstellt_am" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "vorname" TEXT,
    "nachname" TEXT,
    "rolle" "UserRole" NOT NULL DEFAULT 'verwalter',
    "aktiv" BOOLEAN NOT NULL DEFAULT true,
    "letzter_login" TIMESTAMP(3),
    "erstellt_am" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "objekte" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "bezeichnung" TEXT NOT NULL,
    "strasse" TEXT NOT NULL,
    "hausnummer" TEXT NOT NULL,
    "plz" TEXT NOT NULL,
    "stadt" TEXT NOT NULL,
    "bundesland" TEXT,
    "baujahr" INTEGER,
    "heizungsart" "Heizungsart" NOT NULL,
    "wohnflaeche_gesamt_m2" DECIMAL(10,2) NOT NULL,
    "nutzflaeche_gesamt_m2" DECIMAL(10,2),
    "mea_gesamt" INTEGER NOT NULL DEFAULT 1000,
    "notizen" TEXT,
    "aktiv" BOOLEAN NOT NULL DEFAULT true,
    "erstellt_am" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "erstellt_von" UUID,
    "geaendert_am" TIMESTAMP(3),
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "objekte_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "einheiten" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "objekt_id" UUID NOT NULL,
    "bezeichnung" TEXT NOT NULL,
    "einheiten_typ" "Einheitstyp" NOT NULL DEFAULT 'wohnung',
    "wohnflaeche_m2" DECIMAL(8,2),
    "nutzflaeche_m2" DECIMAL(8,2),
    "etage" TEXT,
    "mea_anteil" INTEGER,
    "personen_anzahl" INTEGER,
    "aktiv" BOOLEAN NOT NULL DEFAULT true,
    "notizen" TEXT,
    "erstellt_am" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "geaendert_am" TIMESTAMP(3),
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "einheiten_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mieter" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "anrede" TEXT,
    "vorname" TEXT,
    "nachname" TEXT NOT NULL,
    "firmenname" TEXT,
    "zusatz" TEXT,
    "strasse" TEXT,
    "hausnummer" TEXT,
    "plz" TEXT,
    "stadt" TEXT,
    "email" TEXT,
    "telefon" TEXT,
    "iban" TEXT,
    "steuernummer" TEXT,
    "notizen" TEXT,
    "deleted_at" TIMESTAMP(3),
    "erstellt_am" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "geaendert_am" TIMESTAMP(3),

    CONSTRAINT "mieter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mietvertraege" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "einheit_id" UUID NOT NULL,
    "mietart" "Mietart" NOT NULL,
    "vertragsbeginn" DATE NOT NULL,
    "vertragsende" DATE,
    "nettomiete" DECIMAL(10,2) NOT NULL,
    "nk_vorauszahlung" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "kaution" DECIMAL(10,2),
    "index_klausel" BOOLEAN NOT NULL DEFAULT false,
    "index_typ" TEXT,
    "index_basisjahr" INTEGER,
    "index_basiswert" DECIMAL(8,3),
    "kuendigungsfrist_mieter" INTEGER NOT NULL DEFAULT 3,
    "kuendigungsfrist_verm" INTEGER NOT NULL DEFAULT 3,
    "notizen" TEXT,
    "erstellt_am" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "erstellt_von" UUID,
    "geaendert_am" TIMESTAMP(3),
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "mietvertraege_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mietvertrag_mieter" (
    "mietvertrag_id" UUID NOT NULL,
    "mieter_id" UUID NOT NULL,
    "rolle" TEXT NOT NULL DEFAULT 'hauptmieter',
    "seit" DATE NOT NULL,
    "bis" DATE,

    CONSTRAINT "mietvertrag_mieter_pkey" PRIMARY KEY ("mietvertrag_id","mieter_id")
);

-- CreateTable
CREATE TABLE "vertragsklauseln" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "mietvertrag_id" UUID NOT NULL,
    "klausel_typ" TEXT NOT NULL,
    "inhalt" TEXT NOT NULL,
    "gueltig_ab" DATE,
    "gueltig_bis" DATE,
    "betrag" DECIMAL(10,2),
    "manuell_pruefen" BOOLEAN NOT NULL DEFAULT true,
    "erstellt_am" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vertragsklauseln_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kostenarten" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "kuerzel" TEXT NOT NULL,
    "bezeichnung" TEXT NOT NULL,
    "umlagefaehig" "Umlagefaehig" NOT NULL DEFAULT 'ja',
    "schluessel_standard" "Umlageschluessel" NOT NULL DEFAULT 'wohnflaeche',
    "rechtsgrundlage" TEXT,
    "heizkv_relevant" BOOLEAN NOT NULL DEFAULT false,
    "system_vordefiniert" BOOLEAN NOT NULL DEFAULT false,
    "aktiv" BOOLEAN NOT NULL DEFAULT true,
    "erstellt_am" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "kostenarten_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "umlageschluessel" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "objekt_id" UUID NOT NULL,
    "kostenart_id" UUID NOT NULL,
    "schluessel_typ" "Umlageschluessel" NOT NULL,
    "verbrauchsanteil_pct" DECIMAL(5,2),
    "flaechenanteil_pct" DECIMAL(5,2),
    "heizkv_geprueft" BOOLEAN NOT NULL DEFAULT false,
    "notizen" TEXT,

    CONSTRAINT "umlageschluessel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bankkonten" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "bezeichnung" TEXT NOT NULL,
    "iban" TEXT NOT NULL,
    "bic" TEXT,
    "kontoinhaber" TEXT NOT NULL,
    "bank_name" TEXT,
    "aktiv" BOOLEAN NOT NULL DEFAULT true,
    "erstellt_am" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bankkonten_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bankkonto_objekte" (
    "bankkonto_id" UUID NOT NULL,
    "objekt_id" UUID NOT NULL,

    CONSTRAINT "bankkonto_objekte_pkey" PRIMARY KEY ("bankkonto_id","objekt_id")
);

-- CreateTable
CREATE TABLE "lieferanten" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "strasse" TEXT,
    "plz" TEXT,
    "stadt" TEXT,
    "steuernummer" TEXT,
    "iban" TEXT,
    "kostenart_id" UUID,
    "notizen" TEXT,
    "deleted_at" TIMESTAMP(3),
    "erstellt_am" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lieferanten_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "abrechnungszeitraeume" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "objekt_id" UUID NOT NULL,
    "bezeichnung" TEXT NOT NULL,
    "von" DATE NOT NULL,
    "bis" DATE NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'offen',
    "erstellt_am" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "erstellt_von" UUID,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "abrechnungszeitraeume_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dokumente" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "zeitraum_id" UUID NOT NULL,
    "original_name" TEXT NOT NULL,
    "s3_key" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "file_size_bytes" BIGINT NOT NULL,
    "sha256" TEXT NOT NULL,
    "extraction_status" "ExtractionStatus" NOT NULL DEFAULT 'pending',
    "upload_fehler" TEXT,
    "hochgeladen_am" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "hochgeladen_von" UUID NOT NULL,

    CONSTRAINT "dokumente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dok_extraktionen" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "dokument_id" UUID NOT NULL,
    "raw_response" JSONB NOT NULL,
    "extracted_fields" JSONB NOT NULL,
    "confidence_map" JSONB NOT NULL,
    "flags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "model_version" TEXT NOT NULL,
    "prompt_version" TEXT NOT NULL,
    "tokens_input" INTEGER,
    "tokens_output" INTEGER,
    "extrahiert_am" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewed" BOOLEAN NOT NULL DEFAULT false,
    "reviewed_von" UUID,
    "reviewed_am" TIMESTAMP(3),
    "review_notizen" TEXT,

    CONSTRAINT "dok_extraktionen_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kostenpositionen" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "zeitraum_id" UUID NOT NULL,
    "dokument_id" UUID,
    "kostenart_id" UUID NOT NULL,
    "lieferant_id" UUID,
    "rechnungsdatum" DATE NOT NULL,
    "rechnungsnummer" TEXT,
    "periode_von" DATE,
    "periode_bis" DATE,
    "nettobetrag" DECIMAL(10,2) NOT NULL,
    "bruttobetrag" DECIMAL(10,2) NOT NULL,
    "mwst_satz" DECIMAL(5,2),
    "beschreibung" TEXT,
    "erfassungsquelle" TEXT NOT NULL DEFAULT 'ki_extraktion',
    "manuell_korrigiert" BOOLEAN NOT NULL DEFAULT false,
    "nicht_umlagefaehig" BOOLEAN NOT NULL DEFAULT false,
    "erstellt_am" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "erstellt_von" UUID,

    CONSTRAINT "kostenpositionen_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nk_abrechnungen" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "zeitraum_id" UUID NOT NULL,
    "mietvertrag_id" UUID NOT NULL,
    "einheit_id" UUID NOT NULL,
    "status" "AbrechnungStatus" NOT NULL DEFAULT 'entwurf',
    "abrechnungsbeginn" DATE NOT NULL,
    "abrechnungsende" DATE NOT NULL,
    "bewohnungstage" INTEGER NOT NULL,
    "zeitraum_tage" INTEGER NOT NULL,
    "anteilsfaktor" DECIMAL(8,6) NOT NULL,
    "gesamtkosten_anteil" DECIMAL(10,2) NOT NULL,
    "vorauszahlungen_gesamt" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "nachzahlung_oder_guthaben" DECIMAL(10,2) NOT NULL,
    "formel_log" JSONB NOT NULL,
    "erstellt_am" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "erstellt_von" UUID,
    "freigegeben_am" TIMESTAMP(3),
    "freigegeben_von" UUID,

    CONSTRAINT "nk_abrechnungen_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nk_positionen" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "abrechnung_id" UUID NOT NULL,
    "kostenposition_id" UUID,
    "kostenart_id" UUID NOT NULL,
    "gesamtbetrag_objekt" DECIMAL(10,2) NOT NULL,
    "anteil_faktor" DECIMAL(10,6) NOT NULL,
    "anteil_formel" TEXT NOT NULL,
    "betrag_einheit" DECIMAL(10,2) NOT NULL,
    "vorauszahlung_anteil" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "saldo" DECIMAL(10,2) NOT NULL,

    CONSTRAINT "nk_positionen_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verbrauchserfassungen" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "objekt_id" UUID NOT NULL,
    "zeitraum_id" UUID NOT NULL,
    "verbrauchstyp" "Verbrauchstyp" NOT NULL,
    "anfangsbestand" DECIMAL(10,3),
    "anfangsbestand_datum" DATE,
    "endbestand" DECIMAL(10,3),
    "endbestand_datum" DATE,
    "verbrauch_berechnet" DECIMAL(10,3),
    "einheit" TEXT NOT NULL DEFAULT 'liter',
    "vollstaendigkeitsstatus" "Vollstaendigkeitsstatus" NOT NULL DEFAULT 'fehlt',
    "formel_log" JSONB,
    "notizen" TEXT,
    "erstellt_am" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "erstellt_von" UUID,

    CONSTRAINT "verbrauchserfassungen_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "oel_zukaeufe" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "verbrauchserfassung_id" UUID NOT NULL,
    "kaufdatum" DATE NOT NULL,
    "menge_liter" DECIMAL(8,2) NOT NULL,
    "preis_je_liter" DECIMAL(6,4),
    "preis_gesamt" DECIMAL(10,2) NOT NULL,
    "kostenposition_id" UUID,
    "notizen" TEXT,
    "erstellt_am" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "oel_zukaeufe_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kontoauszuege" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "bankkonto_id" UUID NOT NULL,
    "dateiname" TEXT NOT NULL,
    "s3_key" TEXT NOT NULL,
    "zeitraum_von" DATE NOT NULL,
    "zeitraum_bis" DATE NOT NULL,
    "import_format" TEXT NOT NULL,
    "import_status" TEXT NOT NULL DEFAULT 'pending',
    "buchungen_gesamt" INTEGER NOT NULL DEFAULT 0,
    "buchungen_matched" INTEGER NOT NULL DEFAULT 0,
    "importiert_am" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "importiert_von" UUID NOT NULL,

    CONSTRAINT "kontoauszuege_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "buchungszeilen" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "kontoauszug_id" UUID NOT NULL,
    "buchungsdatum" DATE NOT NULL,
    "wertstellungsdatum" DATE,
    "betrag" DECIMAL(12,2) NOT NULL,
    "waehrung" TEXT NOT NULL DEFAULT 'EUR',
    "auftraggeber_name" TEXT,
    "auftraggeber_iban" TEXT,
    "verwendungszweck" TEXT,
    "buchungstext" TEXT,
    "matching_status" "MatchingStatus" NOT NULL DEFAULT 'unmatched',
    "matching_confidence" DECIMAL(4,3),
    "manuell_zugeordnet" BOOLEAN NOT NULL DEFAULT false,
    "zugeordnet_von" UUID,
    "zugeordnet_am" TIMESTAMP(3),
    "ignoriert" BOOLEAN NOT NULL DEFAULT false,
    "ignoriert_begruendung" TEXT,

    CONSTRAINT "buchungszeilen_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "matching_ergebnisse" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "buchungszeile_id" UUID NOT NULL,
    "mietvertrag_id" UUID NOT NULL,
    "buchungstyp" "Buchungstyp" NOT NULL,
    "confidence" DECIMAL(4,3) NOT NULL,
    "matching_grund" TEXT NOT NULL,
    "prioritaet" INTEGER NOT NULL,
    "bestaetigt" BOOLEAN NOT NULL DEFAULT false,
    "bestaetigt_von" UUID,
    "bestaetigt_am" TIMESTAMP(3),
    "abgelehnt" BOOLEAN NOT NULL DEFAULT false,
    "erstellt_am" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "matching_ergebnisse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "offene_posten" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "mietvertrag_id" UUID NOT NULL,
    "periode_monat" DATE NOT NULL,
    "posten_typ" TEXT NOT NULL,
    "soll_betrag" DECIMAL(10,2) NOT NULL,
    "ist_betrag" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "faellig_am" DATE NOT NULL,
    "mahnung_hinweis" BOOLEAN NOT NULL DEFAULT false,
    "mahnung_datum" DATE,
    "status" "PostenStatus" NOT NULL DEFAULT 'offen',
    "nk_abrechnung_id" UUID,
    "notizen" TEXT,
    "erstellt_am" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "geaendert_am" TIMESTAMP(3),

    CONSTRAINT "offene_posten_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mieterhoehungen" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "mietvertrag_id" UUID NOT NULL,
    "erhoehungstyp" "Erhoehungstyp" NOT NULL,
    "mietart" "Mietart" NOT NULL,
    "naechstmoegliches_datum" DATE NOT NULL,
    "letzte_erhoehung_datum" DATE,
    "aktuelle_miete" DECIMAL(10,2) NOT NULL,
    "neue_miete" DECIMAL(10,2),
    "erhoehungsbetrag" DECIMAL(10,2),
    "ampel_status" "AmpelStatus" NOT NULL,
    "juristische_pruefung_noetig" BOOLEAN NOT NULL DEFAULT false,
    "pruefungshinweis" TEXT,
    "index_aktueller_wert" DECIMAL(8,3),
    "index_quelle" TEXT,
    "berechnung_log" JSONB,
    "status" TEXT NOT NULL DEFAULT 'berechnet',
    "erstellt_am" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "erstellt_von" UUID,
    "geaendert_am" TIMESTAMP(3),

    CONSTRAINT "mieterhoehungen_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exporte" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "export_typ" TEXT NOT NULL,
    "referenz_typ" TEXT NOT NULL,
    "referenz_id" UUID NOT NULL,
    "s3_key" TEXT NOT NULL,
    "dateiname" TEXT NOT NULL,
    "file_size_bytes" BIGINT,
    "erstellt_am" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "erstellt_von" UUID,
    "gueltig_bis" TIMESTAMP(3),
    "nk_abrechnung_id" UUID,

    CONSTRAINT "exporte_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID,
    "entity_type" TEXT NOT NULL,
    "entity_id" UUID,
    "action" TEXT NOT NULL,
    "old_data" JSONB,
    "new_data" JSONB,
    "changed_by" UUID,
    "changed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "session_id" TEXT,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tenants_slug_key" ON "tenants"("slug");

-- CreateIndex
CREATE INDEX "users_tenant_id_idx" ON "users"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_tenant_id_email_key" ON "users"("tenant_id", "email");

-- CreateIndex
CREATE INDEX "objekte_tenant_id_idx" ON "objekte"("tenant_id");

-- CreateIndex
CREATE INDEX "einheiten_objekt_id_idx" ON "einheiten"("objekt_id");

-- CreateIndex
CREATE INDEX "einheiten_tenant_id_idx" ON "einheiten"("tenant_id");

-- CreateIndex
CREATE INDEX "mieter_tenant_id_idx" ON "mieter"("tenant_id");

-- CreateIndex
CREATE INDEX "mietvertraege_einheit_id_idx" ON "mietvertraege"("einheit_id");

-- CreateIndex
CREATE INDEX "mietvertraege_tenant_id_idx" ON "mietvertraege"("tenant_id");

-- CreateIndex
CREATE INDEX "mietvertrag_mieter_mieter_id_idx" ON "mietvertrag_mieter"("mieter_id");

-- CreateIndex
CREATE INDEX "vertragsklauseln_mietvertrag_id_idx" ON "vertragsklauseln"("mietvertrag_id");

-- CreateIndex
CREATE INDEX "kostenarten_tenant_id_idx" ON "kostenarten"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "kostenarten_tenant_id_kuerzel_key" ON "kostenarten"("tenant_id", "kuerzel");

-- CreateIndex
CREATE INDEX "umlageschluessel_objekt_id_idx" ON "umlageschluessel"("objekt_id");

-- CreateIndex
CREATE UNIQUE INDEX "umlageschluessel_objekt_id_kostenart_id_key" ON "umlageschluessel"("objekt_id", "kostenart_id");

-- CreateIndex
CREATE UNIQUE INDEX "bankkonten_tenant_id_iban_key" ON "bankkonten"("tenant_id", "iban");

-- CreateIndex
CREATE INDEX "lieferanten_tenant_id_idx" ON "lieferanten"("tenant_id");

-- CreateIndex
CREATE INDEX "abrechnungszeitraeume_objekt_id_idx" ON "abrechnungszeitraeume"("objekt_id");

-- CreateIndex
CREATE UNIQUE INDEX "dokumente_s3_key_key" ON "dokumente"("s3_key");

-- CreateIndex
CREATE INDEX "dokumente_zeitraum_id_idx" ON "dokumente"("zeitraum_id");

-- CreateIndex
CREATE INDEX "dokumente_sha256_idx" ON "dokumente"("sha256");

-- CreateIndex
CREATE UNIQUE INDEX "dok_extraktionen_dokument_id_key" ON "dok_extraktionen"("dokument_id");

-- CreateIndex
CREATE INDEX "dok_extraktionen_reviewed_idx" ON "dok_extraktionen"("reviewed");

-- CreateIndex
CREATE INDEX "kostenpositionen_zeitraum_id_idx" ON "kostenpositionen"("zeitraum_id");

-- CreateIndex
CREATE INDEX "kostenpositionen_kostenart_id_idx" ON "kostenpositionen"("kostenart_id");

-- CreateIndex
CREATE INDEX "nk_abrechnungen_mietvertrag_id_idx" ON "nk_abrechnungen"("mietvertrag_id");

-- CreateIndex
CREATE INDEX "nk_abrechnungen_status_idx" ON "nk_abrechnungen"("status");

-- CreateIndex
CREATE INDEX "nk_positionen_abrechnung_id_idx" ON "nk_positionen"("abrechnung_id");

-- CreateIndex
CREATE INDEX "verbrauchserfassungen_zeitraum_id_idx" ON "verbrauchserfassungen"("zeitraum_id");

-- CreateIndex
CREATE UNIQUE INDEX "verbrauchserfassungen_objekt_id_zeitraum_id_verbrauchstyp_key" ON "verbrauchserfassungen"("objekt_id", "zeitraum_id", "verbrauchstyp");

-- CreateIndex
CREATE INDEX "oel_zukaeufe_verbrauchserfassung_id_idx" ON "oel_zukaeufe"("verbrauchserfassung_id");

-- CreateIndex
CREATE UNIQUE INDEX "kontoauszuege_s3_key_key" ON "kontoauszuege"("s3_key");

-- CreateIndex
CREATE INDEX "kontoauszuege_bankkonto_id_idx" ON "kontoauszuege"("bankkonto_id");

-- CreateIndex
CREATE INDEX "buchungszeilen_kontoauszug_id_idx" ON "buchungszeilen"("kontoauszug_id");

-- CreateIndex
CREATE INDEX "buchungszeilen_auftraggeber_iban_idx" ON "buchungszeilen"("auftraggeber_iban");

-- CreateIndex
CREATE INDEX "buchungszeilen_matching_status_idx" ON "buchungszeilen"("matching_status");

-- CreateIndex
CREATE INDEX "matching_ergebnisse_buchungszeile_id_idx" ON "matching_ergebnisse"("buchungszeile_id");

-- CreateIndex
CREATE INDEX "matching_ergebnisse_mietvertrag_id_idx" ON "matching_ergebnisse"("mietvertrag_id");

-- CreateIndex
CREATE INDEX "offene_posten_mietvertrag_id_idx" ON "offene_posten"("mietvertrag_id");

-- CreateIndex
CREATE INDEX "offene_posten_status_idx" ON "offene_posten"("status");

-- CreateIndex
CREATE INDEX "mieterhoehungen_mietvertrag_id_idx" ON "mieterhoehungen"("mietvertrag_id");

-- CreateIndex
CREATE INDEX "mieterhoehungen_naechstmoegliches_datum_idx" ON "mieterhoehungen"("naechstmoegliches_datum");

-- CreateIndex
CREATE UNIQUE INDEX "exporte_s3_key_key" ON "exporte"("s3_key");

-- CreateIndex
CREATE INDEX "exporte_referenz_typ_referenz_id_idx" ON "exporte"("referenz_typ", "referenz_id");

-- CreateIndex
CREATE INDEX "audit_logs_entity_type_entity_id_idx" ON "audit_logs"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "audit_logs_tenant_id_changed_at_idx" ON "audit_logs"("tenant_id", "changed_at" DESC);

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "objekte" ADD CONSTRAINT "objekte_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "objekte" ADD CONSTRAINT "objekte_erstellt_von_fkey" FOREIGN KEY ("erstellt_von") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "einheiten" ADD CONSTRAINT "einheiten_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "einheiten" ADD CONSTRAINT "einheiten_objekt_id_fkey" FOREIGN KEY ("objekt_id") REFERENCES "objekte"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mieter" ADD CONSTRAINT "mieter_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mietvertraege" ADD CONSTRAINT "mietvertraege_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mietvertraege" ADD CONSTRAINT "mietvertraege_einheit_id_fkey" FOREIGN KEY ("einheit_id") REFERENCES "einheiten"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mietvertraege" ADD CONSTRAINT "mietvertraege_erstellt_von_fkey" FOREIGN KEY ("erstellt_von") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mietvertrag_mieter" ADD CONSTRAINT "mietvertrag_mieter_mietvertrag_id_fkey" FOREIGN KEY ("mietvertrag_id") REFERENCES "mietvertraege"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mietvertrag_mieter" ADD CONSTRAINT "mietvertrag_mieter_mieter_id_fkey" FOREIGN KEY ("mieter_id") REFERENCES "mieter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vertragsklauseln" ADD CONSTRAINT "vertragsklauseln_mietvertrag_id_fkey" FOREIGN KEY ("mietvertrag_id") REFERENCES "mietvertraege"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kostenarten" ADD CONSTRAINT "kostenarten_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "umlageschluessel" ADD CONSTRAINT "umlageschluessel_objekt_id_fkey" FOREIGN KEY ("objekt_id") REFERENCES "objekte"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "umlageschluessel" ADD CONSTRAINT "umlageschluessel_kostenart_id_fkey" FOREIGN KEY ("kostenart_id") REFERENCES "kostenarten"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bankkonten" ADD CONSTRAINT "bankkonten_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bankkonto_objekte" ADD CONSTRAINT "bankkonto_objekte_bankkonto_id_fkey" FOREIGN KEY ("bankkonto_id") REFERENCES "bankkonten"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bankkonto_objekte" ADD CONSTRAINT "bankkonto_objekte_objekt_id_fkey" FOREIGN KEY ("objekt_id") REFERENCES "objekte"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lieferanten" ADD CONSTRAINT "lieferanten_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "abrechnungszeitraeume" ADD CONSTRAINT "abrechnungszeitraeume_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "abrechnungszeitraeume" ADD CONSTRAINT "abrechnungszeitraeume_objekt_id_fkey" FOREIGN KEY ("objekt_id") REFERENCES "objekte"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dokumente" ADD CONSTRAINT "dokumente_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dokumente" ADD CONSTRAINT "dokumente_zeitraum_id_fkey" FOREIGN KEY ("zeitraum_id") REFERENCES "abrechnungszeitraeume"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dok_extraktionen" ADD CONSTRAINT "dok_extraktionen_dokument_id_fkey" FOREIGN KEY ("dokument_id") REFERENCES "dokumente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dok_extraktionen" ADD CONSTRAINT "dok_extraktionen_reviewed_von_fkey" FOREIGN KEY ("reviewed_von") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kostenpositionen" ADD CONSTRAINT "kostenpositionen_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kostenpositionen" ADD CONSTRAINT "kostenpositionen_zeitraum_id_fkey" FOREIGN KEY ("zeitraum_id") REFERENCES "abrechnungszeitraeume"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kostenpositionen" ADD CONSTRAINT "kostenpositionen_dokument_id_fkey" FOREIGN KEY ("dokument_id") REFERENCES "dokumente"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kostenpositionen" ADD CONSTRAINT "kostenpositionen_kostenart_id_fkey" FOREIGN KEY ("kostenart_id") REFERENCES "kostenarten"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kostenpositionen" ADD CONSTRAINT "kostenpositionen_lieferant_id_fkey" FOREIGN KEY ("lieferant_id") REFERENCES "lieferanten"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nk_abrechnungen" ADD CONSTRAINT "nk_abrechnungen_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nk_abrechnungen" ADD CONSTRAINT "nk_abrechnungen_zeitraum_id_fkey" FOREIGN KEY ("zeitraum_id") REFERENCES "abrechnungszeitraeume"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nk_abrechnungen" ADD CONSTRAINT "nk_abrechnungen_mietvertrag_id_fkey" FOREIGN KEY ("mietvertrag_id") REFERENCES "mietvertraege"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nk_abrechnungen" ADD CONSTRAINT "nk_abrechnungen_einheit_id_fkey" FOREIGN KEY ("einheit_id") REFERENCES "einheiten"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nk_abrechnungen" ADD CONSTRAINT "nk_abrechnungen_erstellt_von_fkey" FOREIGN KEY ("erstellt_von") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nk_abrechnungen" ADD CONSTRAINT "nk_abrechnungen_freigegeben_von_fkey" FOREIGN KEY ("freigegeben_von") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nk_positionen" ADD CONSTRAINT "nk_positionen_abrechnung_id_fkey" FOREIGN KEY ("abrechnung_id") REFERENCES "nk_abrechnungen"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nk_positionen" ADD CONSTRAINT "nk_positionen_kostenposition_id_fkey" FOREIGN KEY ("kostenposition_id") REFERENCES "kostenpositionen"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nk_positionen" ADD CONSTRAINT "nk_positionen_kostenart_id_fkey" FOREIGN KEY ("kostenart_id") REFERENCES "kostenarten"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verbrauchserfassungen" ADD CONSTRAINT "verbrauchserfassungen_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verbrauchserfassungen" ADD CONSTRAINT "verbrauchserfassungen_objekt_id_fkey" FOREIGN KEY ("objekt_id") REFERENCES "objekte"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verbrauchserfassungen" ADD CONSTRAINT "verbrauchserfassungen_zeitraum_id_fkey" FOREIGN KEY ("zeitraum_id") REFERENCES "abrechnungszeitraeume"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oel_zukaeufe" ADD CONSTRAINT "oel_zukaeufe_verbrauchserfassung_id_fkey" FOREIGN KEY ("verbrauchserfassung_id") REFERENCES "verbrauchserfassungen"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oel_zukaeufe" ADD CONSTRAINT "oel_zukaeufe_kostenposition_id_fkey" FOREIGN KEY ("kostenposition_id") REFERENCES "kostenpositionen"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kontoauszuege" ADD CONSTRAINT "kontoauszuege_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kontoauszuege" ADD CONSTRAINT "kontoauszuege_bankkonto_id_fkey" FOREIGN KEY ("bankkonto_id") REFERENCES "bankkonten"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "buchungszeilen" ADD CONSTRAINT "buchungszeilen_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "buchungszeilen" ADD CONSTRAINT "buchungszeilen_kontoauszug_id_fkey" FOREIGN KEY ("kontoauszug_id") REFERENCES "kontoauszuege"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "buchungszeilen" ADD CONSTRAINT "buchungszeilen_zugeordnet_von_fkey" FOREIGN KEY ("zugeordnet_von") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "matching_ergebnisse" ADD CONSTRAINT "matching_ergebnisse_buchungszeile_id_fkey" FOREIGN KEY ("buchungszeile_id") REFERENCES "buchungszeilen"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "matching_ergebnisse" ADD CONSTRAINT "matching_ergebnisse_mietvertrag_id_fkey" FOREIGN KEY ("mietvertrag_id") REFERENCES "mietvertraege"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "matching_ergebnisse" ADD CONSTRAINT "matching_ergebnisse_bestaetigt_von_fkey" FOREIGN KEY ("bestaetigt_von") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offene_posten" ADD CONSTRAINT "offene_posten_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offene_posten" ADD CONSTRAINT "offene_posten_mietvertrag_id_fkey" FOREIGN KEY ("mietvertrag_id") REFERENCES "mietvertraege"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offene_posten" ADD CONSTRAINT "offene_posten_nk_abrechnung_id_fkey" FOREIGN KEY ("nk_abrechnung_id") REFERENCES "nk_abrechnungen"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mieterhoehungen" ADD CONSTRAINT "mieterhoehungen_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mieterhoehungen" ADD CONSTRAINT "mieterhoehungen_mietvertrag_id_fkey" FOREIGN KEY ("mietvertrag_id") REFERENCES "mietvertraege"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exporte" ADD CONSTRAINT "exporte_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exporte" ADD CONSTRAINT "exporte_nk_abrechnung_id_fkey" FOREIGN KEY ("nk_abrechnung_id") REFERENCES "nk_abrechnungen"("id") ON DELETE SET NULL ON UPDATE CASCADE;
