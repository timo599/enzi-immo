-- CreateTable
CREATE TABLE "leitfaeden" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "titel" VARCHAR(300) NOT NULL,
    "kategorie" VARCHAR(100),
    "beschreibung" TEXT,
    "inhalt" TEXT,
    "user_id" UUID,
    "fuer_rolle" VARCHAR(50),
    "objekt_id" UUID,
    "schritte" JSONB NOT NULL DEFAULT '[]',
    "budget_grenze" DECIMAL(12,2),
    "sortierung" INTEGER NOT NULL DEFAULT 0,
    "aktiv" BOOLEAN NOT NULL DEFAULT true,
    "erstellt_am" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "geaendert_am" TIMESTAMP(3),

    CONSTRAINT "leitfaeden_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "leitfaeden_tenant_id_idx" ON "leitfaeden"("tenant_id");

-- CreateIndex
CREATE INDEX "leitfaeden_user_id_idx" ON "leitfaeden"("user_id");

-- AddForeignKey
ALTER TABLE "leitfaeden" ADD CONSTRAINT "leitfaeden_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leitfaeden" ADD CONSTRAINT "leitfaeden_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leitfaeden" ADD CONSTRAINT "leitfaeden_objekt_id_fkey" FOREIGN KEY ("objekt_id") REFERENCES "objekte"("id") ON DELETE SET NULL ON UPDATE CASCADE;
