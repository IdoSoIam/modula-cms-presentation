-- CreateTable
CREATE TABLE "ImageVariant" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "imageId" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "fit" TEXT,
    "quality" INTEGER,
    "format" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ImageVariant_imageId_fkey" FOREIGN KEY ("imageId") REFERENCES "Image" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ImageUsage" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "imageId" INTEGER NOT NULL,
    "scopeType" TEXT NOT NULL,
    "scopeId" TEXT NOT NULL,
    "fieldKey" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ImageUsage_imageId_fkey" FOREIGN KEY ("imageId") REFERENCES "Image" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "ImageVariant_storageKey_key" ON "ImageVariant"("storageKey");

-- CreateIndex
CREATE INDEX "ImageVariant_imageId_createdAt_idx" ON "ImageVariant"("imageId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ImageVariant_unique_signature" ON "ImageVariant"("imageId", "width", "height", "fit", "quality", "format");

-- CreateIndex
CREATE INDEX "ImageUsage_imageId_scopeType_idx" ON "ImageUsage"("imageId", "scopeType");

-- CreateIndex
CREATE UNIQUE INDEX "ImageUsage_unique_scope" ON "ImageUsage"("imageId", "scopeType", "scopeId", "fieldKey");
