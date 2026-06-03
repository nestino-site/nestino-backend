-- AlterTable
ALTER TABLE "subjects" ADD COLUMN "pillarPageId" INTEGER;

-- AddForeignKey
ALTER TABLE "subjects" ADD CONSTRAINT "subjects_pillarPageId_fkey" FOREIGN KEY ("pillarPageId") REFERENCES "pages"("id") ON DELETE SET NULL ON UPDATE CASCADE;
