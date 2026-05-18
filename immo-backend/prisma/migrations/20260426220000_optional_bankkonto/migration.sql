-- AlterTable: make bankkonto_id optional on kontoauszuege
ALTER TABLE "kontoauszuege" ALTER COLUMN "bankkonto_id" DROP NOT NULL;
