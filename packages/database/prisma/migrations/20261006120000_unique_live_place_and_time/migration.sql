-- Partial unique indexes: at most one *live* (non-deleted) BrunchLocation
-- per brunchId+placeId, and at most one *live* BrunchTime per
-- brunchId+scheduledAt. Not expressible in the Prisma schema DSL (schema.prisma
-- documents this with a comment on each model).
--
-- Closes a gap found in spec 0005's architect review: addLocation and an
-- approved location/time suggestion for the same real-world place never
-- checked against each other, so a host adding a place directly and an
-- attendee suggesting the same place (then approved) could both end up as
-- live, votable options for the identical place — splitting the vote
-- between two rows that should have been one.
CREATE UNIQUE INDEX "BrunchLocation_brunchId_placeId_live_key"
  ON "BrunchLocation"("brunchId", "placeId")
  WHERE "deletedAt" IS NULL;

CREATE UNIQUE INDEX "BrunchTime_brunchId_scheduledAt_live_key"
  ON "BrunchTime"("brunchId", "scheduledAt")
  WHERE "deletedAt" IS NULL;
