import { PrismaClient } from '@prisma/client';

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
  const brunchStatuses = [
    { code: 'draft', label: 'Draft', description: 'Brunch is being planned', isActive: true, sortOrder: 1 },
    { code: 'active', label: 'Active', description: 'Invites sent, awaiting RSVPs and votes', isActive: true, sortOrder: 2 },
    { code: 'confirmed', label: 'Confirmed', description: 'Host has confirmed location and time', isActive: true, sortOrder: 3 },
    { code: 'brunching', label: 'Brunching', description: 'Brunch is happening right now', isActive: false, sortOrder: 4 }, // v2
    { code: 'paying', label: 'Paying', description: 'Bill splitting in progress', isActive: false, sortOrder: 5 }, // v2
    { code: 'completed', label: 'Completed', description: 'Brunch is done', isActive: true, sortOrder: 6 },
    { code: 'cancelled', label: 'Cancelled', description: 'Brunch was cancelled', isActive: true, sortOrder: 7 },
    { code: 'archived', label: 'Archived', description: 'Brunch archived by host', isActive: true, sortOrder: 8 },
  ];
  for (const s of brunchStatuses) {
    await prisma.brunchStatus.upsert({
      where: { code: s.code },
      update: { label: s.label, description: s.description, isActive: s.isActive, sortOrder: s.sortOrder },
      create: s,
    });
  }

  // ── BrunchDecisionType ───────────────────────────────────────────────────
  const decisionTypes = [
    { code: 'host_decides', label: 'Host Decides', description: 'Host picks location or time', isActive: true, sortOrder: 1 },
    { code: 'group_vote', label: 'Group Vote', description: 'Attendees vote on options', isActive: true, sortOrder: 2 },
  ];
  for (const dt of decisionTypes) {
    await prisma.brunchDecisionType.upsert({
      where: { code: dt.code },
      update: { label: dt.label, description: dt.description, isActive: dt.isActive, sortOrder: dt.sortOrder },
      create: dt,
    });
  }

  // ── RsvpStatus ───────────────────────────────────────────────────────────
  const rsvpStatuses = [
    { code: 'invited', label: 'Invited', description: 'Invite sent, no response yet', isActive: true, sortOrder: 1, countsAsAttendee: false },
    { code: 'yes', label: 'Yes', description: 'Attending', isActive: true, sortOrder: 2, countsAsAttendee: true },
    { code: 'no', label: 'No', description: 'Not attending', isActive: true, sortOrder: 3, countsAsAttendee: false },
    { code: 'maybe', label: 'Maybe', description: 'Tentatively attending', isActive: true, sortOrder: 4, countsAsAttendee: false },
  ];
  for (const rs of rsvpStatuses) {
    await prisma.rsvpStatus.upsert({
      where: { code: rs.code },
      update: { label: rs.label, description: rs.description, isActive: rs.isActive, sortOrder: rs.sortOrder, countsAsAttendee: rs.countsAsAttendee },
      create: rs,
    });
  }

  // ── BrunchInviteSuggestionStatus ─────────────────────────────────────────
  const suggestionStatuses = [
    { code: 'pending', label: 'Pending', description: 'Suggestion awaiting host review', isActive: true, sortOrder: 1 },
    { code: 'approved', label: 'Approved', description: 'Host approved the suggestion', isActive: true, sortOrder: 2 },
    { code: 'declined', label: 'Declined', description: 'Host declined the suggestion', isActive: true, sortOrder: 3 },
  ];
  for (const ss of suggestionStatuses) {
    await prisma.brunchInviteSuggestionStatus.upsert({
      where: { code: ss.code },
      update: { label: ss.label, description: ss.description, isActive: ss.isActive, sortOrder: ss.sortOrder },
      create: ss,
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
  ];
  for (const nt of notificationTypes) {
    await prisma.notificationType.upsert({
      where: { code: nt.code },
      update: { label: nt.label, sortOrder: nt.sortOrder },
      create: { ...nt, isActive: true },
    });
  }

  // ── FeatureFlag ──────────────────────────────────────────────────────────
  const featureFlags = [
    { code: 'chat', label: 'Chat', description: 'Group chat in brunch view', isEnabled: false },
    { code: 'bill_splitting', label: 'Bill Splitting', description: 'Split the bill after brunch', isEnabled: false },
    { code: 'friend_groups', label: 'Friend Groups', description: 'Organize friends into groups', isEnabled: false },
    { code: 'favorites', label: 'Favourites', description: 'Save favourite places', isEnabled: false },
    { code: 'photos', label: 'Photos', description: 'Upload brunch photos', isEnabled: false },
    { code: 'ratings', label: 'Ratings', description: 'Rate brunch spots', isEnabled: false },
    { code: 'calendar', label: 'Calendar', description: 'Google Calendar add-to-calendar chip', isEnabled: false },
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
