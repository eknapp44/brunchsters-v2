-- AlterTable
ALTER TABLE "Brunch" ADD COLUMN     "requireHostApprovalForOptions" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "BrunchOptionSuggestionStatus" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BrunchOptionSuggestionStatus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BrunchLocationSuggestion" (
    "id" UUID NOT NULL,
    "brunchId" UUID NOT NULL,
    "suggestedById" UUID NOT NULL,
    "placeId" TEXT NOT NULL,
    "placeName" TEXT NOT NULL,
    "placeAddress" TEXT NOT NULL,
    "placeUrl" TEXT NOT NULL,
    "timezone" TEXT NOT NULL,
    "statusId" UUID NOT NULL,
    "reviewedById" UUID,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BrunchLocationSuggestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BrunchTimeSuggestion" (
    "id" UUID NOT NULL,
    "brunchId" UUID NOT NULL,
    "suggestedById" UUID NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "statusId" UUID NOT NULL,
    "reviewedById" UUID,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BrunchTimeSuggestion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BrunchOptionSuggestionStatus_code_key" ON "BrunchOptionSuggestionStatus"("code");

-- CreateIndex
CREATE INDEX "BrunchLocationSuggestion_brunchId_idx" ON "BrunchLocationSuggestion"("brunchId");

-- CreateIndex
CREATE UNIQUE INDEX "BrunchLocationSuggestion_brunchId_placeId_key" ON "BrunchLocationSuggestion"("brunchId", "placeId");

-- CreateIndex
CREATE INDEX "BrunchTimeSuggestion_brunchId_idx" ON "BrunchTimeSuggestion"("brunchId");

-- CreateIndex
CREATE UNIQUE INDEX "BrunchTimeSuggestion_brunchId_scheduledAt_key" ON "BrunchTimeSuggestion"("brunchId", "scheduledAt");

-- AddForeignKey
ALTER TABLE "BrunchLocationSuggestion" ADD CONSTRAINT "BrunchLocationSuggestion_brunchId_fkey" FOREIGN KEY ("brunchId") REFERENCES "Brunch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrunchLocationSuggestion" ADD CONSTRAINT "BrunchLocationSuggestion_suggestedById_fkey" FOREIGN KEY ("suggestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrunchLocationSuggestion" ADD CONSTRAINT "BrunchLocationSuggestion_statusId_fkey" FOREIGN KEY ("statusId") REFERENCES "BrunchOptionSuggestionStatus"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrunchLocationSuggestion" ADD CONSTRAINT "BrunchLocationSuggestion_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrunchTimeSuggestion" ADD CONSTRAINT "BrunchTimeSuggestion_brunchId_fkey" FOREIGN KEY ("brunchId") REFERENCES "Brunch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrunchTimeSuggestion" ADD CONSTRAINT "BrunchTimeSuggestion_suggestedById_fkey" FOREIGN KEY ("suggestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrunchTimeSuggestion" ADD CONSTRAINT "BrunchTimeSuggestion_statusId_fkey" FOREIGN KEY ("statusId") REFERENCES "BrunchOptionSuggestionStatus"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrunchTimeSuggestion" ADD CONSTRAINT "BrunchTimeSuggestion_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
