CREATE TABLE "MemberRole" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "color" TEXT,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "MemberRole_slug_key" ON "MemberRole"("slug");

CREATE TABLE "UserMemberRole" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "memberRoleId" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserMemberRole_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "UserMemberRole_memberRoleId_fkey" FOREIGN KEY ("memberRoleId") REFERENCES "MemberRole" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "UserMemberRole_userId_memberRoleId_key" ON "UserMemberRole"("userId", "memberRoleId");
CREATE INDEX "UserMemberRole_memberRoleId_idx" ON "UserMemberRole"("memberRoleId");

CREATE TABLE "EventAudienceMemberRole" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "eventId" INTEGER NOT NULL,
    "memberRoleId" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EventAudienceMemberRole_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "EventAudienceMemberRole_memberRoleId_fkey" FOREIGN KEY ("memberRoleId") REFERENCES "MemberRole" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "EventAudienceMemberRole_eventId_memberRoleId_key" ON "EventAudienceMemberRole"("eventId", "memberRoleId");
CREATE INDEX "EventAudienceMemberRole_memberRoleId_idx" ON "EventAudienceMemberRole"("memberRoleId");

INSERT OR IGNORE INTO "MemberRole" ("slug", "name", "description", "color", "isSystem", "isDefault", "createdAt", "updatedAt")
VALUES
    ('adherent', 'Adhérent', 'Rôle associatif adhérent', '#2563eb', 1, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('benevole', 'Bénévole', 'Rôle associatif bénévole', '#16a34a', 1, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('equipe_cuisine', 'Équipe de cuisinier', 'Rôle associatif cuisine', '#ea580c', 1, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('conseil_administration', 'Conseil d''administration', 'Rôle associatif gouvernance', '#7c3aed', 1, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT OR IGNORE INTO "MemberRole" ("slug", "name", "description", "color", "isSystem", "isDefault", "createdAt", "updatedAt")
SELECT DISTINCT
    "Role"."slug",
    "Role"."name",
    'Migré depuis une audience événement historique',
    NULL,
    1,
    0,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "EventAudienceRole"
INNER JOIN "Role" ON "Role"."id" = "EventAudienceRole"."roleId";

INSERT OR IGNORE INTO "UserMemberRole" ("userId", "memberRoleId", "createdAt")
SELECT
    "User"."id",
    "MemberRole"."id",
    CURRENT_TIMESTAMP
FROM "User"
INNER JOIN "Role" ON "Role"."id" = "User"."roleId"
INNER JOIN "MemberRole" ON "MemberRole"."slug" = "Role"."slug"
WHERE "Role"."slug" IN ('adherent', 'benevole', 'equipe_cuisine', 'conseil_administration');

INSERT OR IGNORE INTO "EventAudienceMemberRole" ("eventId", "memberRoleId", "createdAt")
SELECT
    "EventAudienceRole"."eventId",
    "MemberRole"."id",
    CURRENT_TIMESTAMP
FROM "EventAudienceRole"
INNER JOIN "Role" ON "Role"."id" = "EventAudienceRole"."roleId"
INNER JOIN "MemberRole" ON "MemberRole"."slug" = "Role"."slug";

DROP TABLE IF EXISTS "EventAudienceRole";
