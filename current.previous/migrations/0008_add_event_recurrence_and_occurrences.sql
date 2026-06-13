ALTER TABLE "Event" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'EVENT';
ALTER TABLE "Event" ADD COLUMN "recurrenceType" TEXT NOT NULL DEFAULT 'NONE';
ALTER TABLE "Event" ADD COLUMN "recurrenceDaysJson" TEXT NOT NULL DEFAULT '[]';
ALTER TABLE "Event" ADD COLUMN "recurrenceStartDate" DATETIME;
ALTER TABLE "Event" ADD COLUMN "recurrenceEndDate" DATETIME;
ALTER TABLE "Event" ADD COLUMN "recurrenceStartTime" TEXT;
ALTER TABLE "Event" ADD COLUMN "recurrenceEndTime" TEXT;

CREATE TABLE "EventOccurrence" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "eventId" INTEGER NOT NULL,
  "occurrenceDate" DATETIME NOT NULL,
  "startsAt" DATETIME NOT NULL,
  "endsAt" DATETIME,
  "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
  "isOverride" BOOLEAN NOT NULL DEFAULT false,
  "titleOverride" TEXT,
  "subtitleOverride" TEXT,
  "excerptOverride" TEXT,
  "contentOverrideJson" TEXT,
  "placeNameOverride" TEXT,
  "placeAddressOverride" TEXT,
  "placeCityOverride" TEXT,
  "mapUrlOverride" TEXT,
  "coverImageOverrideUrl" TEXT,
  "publicCapacityOverride" INTEGER,
  "internalCapacityOverride" INTEGER,
  "internalParticipationInfoOverride" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "EventOccurrence_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "EventOccurrence_eventId_occurrenceDate_key" ON "EventOccurrence"("eventId", "occurrenceDate");
CREATE INDEX "EventOccurrence_occurrenceDate_status_idx" ON "EventOccurrence"("occurrenceDate", "status");
CREATE INDEX "EventOccurrence_eventId_startsAt_idx" ON "EventOccurrence"("eventId", "startsAt");
CREATE INDEX "Event_kind_status_startsAt_idx" ON "Event"("kind", "status", "startsAt");
