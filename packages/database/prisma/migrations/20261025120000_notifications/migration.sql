-- Spec 0015 / ADR 0017. The Notification table has never been written to, so the NOT NULL columns
-- below need no backfill. NotificationLevel is created and filled first because existing attendee
-- rows take the 'all' level through the column default (a fixed id the seed uses as well).

-- CreateTable
CREATE TABLE "NotificationLevel" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationLevel_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "NotificationLevel_code_key" ON "NotificationLevel"("code");

-- Seed rows the column default depends on (the seed script upserts the same rows by code)
INSERT INTO "NotificationLevel" ("id", "code", "label", "sortOrder", "updatedAt") VALUES
    ('00000000-0000-4000-8000-00000000a111', 'all', 'All', 1, CURRENT_TIMESTAMP),
    ('00000000-0000-4000-8000-00000000a112', 'big_stuff', 'Just big stuff', 2, CURRENT_TIMESTAMP),
    ('00000000-0000-4000-8000-00000000a113', 'muted', 'Muted', 3, CURRENT_TIMESTAMP);

-- DropIndex
DROP INDEX "Notification_userId_idx";

-- AlterTable
ALTER TABLE "Brunch" ADD COLUMN     "votingDeadlineSetAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "BrunchAttendee" ADD COLUMN     "notificationLevelId" UUID NOT NULL DEFAULT '00000000-0000-4000-8000-00000000a111';

-- AlterTable
ALTER TABLE "BrunchInvite" ADD COLUMN     "emailFailedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "data" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "dedupeKey" TEXT NOT NULL,
ADD COLUMN     "lastEventAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex
CREATE INDEX "Notification_userId_readAt_lastEventAt_idx" ON "Notification"("userId", "readAt", "lastEventAt");

-- CreateIndex
CREATE UNIQUE INDEX "Notification_userId_dedupeKey_key" ON "Notification"("userId", "dedupeKey");

-- AddForeignKey
ALTER TABLE "BrunchAttendee" ADD CONSTRAINT "BrunchAttendee_notificationLevelId_fkey" FOREIGN KEY ("notificationLevelId") REFERENCES "NotificationLevel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
