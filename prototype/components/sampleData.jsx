// Sample data used across screens — looks plausible without being slop.

const SAMPLE_BRUNCHES_UPCOMING = [
  {
    id: 'b1',
    title: "Sunday catch-up",
    date: { m: 'May', d: '03' },
    timeLabel: "Sun · 11:00 AM",
    location: "Tartine Bakery",
    locationSub: "Mission, SF",
    status: 'confirmed',
    role: 'host',
    attendees: [
      { id: 'u1', name: 'You', initials: 'YO' },
      { id: 'u2', name: 'Maya R.', initials: 'MR' },
      { id: 'u3', name: 'Devon K.', initials: 'DK' },
      { id: 'u4', name: 'Priya S.', initials: 'PS' },
    ],
    rsvpYes: 4, rsvpTotal: 5,
  },
  {
    id: 'b2',
    title: "Birthday brunch for Sam",
    date: { m: 'May', d: '10' },
    timeLabel: "Voting · 3 options",
    location: "3 places proposed",
    locationSub: "voting closes Thu",
    status: 'voting',
    role: 'invitee',
    attendees: [
      { id: 'u5', name: 'Sam L.', initials: 'SL' },
      { id: 'u1', name: 'You', initials: 'YO' },
      { id: 'u6', name: 'Jess M.', initials: 'JM' },
    ],
    rsvpYes: 6, rsvpTotal: 8,
  },
  {
    id: 'b3',
    title: "Old roommates reunion",
    date: { m: 'May', d: '24' },
    timeLabel: "Sat · TBD",
    location: "Where TBD",
    locationSub: "you're hosting",
    status: 'planning',
    role: 'host',
    attendees: [
      { id: 'u1', name: 'You', initials: 'YO' },
      { id: 'u7', name: 'Alex P.', initials: 'AP' },
      { id: 'u8', name: 'Riley Q.', initials: 'RQ' },
    ],
    rsvpYes: 1, rsvpTotal: 4,
  },
];

const SAMPLE_BRUNCHES_PAST = [
  {
    id: 'p1', title: "Easter brunch with Mom",
    date: { m: 'Apr', d: '05' }, timeLabel: "Sun · 12:00 PM",
    dateLong: "Sun, Apr 5, 2026", time: "12:00 PM",
    location: "Zazie", locationSub: "941 Cole St · Cole Valley",
    description: "Mom flew in. Eggs benedict for everyone.",
    role: 'host', rsvpYes: 5, rsvpTotal: 5,
    attendees: [
      { id: 'u1', name: 'You', initials: 'YO', rsvp: 'yes' },
      { id: 'um', name: 'Mom', initials: 'M',  rsvp: 'yes' },
      { id: 'f1', name: 'Maya Reyes',  initials: 'MR', rsvp: 'yes' },
      { id: 'f2', name: 'Devon Kim',   initials: 'DK', rsvp: 'yes' },
      { id: 'f3', name: 'Priya Shah',  initials: 'PS', rsvp: 'yes' },
      { id: 'f4', name: 'Sam Liu',     initials: 'SL', rsvp: 'no'  },
    ],
  },
  {
    id: 'p2', title: "Maya's promotion",
    date: { m: 'Mar', d: '22' }, timeLabel: "Sat · 11:30 AM",
    dateLong: "Sat, Mar 22, 2026", time: "11:30 AM",
    location: "Foreign Cinema", locationSub: "2534 Mission St · Mission",
    description: "Senior VP. Mimosas were on Maya.",
    role: 'invitee', rsvpYes: 7, rsvpTotal: 7,
    attendees: [
      { id: 'f1', name: 'Maya Reyes',    initials: 'MR', rsvp: 'yes' },
      { id: 'u1', name: 'You',           initials: 'YO', rsvp: 'yes' },
      { id: 'f2', name: 'Devon Kim',     initials: 'DK', rsvp: 'yes' },
      { id: 'f3', name: 'Priya Shah',    initials: 'PS', rsvp: 'yes' },
      { id: 'f5', name: 'Jess Martinez', initials: 'JM', rsvp: 'yes' },
      { id: 'f4', name: 'Sam Liu',       initials: 'SL', rsvp: 'yes' },
      { id: 'ua', name: 'Alex P.',       initials: 'AP', rsvp: 'yes' },
    ],
  },
];

const SAMPLE_LOCATIONS = [
  {
    id: 'l1', name: 'Tartine Bakery',
    address: '600 Guerrero St', neighborhood: 'Mission, SF',
    rating: 4.6, distance: '0.4 mi',
    tags: ['pastries', 'coffee'],
  },
  {
    id: 'l2', name: 'Zazie',
    address: '941 Cole St', neighborhood: 'Cole Valley',
    rating: 4.5, distance: '1.8 mi',
    tags: ['french', 'eggs benedict'],
  },
  {
    id: 'l3', name: 'Plow',
    address: '1299 18th St', neighborhood: 'Potrero Hill',
    rating: 4.7, distance: '2.1 mi',
    tags: ['classic american'],
  },
  {
    id: 'l4', name: 'Foreign Cinema',
    address: '2534 Mission St', neighborhood: 'Mission, SF',
    rating: 4.4, distance: '0.6 mi',
    tags: ['mediterranean', 'patio'],
  },
];

const SAMPLE_TIMES = [
  { id: 't1', label: 'Saturday, May 3', time: '10:30 AM', sub: '3 days away' },
  { id: 't2', label: 'Sunday, May 4', time: '11:00 AM', sub: '4 days away' },
  { id: 't3', label: 'Sunday, May 4', time: '12:30 PM', sub: '4 days away' },
];

const SAMPLE_FRIENDS = [
  { id: 'f1', name: 'Maya Reyes', email: 'maya@example.com', initials: 'MR' },
  { id: 'f2', name: 'Devon Kim', email: 'devon@example.com', initials: 'DK' },
  { id: 'f3', name: 'Priya Shah', email: 'priya@example.com', initials: 'PS' },
  { id: 'f4', name: 'Sam Liu', email: 'sam@example.com', initials: 'SL' },
  { id: 'f5', name: 'Jess Martinez', email: 'jess@example.com', initials: 'JM' },
];

window.SAMPLE_BRUNCHES_UPCOMING = SAMPLE_BRUNCHES_UPCOMING;
window.SAMPLE_BRUNCHES_PAST = SAMPLE_BRUNCHES_PAST;
window.SAMPLE_LOCATIONS = SAMPLE_LOCATIONS;
window.SAMPLE_TIMES = SAMPLE_TIMES;
window.SAMPLE_FRIENDS = SAMPLE_FRIENDS;
