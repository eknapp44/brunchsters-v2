-- Partial unique indexes: at most one confirmed, non-deleted location and
-- one confirmed, non-deleted time per brunch. Not expressible in the Prisma
-- schema DSL (schema.prisma documents this with a comment on each model).
-- Belt-and-braces alongside confirmBrunch.ts's own guarantee (spec 0005 M5).
CREATE UNIQUE INDEX "BrunchLocation_brunchId_confirmed_key"
  ON "BrunchLocation"("brunchId")
  WHERE "isConfirmed" AND "deletedAt" IS NULL;

CREATE UNIQUE INDEX "BrunchTime_brunchId_confirmed_key"
  ON "BrunchTime"("brunchId")
  WHERE "isConfirmed" AND "deletedAt" IS NULL;
