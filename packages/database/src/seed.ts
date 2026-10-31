import { PrismaClient } from '@prisma/client';
import { BRUNCH_STATUSES } from './brunchStatuses';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  // ── NotificationChannel ──────────────────────────────────────────────────
  const channels = [
    { code: 'email', label: 'Email', isActive: true },
    { code: 'in_app', label: 'In-App', isActive: true },
    { code: 'push', label: 'Push', isActive: false }, // v2
  ];
  for (const ch of channels) {
    await prisma.notificationChannel.upsert({
      where: { code: ch.code },
      update: { label: ch.label, isActive: ch.isActive },
      create: ch,
    });
  }

  // ── BrunchStatus ─────────────────────────────────────────────────────────
  const brunchStatuses = BRUNCH_STATUSES;
  for (const s of brunchStatuses) {
    await prisma.brunchStatus.upsert({
      where: { code: s.code },
      update: {
        label: s.label,
        description: s.description,
        isActive: s.isActive,
        sortOrder: s.sortOrder,
      },
      create: s,
    });
  }

  // ── BrunchDecisionType ───────────────────────────────────────────────────
  const decisionTypes = [
    {
      code: 'host_decides',
      label: 'Host Decides',
      description: 'Host picks location or time',
      isActive: true,
      sortOrder: 1,
    },
    {
      code: 'group_vote',
      label: 'Group Vote',
      description: 'Attendees vote on options',
      isActive: true,
      sortOrder: 2,
    },
  ];
  for (const dt of decisionTypes) {
    await prisma.brunchDecisionType.upsert({
      where: { code: dt.code },
      update: {
        label: dt.label,
        description: dt.description,
        isActive: dt.isActive,
        sortOrder: dt.sortOrder,
      },
      create: dt,
    });
  }

  // ── RsvpStatus ───────────────────────────────────────────────────────────
  const rsvpStatuses = [
    {
      code: 'invited',
      label: 'Invited',
      description: 'Invite sent, no response yet',
      isActive: true,
      sortOrder: 1,
      countsAsAttendee: false,
      canVote: false,
    },
    {
      code: 'yes',
      label: 'Yes',
      description: 'Attending',
      isActive: true,
      sortOrder: 2,
      countsAsAttendee: true,
      canVote: true,
    },
    {
      code: 'no',
      label: 'No',
      description: 'Not attending',
      isActive: true,
      sortOrder: 3,
      countsAsAttendee: false,
      canVote: false,
    },
    {
      code: 'maybe',
      label: 'Maybe',
      description: 'Tentatively attending',
      isActive: true,
      sortOrder: 4,
      countsAsAttendee: false,
      canVote: true,
    },
  ];
  for (const rs of rsvpStatuses) {
    await prisma.rsvpStatus.upsert({
      where: { code: rs.code },
      update: {
        label: rs.label,
        description: rs.description,
        isActive: rs.isActive,
        sortOrder: rs.sortOrder,
        countsAsAttendee: rs.countsAsAttendee,
        canVote: rs.canVote,
      },
      create: rs,
    });
  }

  // ── BrunchInviteSuggestionStatus ─────────────────────────────────────────
  const suggestionStatuses = [
    {
      code: 'pending',
      label: 'Pending',
      description: 'Suggestion awaiting host review',
      isActive: true,
      sortOrder: 1,
    },
    {
      code: 'approved',
      label: 'Approved',
      description: 'Host approved the suggestion',
      isActive: true,
      sortOrder: 2,
    },
    {
      code: 'declined',
      label: 'Declined',
      description: 'Host declined the suggestion',
      isActive: true,
      sortOrder: 3,
    },
  ];
  for (const ss of suggestionStatuses) {
    await prisma.brunchInviteSuggestionStatus.upsert({
      where: { code: ss.code },
      update: {
        label: ss.label,
        description: ss.description,
        isActive: ss.isActive,
        sortOrder: ss.sortOrder,
      },
      create: ss,
    });
  }

  // ── BrunchOptionSuggestionStatus ─────────────────────────────────────────
  const optionSuggestionStatuses = [
    {
      code: 'pending',
      label: 'Pending',
      description: 'Suggestion awaiting host review',
      isActive: true,
      sortOrder: 1,
    },
    {
      code: 'approved',
      label: 'Approved',
      description: 'Host approved the suggestion',
      isActive: true,
      sortOrder: 2,
    },
    {
      code: 'declined',
      label: 'Declined',
      description: 'Host declined the suggestion',
      isActive: true,
      sortOrder: 3,
    },
  ];
  for (const oss of optionSuggestionStatuses) {
    await prisma.brunchOptionSuggestionStatus.upsert({
      where: { code: oss.code },
      update: {
        label: oss.label,
        description: oss.description,
        isActive: oss.isActive,
        sortOrder: oss.sortOrder,
      },
      create: oss,
    });
  }

  // ── NotificationType ─────────────────────────────────────────────────────
  const notificationTypes = [
    { code: 'rsvp.received', label: 'RSVP Received', sortOrder: 1 },
    { code: 'vote.cast', label: 'Vote Cast', sortOrder: 2 },
    { code: 'invite.suggestion', label: 'Invite Suggestion', sortOrder: 3 },
    { code: 'location.suggested', label: 'Location Suggested', sortOrder: 4 },
    { code: 'time.suggested', label: 'Time Suggested', sortOrder: 5 },
    { code: 'brunch.confirmed', label: 'Brunch Confirmed', sortOrder: 6 },
    { code: 'vote.deadline.approaching', label: 'Vote Deadline Approaching', sortOrder: 7 },
    { code: 'invite.received', label: 'Invite Received', sortOrder: 8 },
    { code: 'brunch.cancelled', label: 'Brunch Cancelled', sortOrder: 9 },
    { code: 'vote.autoclose.prompted', label: 'Vote Auto-Close Prompted', sortOrder: 10 },
    { code: 'running.late', label: 'Running Late', sortOrder: 11 },
    { code: 'host.transferred', label: 'Host Transferred', sortOrder: 12 },
    // Added by spec 0015 (ADR 0017)
    { code: 'brunch.reinstated', label: 'Brunch Reinstated', sortOrder: 13 },
    { code: 'invite.email.failed', label: 'Invite Email Failed', sortOrder: 14 },
  ];
  for (const nt of notificationTypes) {
    await prisma.notificationType.upsert({
      where: { code: nt.code },
      update: { label: nt.label, sortOrder: nt.sortOrder },
      create: { ...nt, isActive: true },
    });
  }

  // ── NotificationLevel ────────────────────────────────────────────────────
  // The ids are fixed: BrunchAttendee.notificationLevelId defaults to the 'all' id, and the
  // migration that created the table inserted these same rows.
  const notificationLevels = [
    { id: '00000000-0000-4000-8000-00000000a111', code: 'all', label: 'All', sortOrder: 1 },
    {
      id: '00000000-0000-4000-8000-00000000a112',
      code: 'big_stuff',
      label: 'Just big stuff',
      sortOrder: 2,
    },
    { id: '00000000-0000-4000-8000-00000000a113', code: 'muted', label: 'Muted', sortOrder: 3 },
  ];
  for (const level of notificationLevels) {
    await prisma.notificationLevel.upsert({
      where: { code: level.code },
      update: { label: level.label, sortOrder: level.sortOrder },
      create: level,
    });
  }

  // ── FeatureFlag ──────────────────────────────────────────────────────────
  const featureFlags = [
    { code: 'chat', label: 'Chat', description: 'Group chat in brunch view', isEnabled: false },
    {
      code: 'bill_splitting',
      label: 'Bill Splitting',
      description: 'Split the bill after brunch',
      isEnabled: false,
    },
    {
      code: 'friend_groups',
      label: 'Friend Groups',
      description: 'Organize friends into groups',
      isEnabled: false,
    },
    {
      code: 'favorites',
      label: 'Favourites',
      description: 'Save favourite places',
      isEnabled: false,
    },
    { code: 'photos', label: 'Photos', description: 'Upload brunch photos', isEnabled: false },
    { code: 'ratings', label: 'Ratings', description: 'Rate brunch spots', isEnabled: false },
    {
      code: 'calendar',
      label: 'Calendar',
      description: 'Google Calendar add-to-calendar chip',
      isEnabled: false,
    },
  ];
  for (const ff of featureFlags) {
    await prisma.featureFlag.upsert({
      where: { code: ff.code },
      update: { label: ff.label, description: ff.description, isEnabled: ff.isEnabled },
      create: ff,
    });
  }

  // ── FriendshipStatus [v1 schema only] ────────────────────────────────────
  const friendshipStatuses = [
    { code: 'pending', label: 'Pending', sortOrder: 1 },
    { code: 'accepted', label: 'Accepted', sortOrder: 2 },
    { code: 'declined', label: 'Declined', sortOrder: 3 },
    { code: 'blocked', label: 'Blocked', sortOrder: 4 },
  ];
  for (const fs of friendshipStatuses) {
    await prisma.friendshipStatus.upsert({
      where: { code: fs.code },
      update: { label: fs.label, sortOrder: fs.sortOrder },
      create: { ...fs, isActive: true },
    });
  }

  // ── Dish [v1 schema only] ────────────────────────────────────────────────
  const dishes = [
    { code: 'eggs_benedict', label: 'Eggs Benedict' },
    { code: 'avocado_toast', label: 'Avocado Toast' },
    { code: 'pancakes', label: 'Pancakes' },
    { code: 'waffles', label: 'Waffles' },
    { code: 'french_toast', label: 'French Toast' },
    { code: 'omelette', label: 'Omelette' },
    { code: 'granola', label: 'Granola' },
    { code: 'bagel', label: 'Bagel' },
    { code: 'shakshuka', label: 'Shakshuka' },
    { code: 'huevos_rancheros', label: 'Huevos Rancheros' },
  ];
  for (const d of dishes) {
    await prisma.dish.upsert({
      where: { code: d.code },
      update: { label: d.label },
      create: { ...d, isActive: true },
    });
  }

  // ── Ingredient [v1 schema only] ──────────────────────────────────────────
  const ingredients = [
    { code: 'eggs', label: 'Eggs' },
    { code: 'avocado', label: 'Avocado' },
    { code: 'bacon', label: 'Bacon' },
    { code: 'sausage', label: 'Sausage' },
    { code: 'gluten_free', label: 'Gluten Free' },
    { code: 'dairy_free', label: 'Dairy Free' },
    { code: 'vegetarian', label: 'Vegetarian' },
    { code: 'vegan', label: 'Vegan' },
    { code: 'nuts', label: 'Nuts' },
    { code: 'shellfish', label: 'Shellfish' },
  ];
  for (const i of ingredients) {
    await prisma.ingredient.upsert({
      where: { code: i.code },
      update: { label: i.label },
      create: { ...i, isActive: true },
    });
  }

  console.log('Seed complete.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
