ALTER TABLE "CmsPage" ADD COLUMN "specialRole" TEXT;

CREATE INDEX "CmsPage_specialRole_idx" ON "CmsPage"("specialRole");
