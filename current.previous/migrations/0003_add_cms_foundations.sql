CREATE TABLE IF NOT EXISTS "CmsPage" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "path" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "pageType" TEXT NOT NULL DEFAULT 'CMS',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "templateKey" TEXT NOT NULL DEFAULT 'default',
    "rendererKey" TEXT,
    "applicationPosition" TEXT NOT NULL DEFAULT 'AFTER_CONTENT',
    "translationsJson" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE TABLE IF NOT EXISTS "CmsNavigationItem" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "menu" TEXT NOT NULL DEFAULT 'PRIMARY',
    "itemType" TEXT NOT NULL DEFAULT 'CMS_PAGE',
    "title" TEXT NOT NULL,
    "labelsJson" TEXT NOT NULL,
    "href" TEXT NOT NULL,
    "newTab" BOOLEAN NOT NULL DEFAULT false,
    "visible" BOOLEAN NOT NULL DEFAULT true,
    "position" INTEGER NOT NULL DEFAULT 0,
    "pageId" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CmsNavigationItem_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "CmsPage" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "CmsPage_path_key" ON "CmsPage"("path");
CREATE UNIQUE INDEX IF NOT EXISTS "CmsPage_slug_key" ON "CmsPage"("slug");
CREATE INDEX IF NOT EXISTS "CmsPage_status_pageType_idx" ON "CmsPage"("status", "pageType");
CREATE INDEX IF NOT EXISTS "CmsNavigationItem_menu_visible_position_idx" ON "CmsNavigationItem"("menu", "visible", "position");
CREATE INDEX IF NOT EXISTS "CmsNavigationItem_pageId_idx" ON "CmsNavigationItem"("pageId");
