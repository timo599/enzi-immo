-- DropForeignKey
ALTER TABLE "dokumente" DROP CONSTRAINT "dokumente_zeitraum_id_fkey";

-- AlterTable
ALTER TABLE "dokumente" ALTER COLUMN "zeitraum_id" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "dokumente" ADD CONSTRAINT "dokumente_zeitraum_id_fkey" FOREIGN KEY ("zeitraum_id") REFERENCES "abrechnungszeitraeume"("id") ON DELETE SET NULL ON UPDATE CASCADE;
