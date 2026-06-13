-- CreateTable
CREATE TABLE "SiteParams" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "User" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "firstName" TEXT,
    "lastName" TEXT,
    "birthDate" DATETIME,
    "role" TEXT NOT NULL DEFAULT 'user',
    "street" TEXT,
    "city" TEXT,
    "postalCode" TEXT,
    "country" TEXT DEFAULT 'France',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Vegetable" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'KG',
    "price" DECIMAL NOT NULL,
    "imageUrl" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Basket" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "imageUrl" TEXT,
    "computedPrice" DECIMAL NOT NULL DEFAULT 0,
    "finalPrice" DECIMAL NOT NULL DEFAULT 0,
    "available" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "BasketItem" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "basketId" INTEGER NOT NULL,
    "vegetableId" INTEGER NOT NULL,
    "quantity" DECIMAL NOT NULL,
    CONSTRAINT "BasketItem_basketId_fkey" FOREIGN KEY ("basketId") REFERENCES "Basket" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "BasketItem_vegetableId_fkey" FOREIGN KEY ("vegetableId") REFERENCES "Vegetable" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Reservation" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "basketId" INTEGER NOT NULL,
    "userId" INTEGER,
    "customerName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'fr',
    "phone" TEXT,
    "message" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "adminNote" TEXT,
    "confirmedAt" DATETIME,
    "deliveryType" TEXT,
    "pickupPointId" INTEGER,
    "deliveryTourId" INTEGER,
    "deliveryAddress" TEXT,
    "deliveryCity" TEXT,
    "deliveryPostalCode" TEXT,
    "fulfillmentDate" DATETIME,
    "fulfillmentTime" TEXT,
    "fulfillmentLocation" TEXT,
    "monthlySubscription" BOOLEAN NOT NULL DEFAULT false,
    "googleCalendarEventId" TEXT,
    "googleCalendarSyncedAt" DATETIME,
    "publicActionToken" TEXT,
    "cancelledByCustomerAt" DATETIME,
    "subscriptionActive" BOOLEAN NOT NULL DEFAULT true,
    "subscriptionCancelledAt" DATETIME,
    "archivedAt" DATETIME,
    "scheduleProposalPendingBy" TEXT,
    "lastScheduleProposalAt" DATETIME,
    "scheduleProposalAcceptedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Reservation_basketId_fkey" FOREIGN KEY ("basketId") REFERENCES "Basket" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Reservation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Reservation_pickupPointId_fkey" FOREIGN KEY ("pickupPointId") REFERENCES "PickupPoint" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Reservation_deliveryTourId_fkey" FOREIGN KEY ("deliveryTourId") REFERENCES "DeliveryTour" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ReservationScheduleProposal" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "reservationId" INTEGER NOT NULL,
    "proposedBy" TEXT NOT NULL,
    "proposalDate" DATETIME NOT NULL,
    "proposalTime" TEXT NOT NULL,
    "proposalLocation" TEXT,
    "acceptedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ReservationScheduleProposal_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "Reservation" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ReservationOccurrence" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "reservationId" INTEGER NOT NULL,
    "occurrenceDate" DATETIME NOT NULL,
    "originalOccurrenceDate" DATETIME,
    "occurrenceTime" TEXT,
    "occurrenceLocation" TEXT,
    "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "customSchedule" BOOLEAN NOT NULL DEFAULT false,
    "cancelledAt" DATETIME,
    "cancellationReason" TEXT,
    "googleCalendarEventId" TEXT,
    "lastNotifiedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ReservationOccurrence_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "Reservation" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ReservationNotification" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "reservationId" INTEGER NOT NULL,
    "occurrenceId" INTEGER,
    "kind" TEXT NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'EMAIL',
    "recipientEmail" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "summary" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ReservationNotification_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "Reservation" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ReservationNotification_occurrenceId_fkey" FOREIGN KEY ("occurrenceId") REFERENCES "ReservationOccurrence" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PickupPoint" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "details" TEXT,
    "delayDays" INTEGER NOT NULL DEFAULT 0,
    "deliveryDay" INTEGER,
    "pickupStartTime" TEXT,
    "openingHours" TEXT,
    "websiteUrl" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "DeliveryTour" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "monthlyPrice" DECIMAL,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "TourCity" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tourId" INTEGER NOT NULL,
    "city" TEXT NOT NULL,
    "postalCodes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TourCity_tourId_fkey" FOREIGN KEY ("tourId") REFERENCES "DeliveryTour" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Article" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "excerpt" TEXT,
    "content" TEXT NOT NULL,
    "coverUrl" TEXT,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "publishedAt" DATETIME,
    "authorId" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Article_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Image" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "filename" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "data" BLOB,
    "width" INTEGER,
    "height" INTEGER,
    "uploadedById" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Image_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "SiteParams_key_key" ON "SiteParams"("key");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Vegetable_name_key" ON "Vegetable"("name");

-- CreateIndex
CREATE INDEX "BasketItem_basketId_idx" ON "BasketItem"("basketId");

-- CreateIndex
CREATE INDEX "BasketItem_vegetableId_idx" ON "BasketItem"("vegetableId");

-- CreateIndex
CREATE UNIQUE INDEX "BasketItem_basketId_vegetableId_key" ON "BasketItem"("basketId", "vegetableId");

-- CreateIndex
CREATE UNIQUE INDEX "Reservation_publicActionToken_key" ON "Reservation"("publicActionToken");

-- CreateIndex
CREATE INDEX "Reservation_basketId_idx" ON "Reservation"("basketId");

-- CreateIndex
CREATE INDEX "Reservation_userId_idx" ON "Reservation"("userId");

-- CreateIndex
CREATE INDEX "Reservation_status_idx" ON "Reservation"("status");

-- CreateIndex
CREATE INDEX "Reservation_archivedAt_idx" ON "Reservation"("archivedAt");

-- CreateIndex
CREATE INDEX "Reservation_pickupPointId_idx" ON "Reservation"("pickupPointId");

-- CreateIndex
CREATE INDEX "Reservation_deliveryTourId_idx" ON "Reservation"("deliveryTourId");

-- CreateIndex
CREATE INDEX "ReservationScheduleProposal_reservationId_createdAt_idx" ON "ReservationScheduleProposal"("reservationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ReservationScheduleProposal_reservationId_proposalDate_proposalTime_key" ON "ReservationScheduleProposal"("reservationId", "proposalDate", "proposalTime");

-- CreateIndex
CREATE INDEX "ReservationOccurrence_reservationId_occurrenceDate_idx" ON "ReservationOccurrence"("reservationId", "occurrenceDate");

-- CreateIndex
CREATE INDEX "ReservationNotification_reservationId_createdAt_idx" ON "ReservationNotification"("reservationId", "createdAt");

-- CreateIndex
CREATE INDEX "ReservationNotification_occurrenceId_idx" ON "ReservationNotification"("occurrenceId");

-- CreateIndex
CREATE INDEX "TourCity_tourId_idx" ON "TourCity"("tourId");

-- CreateIndex
CREATE UNIQUE INDEX "Article_slug_key" ON "Article"("slug");

-- CreateIndex
CREATE INDEX "Article_published_publishedAt_idx" ON "Article"("published", "publishedAt");

-- CreateIndex
CREATE INDEX "Image_createdAt_idx" ON "Image"("createdAt");
