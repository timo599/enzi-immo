-- CreateTable
CREATE TABLE "mieter_portal_users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "mieter_id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "aktiv" BOOLEAN NOT NULL DEFAULT true,
    "letzter_login" TIMESTAMP(3),
    "erstellt_am" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mieter_portal_users_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "mieter_portal_users_mieter_id_key" ON "mieter_portal_users"("mieter_id");

-- CreateIndex
CREATE INDEX "mieter_portal_users_tenant_id_idx" ON "mieter_portal_users"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "mieter_portal_users_tenant_id_email_key" ON "mieter_portal_users"("tenant_id", "email");

-- AddForeignKey
ALTER TABLE "mieter_portal_users" ADD CONSTRAINT "mieter_portal_users_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mieter_portal_users" ADD CONSTRAINT "mieter_portal_users_mieter_id_fkey" FOREIGN KEY ("mieter_id") REFERENCES "mieter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
