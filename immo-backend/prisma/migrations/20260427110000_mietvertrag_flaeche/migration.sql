-- Mietfläche m² zum Mietvertrag hinzufügen (Teilflächenmiete)
ALTER TABLE "mietvertraege" ADD COLUMN IF NOT EXISTS "mietflaeche_m2" DECIMAL(8,2);
