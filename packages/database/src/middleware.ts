import { Prisma, PrismaClient } from '@prisma/client';

// Models with a deletedAt field — excluded from findMany/findFirst by default.
const SOFT_DELETE_MODELS = new Set([
  'User',
  'Brunch',
  'BrunchInvite',
  'BrunchAttendee',
  'BrunchLocation',
  'BrunchTime',
  'BrunchLocationVote',
  'BrunchTimeVote',
  'Message',
  'Friendship',
  'FriendGroup',
  'FriendGroupMember',
  'UserFavoritePlace',
]);

// Prisma.defineExtension provides proper type inference for $allModels callbacks.
// Without it, { model, args, query } are implicitly any under strict TypeScript.
const softDeleteExtension = Prisma.defineExtension({
  query: {
    $allModels: {
      async findMany({ model, args, query }) {
        if (!SOFT_DELETE_MODELS.has(model)) return query(args);
        // exactOptionalPropertyTypes + union of all model args prevents a direct
        // spread reassignment. Double-cast is safe: deletedAt exists on every model
        // in SOFT_DELETE_MODELS. Remove when Prisma adds native soft-delete support.
        const filtered = {
          ...args,
          where: { ...(args.where as Record<string, unknown>), deletedAt: null },
        } as unknown as typeof args;
        return query(filtered);
      },
      async findFirst({ model, args, query }) {
        if (!SOFT_DELETE_MODELS.has(model)) return query(args);
        const filtered = {
          ...args,
          where: { ...(args.where as Record<string, unknown>), deletedAt: null },
        } as unknown as typeof args;
        return query(filtered);
      },
    },
  },
});

export function createDb() {
  return new PrismaClient().$extends(softDeleteExtension);
}

// Use DbClient wherever PrismaClient would be used — it includes the soft-delete extension.
export type DbClient = ReturnType<typeof createDb>;
