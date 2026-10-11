-- Spec 0007 / ADR 0008: one email address is one person, however it is capitalized.
--
-- Application code now stores and compares addresses in one canonical form (trimmed and
-- lowercased, produced by normalizeEmail in @brunchsters/shared). This migration brings existing
-- rows into that form and adds CHECK constraints so a code path that forgets to normalize fails
-- loudly instead of silently creating a duplicate. Prisma cannot express check constraints in the
-- schema DSL (like the partial unique indexes from spec 0005), so they live only here.

-- 1. Refuse to proceed if normalizing would make two rows collide on a unique key. Failing here,
--    with a readable message, beats a unique-constraint error half way through the updates.
--    Soft-deleted rows are included: the unique keys cover them too.
DO $$
DECLARE
  offenders text;
BEGIN
  SELECT string_agg(k, ', ') INTO offenders
  FROM (
    SELECT lower(btrim("email")) AS k FROM "User" GROUP BY 1 HAVING count(*) > 1
  ) duplicates;
  IF offenders IS NOT NULL THEN
    RAISE EXCEPTION 'Cannot normalize "User"."email": these addresses appear more than once when case and surrounding whitespace are ignored: %. Merge or remove the duplicate users by hand, then re-run the migration.', offenders;
  END IF;

  SELECT string_agg(k, ', ') INTO offenders
  FROM (
    SELECT "brunchId" || ' / ' || lower(btrim("invitedEmail")) AS k
    FROM "BrunchInvite" GROUP BY "brunchId", lower(btrim("invitedEmail")) HAVING count(*) > 1
  ) duplicates;
  IF offenders IS NOT NULL THEN
    RAISE EXCEPTION 'Cannot normalize "BrunchInvite"."invitedEmail": these (brunch / address) pairs appear more than once when case and whitespace are ignored: %. Remove the duplicate invites by hand, then re-run the migration.', offenders;
  END IF;

  SELECT string_agg(k, ', ') INTO offenders
  FROM (
    SELECT "brunchId" || ' / ' || lower(btrim("suggestedEmail")) AS k
    FROM "BrunchInviteSuggestion" GROUP BY "brunchId", lower(btrim("suggestedEmail")) HAVING count(*) > 1
  ) duplicates;
  IF offenders IS NOT NULL THEN
    RAISE EXCEPTION 'Cannot normalize "BrunchInviteSuggestion"."suggestedEmail": these (brunch / address) pairs appear more than once when case and whitespace are ignored: %. Remove the duplicate suggestions by hand, then re-run the migration.', offenders;
  END IF;
END
$$;

-- 2. Backfill.
UPDATE "User" SET "email" = lower(btrim("email")) WHERE "email" <> lower(btrim("email"));
UPDATE "UserAuthProvider" SET "email" = lower(btrim("email")) WHERE "email" <> lower(btrim("email"));
UPDATE "BrunchInvite" SET "invitedEmail" = lower(btrim("invitedEmail")) WHERE "invitedEmail" <> lower(btrim("invitedEmail"));
UPDATE "BrunchInviteSuggestion" SET "suggestedEmail" = lower(btrim("suggestedEmail")) WHERE "suggestedEmail" <> lower(btrim("suggestedEmail"));

-- 3. Safety net: the database itself now refuses an address that is not in canonical form.
ALTER TABLE "User"
  ADD CONSTRAINT "User_email_normalized" CHECK ("email" = lower(btrim("email")));
ALTER TABLE "UserAuthProvider"
  ADD CONSTRAINT "UserAuthProvider_email_normalized" CHECK ("email" = lower(btrim("email")));
ALTER TABLE "BrunchInvite"
  ADD CONSTRAINT "BrunchInvite_invitedEmail_normalized" CHECK ("invitedEmail" = lower(btrim("invitedEmail")));
ALTER TABLE "BrunchInviteSuggestion"
  ADD CONSTRAINT "BrunchInviteSuggestion_suggestedEmail_normalized" CHECK ("suggestedEmail" = lower(btrim("suggestedEmail")));
