-- DropForeignKey
ALTER TABLE "BrunchLocation" DROP CONSTRAINT "BrunchLocation_decisionTypeId_fkey";

-- DropForeignKey
ALTER TABLE "BrunchTime" DROP CONSTRAINT "BrunchTime_decisionTypeId_fkey";

-- AlterTable
ALTER TABLE "BrunchLocation" DROP COLUMN "decisionTypeId";

-- AlterTable
ALTER TABLE "BrunchTime" DROP COLUMN "decisionTypeId";
