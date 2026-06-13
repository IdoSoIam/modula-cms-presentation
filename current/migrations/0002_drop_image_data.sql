PRAGMA defer_foreign_keys = ON;

CREATE TABLE "new_Image" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "filename" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "uploadedById" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Image_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

INSERT INTO "new_Image" ("id", "filename", "url", "mimeType", "size", "width", "height", "uploadedById", "createdAt")
SELECT "id", "filename", "url", "mimeType", "size", "width", "height", "uploadedById", "createdAt"
FROM "Image";

DROP TABLE "Image";
ALTER TABLE "new_Image" RENAME TO "Image";

CREATE INDEX "Image_createdAt_idx" ON "Image"("createdAt");
