-- AlterTable
ALTER TABLE "Brunch" ADD COLUMN     "cancelNoticeSentAt" TIMESTAMP(3),
ADD COLUMN     "cancelledAt" TIMESTAMP(3),
ADD COLUMN     "cancelledBy" UUID,
ADD COLUMN     "statusBeforeCancelId" UUID;

-- AlterTable
ALTER TABLE "BrunchAttendee" ADD COLUMN     "hiddenAt" TIMESTAMP(3);

-- AddForeignKey
ALTER TABLE "Brunch" ADD CONSTRAINT "Brunch_statusBeforeCancelId_fkey" FOREIGN KEY ("statusBeforeCancelId") REFERENCES "BrunchStatus"("id") ON DELETE SET NULL ON UPDATE CASCADE;
