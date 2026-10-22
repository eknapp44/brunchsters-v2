// The seeded brunch statuses: the one list the seed script writes and the rest of the code can
// check itself against (a screen that words each status needs an entry for every code here).
export type BrunchStatusSeed = {
  readonly code: string;
  readonly label: string;
  readonly description: string;
  readonly isActive: boolean;
  readonly sortOrder: number;
};

export const BRUNCH_STATUSES: readonly BrunchStatusSeed[] = [
  {
    code: 'draft',
    label: 'Draft',
    description: 'Brunch is being planned',
    isActive: true,
    sortOrder: 1,
  },
  {
    code: 'active',
    label: 'Active',
    description: 'Invites sent, awaiting RSVPs and votes',
    isActive: true,
    sortOrder: 2,
  },
  {
    code: 'confirmed',
    label: 'Confirmed',
    description: 'Host has confirmed location and time',
    isActive: true,
    sortOrder: 3,
  },
  {
    code: 'brunching',
    label: 'Brunching',
    description: 'Brunch is happening right now',
    isActive: false,
    sortOrder: 4,
  }, // v2
  {
    code: 'paying',
    label: 'Paying',
    description: 'Bill splitting in progress',
    isActive: false,
    sortOrder: 5,
  }, // v2
  {
    code: 'completed',
    label: 'Completed',
    description: 'Brunch is done',
    isActive: true,
    sortOrder: 6,
  },
  {
    code: 'cancelled',
    label: 'Cancelled',
    description: 'Brunch was cancelled',
    isActive: true,
    sortOrder: 7,
  },
  {
    code: 'archived',
    label: 'Archived',
    description: 'Brunch archived by host',
    isActive: true,
    sortOrder: 8,
  },
];
