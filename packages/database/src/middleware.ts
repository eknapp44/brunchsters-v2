import { PrismaClient } from '@prisma/client';

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

export function createDb() {
  return new PrismaClient().$extends({
    query: {
      $allModels: {
        async findMany({ model, args, query }) {
          if (!SOFT_DELETE_MODELS.has(model)) return query(args);
          // exactOptionalPropertyTypes + the union of all model args prevents a direct
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
}

// Use DbClient wherever PrismaClient would be used — it includes the soft-delete extension.
export type DbClient = ReturnType<typeof createDb>;
