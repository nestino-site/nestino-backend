-- AlterTable
ALTER TABLE "sites" ADD COLUMN     "autoPublish" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "publishWebhookSecret" TEXT,
ADD COLUMN     "publishWebhookUrl" TEXT;
