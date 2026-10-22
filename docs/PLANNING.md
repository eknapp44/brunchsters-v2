# Brunchsters — Planning Document

**Version:** 1.6
**Last Updated:** May 26, 2026
**Status:** Pre-development planning complete — design reconciliation done, ready for scaffold

> **v1.6 — Design reconciliation (May 26, 2026):** Merged decisions from the Claude Design session (Engineering Handoff v1.1). Changes: v1 scope expanded (rich RSVP states, host transfer, undo-cancel, running late, Google Calendar chip, timezone display, voting auto-close + tie-breaker); `BrunchAttendee` schema extended; `Brunch` schema extended; notification type list updated; token expiry, calendar scope, realtime mechanism, RSVP visibility, and push provider questions resolved. See ADR history for rationale.
>
> **Working with this doc across chats:** This document lives in the project's GitHub repo (`docs/PLANNING.md`) as the single source of truth. When starting a new chat (UI design, code review, etc.), upload or paste this doc to give that chat context. Decisions made in any chat should be committed back to the doc via PR — git history becomes the audit trail of design evolution. Don't rely on Claude's memory across chats; rely on the repo.
>
> **Documentation hierarchy:**
>
> - **`constitution.md`** — non-negotiable principles. Every decision must be consistent with these.
> - **`PLANNING.md`** (this doc) — what we're building. Product spec, data model, architecture.
> - **`docs/adrs/`** — why specific decisions were made. Alternatives, tradeoffs, history.
> - **`specs/NNNN-feature/`** — per-feature specs (spec, plan, tasks). The implementation lifecycle.

---

## 1. Vision

Brunchsters fills the gap between Google Maps and Google Calendar — making it easy to socially plan brunch with friends. Maps finds the place, Calendar holds the event, but neither helps you actually plan it together. That's the sweet spot Brunchsters owns.

**Design principles (Google-inspired):**

- Progressive disclosure — show only what's needed at each step
- Smart defaults — app makes reasonable assumptions, user overrides if needed
- Minimal chrome — content first, UI gets out of the way
- One primary action per screen

---

## 2. Scope

### v1 (Launch) — Schema + UI

- User accounts (Google + Apple sign-in)
- Create a brunch event
- Invite friends via email or shareable link
- RSVP flow for invitees — rich states: yes (+ plus-ones, late arrival, leave early, dietary note), maybe (+ decide-by), no (+ regret note, invite-next-time flag)
- Optional voting on locations and times; auto-close prompt at ≥66% participation; inline tie-breaker for host
- Host confirms final brunch
- Host transfer — hand off hosting to any yes-RSVP'd attendee (one transfer per brunch)
- Undo on cancel — 5-second window before notifications fire; same pattern for "leave brunch"
- Running late — day-of one-tap action within T-1h; notifies group via in-app + email (push upgrade in v2)
- Real-time updates (Supabase Realtime) and email notifications (Resend)
- Permission settings per brunch (who can suggest what)
- Google Calendar "add-to-calendar" chip — one-tap, no OAuth, disabled until location + time are locked
- Timezone-aware display — times stored as UTC, displayed in each viewer's local timezone; "(at [Location]'s time: X)" subline shown when timezones differ; voting times follow same rule

### v1 (Launch) — Schema Only, UI Deferred

- Group chat (Message table present, realtime UI deferred)
- Friends & friend groups (tables present, social UI deferred)
- Favorite places (table present, favorites UI deferred)
- Dish & ingredient preferences (tables + seed data present, prefs UI deferred)

### v2 (First Post-Launch)

- Group chat UI + realtime
- Friends & friend groups UI
- Favorite places UI
- Magic link authentication
- Calendar export (.ics) and Outlook / Apple Calendar support
- Push notifications (upgrade path for running-late and other in-app-only v1 notifications)

### v3 (Growth Phase)

- Mobile app (iOS + Android — API-first makes this clean)
- Photos + ratings (post-brunch engagement)
- Push notifications
- Calendar availability reading (OAuth)
- Dish & ingredient preference UI + location suggestions

### Future / Stretch

- Restaurant feed / discovery
- Recommendations engine
- External sharing (Google Maps deep links, native share sheets)
- Bill splitting
- Mid-brunch features (check-in, "I've arrived")
- Yelp / Foursquare provider integration
- Restaurant partnerships / monetization

---

## 3. Tech Stack

| Layer            | Decision                                                                           |
| ---------------- | ---------------------------------------------------------------------------------- |
| Framework        | Next.js + TypeScript                                                               |
| State Management | Redux Toolkit (UI state only, ADR 0011; wizard and ballots so far, spec 0010)      |
| ORM              | Prisma                                                                             |
| Database         | PostgreSQL (Supabase)                                                              |
| Auth             | NextAuth.js (Google + Apple)                                                       |
| Realtime         | Supabase Realtime (v2)                                                             |
| Job Queue        | Inngest                                                                            |
| Email            | Resend + React Email                                                               |
| Hosting          | Vercel + Supabase                                                                  |
| Maps             | Google Places API (New) + Time Zone API (abstracted via `PlaceProvider` interface) |

### Architectural Principles

- **API-first** — web is one client, mobile will be another. Business logic lives in API/service layers, not page components.
- **Provider abstraction** — auth, place provider, realtime, notifications all behind interfaces we control. Swappable later.
- **Optimize for change, not perfection** — design for easy migration, not initial perfection.

### Hosting Decision Rationale

Vercel + Supabase chosen over AWS for v1 despite developer's AWS familiarity. Reasoning:

- **Side project optimized for learning + shipping.** Vercel/Supabase gets to actual app development faster; AWS would mean significant infrastructure learning before any feature work.
- **Most likely outcome of any side project is modest scale.** Vercel + Supabase free/Pro tiers handle that comfortably.
- **AWS migration as a future learning opportunity.** If Brunchsters takes off, migrating to AWS is itself a great engineering exercise — by then there's a real app with real data and real reasons for the move. Many engineers never get to do a real production migration; this is a feature, not a bug.
- **Provider abstractions (Section 9.10, etc.) make migration tractable.** Realtime, place provider, auth, notifications all behind interfaces. The data layer is plain Postgres + Prisma — fully portable.

If the project grows to need AWS, expected migration mapping:
| Current | Future AWS Equivalent |
|---------|----------------------|
| Vercel hosting | Amplify or CloudFront + S3 |
| Supabase Postgres | RDS Postgres |
| Supabase Auth (if used) | Cognito or keep NextAuth |
| Supabase Realtime | AppSync, API Gateway WebSockets, or Pusher/Ably |
| Inngest | SQS + Lambda |
| Resend | SES |

---

## 4. Auth Strategy

- **v1:** Google + Apple social login only. No email/password — modern apps trend away from passwords.
- **v2:** Add magic link (passwordless email).
- **Skip entirely:** Traditional email/password.

`UserAuthProvider` table supports multiple providers per user.

---

## 5. User Flows

### Host Journey

1. **Landing** → Sign in with Google/Apple
2. **Dashboard** — Upcoming brunches, past brunches, prominent "Plan a Brunch" CTA
3. **Create Brunch** (multi-step, progressive disclosure):
   - Step 1: Title + description
   - Step 2: Where? (one place = decided, multiple = voting auto-enabled)
   - Step 3: When? (one time = decided, multiple = voting auto-enabled)
   - Step 4: Who? (email or shareable link)
4. **Manage Brunch** — see RSVPs, votes, confirm or cancel
5. **Mode emerges from behavior** — host doesn't toggle "host decides vs vote" upfront; it's inferred from whether they add one option or multiple.

### Invitee Journey (three entry points)

1. **Existing user** — clicks invite link → already authed → lands on Brunch detail page
2. **New user (has Google)** — clicks link → signs in with Google → account auto-created → lands on Brunch detail page
3. **Unregistered user** — clicks link → sees brunch preview → sign in with Google → account created → joins as attendee

### Critical UX Moment

The handoff from invite link → auth → brunch detail page must feel invisible. No spinners, no forms, no extra steps. Click → in.

### Edge Cases

- **Expired token:** Friendly message, "Ask [host] to resend". Tokens expire 7 days after the scheduled brunch date — hosts can revoke and regenerate at any time.
- **Brunch already confirmed:** Location, time, and the ballot become read-only; RSVP stays open, so late RSVPs and changes of mind are still allowed
- **Declined invitee:** Allow them to change their mind at any time, confirmation included. (Originally read "until confirmed," which contradicted the bullet above; resolved in favour of staying open during spec 0005 planning — a friend whose plans free up the night before should still be able to join, and v1 has no reservation that needs a frozen headcount.)

### Confirmation Lock Rules

After a brunch is confirmed:

- **Locked:** Location, time, planning mode
- **Still editable:** Title, description, invitee list

### Minimum Brunch Size

2 people including host (1-on-1s are valid brunches).

Enforced structurally rather than by an explicit check: a brunch only leaves `draft` when its first invite is sent, and confirmation requires an `active` brunch, so a brunch with no invitees can never be confirmed. "Invitees exist but nobody has accepted yet" is allowed — the host often knows their friend is coming before the app does — and surfaces as a UI warning on the confirm control, not an error.

---

## 6. Permissions Model

Host controls per-brunch:

- `allowInviteSuggestions` — can invitees suggest new people?
- `requireHostApprovalToInvite` — must host approve suggestions?
- `allowLocationSuggestions` — can invitees suggest places?
- `allowTimeSuggestions` — can invitees suggest times?
- `requireHostApprovalForOptions` — must host approve location/time suggestions? (spec 0005 M6 — added so location/time suggestions have the same approval gate invite suggestions already had; the two
  original flags above shipped with spec 0004 before this gap was noticed)

**Defaults:** All permissions ON, host approval required (always safe default).

Stored as fields directly on `Brunch` (not a separate `BrunchSettings` table — premature normalization).

---

## 7. Notifications

Two layers:

- **Real-time in-app** — Supabase Realtime, presence-aware (don't notify someone watching the page)
- **External notifications** — email via Resend, sent by Inngest-queued handlers ([ADR 0009](adrs/0009-inngest-event-bus-and-email-delivery.md), spec 0008). The first slice sends only `invite.received` and `brunch.confirmed`; everything else in the list below waits for the follow-up spec (in-app inbox, preferences, mute). Push deferred to v2; v1 features that conceptually want push (running late, host transfer) use in-app + email instead.

User can configure per-type preferences via `UserNotificationPreference`. Per-brunch mute is a separate UI control (All / Just big stuff / Muted) surfaced on the invitee detail screen.

### Notification Types (v1)

- `rsvp.received` — someone responded to invite
- `vote.cast` — someone voted
- `vote.deadline.approaching` — pre-deadline reminder
- `vote.autoclose.prompted` — ≥66% participation threshold reached, host prompted to close. **v1 note (spec 0005):** not a fired event — v1 has no notification delivery mechanism to fire it into, so the threshold is derived fresh on every read (`getBrunchVoting`'s `shouldSuggestClosing`) and surfaced as a banner on `/brunch/[id]/manage`, not a stored flag or queued job. Becomes a real Inngest-delivered notification once the notifications spec ships.
- `invite.suggestion` — invitee suggested someone new
- `location.suggested` — invitee suggested a place
- `time.suggested` — invitee suggested a time
- `brunch.confirmed` — host confirmed
- `brunch.cancelled` — host cancelled (fires after 5-second undo window elapses)
- `invite.received` — you were invited
- `running.late` — attendee triggered day-of "running late" action (in-app + email for v1; push in v2)
- `host.transferred` — hosting handed off to a new attendee

---

## 8. Data Model

### Schema Release Legend

| Tag                | Meaning                                                                                                   |
| ------------------ | --------------------------------------------------------------------------------------------------------- |
| `[v1 schema + ui]` | Build table AND feature UI in v1                                                                          |
| `[v1 schema only]` | Include in Prisma schema now, UI deferred — enables passive data collection or is referenced by v1 tables |
| `[future schema]`  | Don't create table yet — needs infrastructure decisions or UI before it's useful                          |

**Principle:**

- Tables other v1 tables reference → `v1 schema only` minimum
- Tables that enable passive data collection → `v1 schema only`
- Tables that need UI or infrastructure to be useful → `future schema`

---

### Conventions Applied Throughout

- UUIDs for primary keys
- Soft delete (`deletedAt` / `deletedBy`) on major entities
- Archiving (`archivedAt` / `archivedBy`) on User and Brunch
- Lookup tables for configurable enums
- Composite unique indexes on join tables
- Indexed foreign keys
- Audit logging via generalized `AuditLog`
- Immutable audit log rows (no `updatedAt`)
- `isActive` flag on lookup tables (define future values now, disable until ready)

### Lookup / Reference Tables `[v1 schema + ui]`

```typescript
BrunchStatus {
  id, code, label, description, isActive, sortOrder, createdAt, updatedAt
  // values: draft, active, confirmed, brunching*, paying*, completed, cancelled, archived
  // * = isActive false for v1
}

BrunchDecisionType {
  id, code, label, description, isActive, sortOrder, createdAt, updatedAt
  // values: host_decides, group_vote
  // Label source only — no FK references this table. The mode is derived
  // from option count (ADR 0006, spec 0005), not stored on BrunchLocation/
  // BrunchTime. See the Location & Time section below.
}

RsvpStatus {
  id, code, label, description, isActive, sortOrder,
  countsAsAttendee, canVote, createdAt, updatedAt
  // values: invited, yes, no, maybe
  // countsAsAttendee ("is coming" — drives headcount): true for yes only
  // canVote ("gets a say" — drives voting eligibility): true for yes and maybe.
  //   Deliberately separate from countsAsAttendee: a maybe shouldn't inflate the
  //   headcount but is often the most informative voter, since narrowing the
  //   options is what turns their maybe into a yes. Added by spec 0005.
  // (countsForQuorum dropped — quorum is more nuanced than a flag)
}

BrunchInviteSuggestionStatus {
  id, code, label, description, isActive, sortOrder, createdAt, updatedAt
  // values: pending, approved, declined
}

NotificationType {
  id, code, label, description, isActive, sortOrder, createdAt, updatedAt
}

NotificationChannel {
  id, code, label, isActive, createdAt, updatedAt
  // values: email, push*, in_app  (* = isActive false for v1)
}
```

### User & Auth `[v1 schema + ui]`

```typescript
User {
  id (uuid)
  name
  email (unique, indexed — see soft-delete note below)
  avatarUrl
  role (enum: user | admin)  // simplified from Role/UserRole tables for v1
  createdAt, updatedAt
  deletedAt, deletedBy
  archivedAt, archivedBy
}

UserAuthProvider {
  id
  userId (FK → User, indexed)
  provider  // google, apple, magic_link (v2)
  providerUserId (indexed)
  email
  lastLoginAt
  createdAt, updatedAt
}

UserNotificationPreference {
  id
  userId (FK → User, indexed)
  notificationTypeId (FK → NotificationType)
  channelId (FK → NotificationChannel)
  isEnabled
  createdAt, updatedAt
  // composite unique: userId + notificationTypeId + channelId
}

UserFeatureFlag {
  id
  userId (FK → User, indexed)
  featureFlagId (FK → FeatureFlag)
  isEnabled
  createdAt, updatedAt
  // composite unique: userId + featureFlagId
}
```

### Audit & Security `[v1 schema + ui]`

```typescript
AuditLog {
  id
  entityType  // 'brunch', 'user', 'invite', 'vote'
  entityId    // uuid of affected row
  action      // 'created', 'updated', 'deleted', 'archived'
  changedBy (FK → User)
  oldValue    // JSON snapshot
  newValue    // JSON snapshot
  ipAddress, userAgent
  createdAt   // immutable
}
```

### Feature Flags `[v1 schema + ui]`

```typescript
FeatureFlag {
  id, code, label, description
  isEnabled (global on/off)
  isUserOverridable
  createdAt, updatedAt
  // initial values: chat (off), bill_splitting (off)
}
```

### App Settings `[v1 schema + ui]`

```typescript
AppSetting {
  id, key, value, description
  updatedBy (FK → User)
  createdAt, updatedAt
}
```

### Notifications `[v1 schema + ui]`

```typescript
Notification {
  id
  userId (FK → User, indexed)
  notificationTypeId (FK → NotificationType)
  channelId (FK → NotificationChannel)
  brunchId (FK → Brunch, nullable, indexed)
  title, body
  readAt    // null = unread
  sentAt
  createdAt
}
```

### Brunch `[v1 schema + ui]`

```typescript
Brunch {
  id (uuid)
  title
  description (nullable)
  hostId (FK → User, indexed)
  statusId (FK → BrunchStatus, indexed)
  votingDeadline (nullable)
  votingClosedAt (nullable)  // early manual close (spec 0005 M4) — see §9.7

  // Permissions (folded in from BrunchSettings)
  allowInviteSuggestions (default true)
  requireHostApprovalToInvite (default true)
  allowLocationSuggestions (default true)
  allowTimeSuggestions (default true)
  requireHostApprovalForOptions (default true)  // spec 0005 M6

  // Host transfer — one transfer per brunch, kept for audit trail
  hostTransferredAt (nullable)
  hostTransferredFrom (FK → User, nullable)

  // Cancellation undo — the Inngest job ID for the pending cancellation notification.
  // Cleared once the 5-second window elapses and notifications fire, or on undo.
  // Handled in the queue layer; no status enum needed here.
  cancellationJobId (nullable)

  createdAt, updatedAt
  deletedAt, deletedBy
  archivedAt, archivedBy
}
```

### Invites & Attendees `[v1 schema + ui]`

```typescript
BrunchInvite {
  id
  brunchId (FK → Brunch, indexed)
  invitedUserId (FK → User, nullable — populated when user signs up via token)
  invitedEmail (always set)
  invitedBy (FK → User)
  token (unique, indexed)
  tokenExpiresAt
  lastResentAt (nullable)
  createdAt, updatedAt
  deletedAt, deletedBy
}

BrunchAttendee {
  id
  brunchId (FK → Brunch, indexed)
  userId (FK → User, indexed)
  inviteId (FK → BrunchInvite — synthetic invite created for host on brunch creation)
  rsvpStatusId (FK → RsvpStatus, indexed)
  respondedAt

  // Rich RSVP state — all nullable; only relevant for the matching rsvpStatus
  arrivingLate (default false)         // yes RSVPs: I'll be late
  leavingEarly (default false)         // yes RSVPs: I need to leave early
  dietaryNote (nullable)               // yes RSVPs: free-text note for the host
  decideBy (nullable)                  // maybe RSVPs: timestamp — "I'll know by X"
  regretNote (nullable)                // no RSVPs: optional free-text message
  inviteNextTime (default false)       // no RSVPs: "include me in the next one"

  createdAt, updatedAt
  deletedAt, deletedBy
  // composite unique: brunchId + userId
}

BrunchInviteSuggestion {
  id
  brunchId (FK → Brunch, indexed)
  suggestedBy (FK → User)
  suggestedEmail
  suggestedUserId (FK → User, nullable)
  statusId (FK → BrunchInviteSuggestionStatus)
  reviewedBy (FK → User, nullable)
  reviewedAt (nullable)
  createdAt, updatedAt
  // unique: brunchId + suggestedEmail (can only suggest someone once)
}
```

### Location & Time `[v1 schema + ui]`

**Decision type is derived, not stored** (ADR 0006, spec 0005): a brunch is in
`group_vote` for a given resource kind if it has more than one non-deleted
option of that kind, otherwise `host_decides`. There is no `decisionTypeId`
column on either table below — `BrunchDecisionType` survives only as a label
source for the UI badge, with no FK pointing at it. The derivation always
filters `deletedAt: null`; see `deriveDecisionMode` in `packages/core`.

```typescript
BrunchLocation {
  id
  brunchId (FK → Brunch, indexed)
  placeId        // Google Maps place ID
  placeName
  placeAddress
  placeUrl
  timezone       // IANA timezone, e.g., 'America/Chicago'
  isConfirmed (indexed)
  confirmedAt (nullable)
  proposedBy (FK → User)
  createdAt, updatedAt
  deletedAt, deletedBy
}

BrunchTime {
  id
  brunchId (FK → Brunch, indexed)
  scheduledAt (UTC, indexed)
  // Display rule: convert scheduledAt to BrunchLocation.timezone for primary display.
  // If viewer's local timezone differs from location timezone, show a subline:
  // "(at [Location]'s time: X)". Before location is confirmed (voting phase),
  // display times in the viewer's local timezone. No authoredTimezone field needed —
  // BrunchLocation.timezone is the canonical display zone post-confirmation.
  isConfirmed (indexed)
  confirmedAt (nullable)
  proposedBy (FK → User)
  createdAt, updatedAt
  deletedAt, deletedBy
}
```

### Votes `[v1 schema + ui]`

```typescript
BrunchLocationVote {
  id
  brunchLocationId (FK → BrunchLocation, indexed)
  userId (FK → User, indexed)
  createdAt, updatedAt
  // composite unique: brunchLocationId + userId
  // (redundant brunchId removed — premature optimization)
}

BrunchTimeVote {
  id
  brunchTimeId (FK → BrunchTime, indexed)
  userId (FK → User, indexed)
  createdAt, updatedAt
  // composite unique: brunchTimeId + userId
}
```

### Option Suggestions `[v1 schema + ui]`

Mirrors BrunchInviteSuggestion's shape (spec 0005 M6). Kept as their own tables
rather than a pending-status column on BrunchLocation/BrunchTime — with
decisionTypeId derived from a count of option rows (ADR 0006), a pending
suggestion sitting in those tables would silently flip a brunch into
group_vote before the host ever approved it.

```typescript
BrunchOptionSuggestionStatus {
  id, code, label, description, isActive, sortOrder, createdAt, updatedAt
  // values: pending, approved, declined
}

BrunchLocationSuggestion {
  id
  brunchId (FK → Brunch, indexed)
  suggestedBy (FK → User)
  placeId, placeName, placeAddress, placeUrl, timezone  // same shape as BrunchLocation
  statusId (FK → BrunchOptionSuggestionStatus)
  reviewedBy (FK → User, nullable)
  reviewedAt (nullable)
  createdAt, updatedAt
  // unique: brunchId + placeId (can only suggest a given place once)
}

BrunchTimeSuggestion {
  id
  brunchId (FK → Brunch, indexed)
  suggestedBy (FK → User)
  scheduledAt (UTC)
  statusId (FK → BrunchOptionSuggestionStatus)
  reviewedBy (FK → User, nullable)
  reviewedAt (nullable)
  createdAt, updatedAt
  // unique: brunchId + scheduledAt (can only suggest a given time once)
}
```

### Group Chat `[v1 schema only — future ui]`

Present in schema so UI placeholder can reference it. Realtime infrastructure deferred.

```typescript
Message {
  id
  brunchId (FK → Brunch, indexed)
  userId (FK → User, indexed)
  body
  createdAt, updatedAt
  deletedAt, deletedBy
}
```

---

### Friends & Social Graph `[v1 schema only — future ui]`

Tables present from day one so `BrunchAttendee` history passively builds social graph data. No friend UI in v1.

```typescript
FriendshipStatus {
  id, code, label, description, isActive, sortOrder, createdAt, updatedAt
  // values: pending, accepted, declined, blocked
}

Friendship {
  id
  requesterId (FK → User, indexed)
  recipientId (FK → User, indexed)
  statusId (FK → FriendshipStatus, indexed)
  acceptedAt (nullable)
  blockedAt (nullable)
  blockedBy (FK → User, nullable)
  createdAt, updatedAt
  // composite unique: requesterId + recipientId
}

FriendGroup {
  id
  ownerId (FK → User, indexed)
  name
  description (nullable)
  emoji (nullable)
  createdAt, updatedAt
  deletedAt, deletedBy
}

FriendGroupMember {
  id
  friendGroupId (FK → FriendGroup, indexed)
  userId (FK → User, indexed)
  addedBy (FK → User)
  createdAt, updatedAt
  deletedAt, deletedBy
  // composite unique: friendGroupId + userId
}
```

---

### Favorite Places `[v1 schema only — future ui]`

Table present so brunch creation can surface "no favorites yet" placeholder. No favorites UI in v1.

```typescript
UserFavoritePlace {
  id
  userId (FK → User, indexed)
  placeId (indexed)
  placeName
  placeAddress
  placeUrl
  timezone
  notes (nullable)
  createdAt, updatedAt
  deletedAt, deletedBy
  // composite unique: userId + placeId
}
```

---

### Dish & Ingredient Preferences `[v1 schema only — future ui]`

Lookup tables seeded at launch. Preference tables present for optional onboarding data collection. No preferences UI in v1.

```typescript
Dish {
  id, code, label, description, isActive, createdAt, updatedAt
}

Ingredient {
  id, code, label, description, isActive, createdAt, updatedAt
}

UserDishPreference {
  id
  userId (FK → User, indexed)
  dishId (FK → Dish)
  preference  // love | like | avoid
  createdAt, updatedAt
  // composite unique: userId + dishId
}

UserIngredientPreference {
  id
  userId (FK → User, indexed)
  ingredientId (FK → Ingredient)
  preference  // love | like | avoid | allergic
  createdAt, updatedAt
  // composite unique: userId + ingredientId
}
```

---

### Photos & Ratings `[future schema]`

Deferred — requires storage infrastructure (Supabase Storage / S3), photo moderation policy, and post-brunch status activation.

```typescript
// BrunchPhoto
// BrunchPhotoTag
// BrunchExperienceRating
// UserPlaceRating
// (defined in section 14.3 — build when post-brunch features ship)
```

---

### External Integrations `[future schema]`

Deferred — requires OAuth scope decisions, token encryption strategy, and per-provider implementation.

```typescript
// UserExternalIntegration
// BrunchCalendarEvent
// ExternalShareLog
// (defined in section 14.4 — build when calendar / sharing features ship)
```

---

## 9. Critical Architectural Decisions

### 9.1 Soft Delete Enforcement

Use Prisma middleware to auto-filter `deletedAt IS NULL` on all queries unless explicitly bypassed. Don't rely on every developer remembering.

### 9.2 Soft-Delete Email Collision

Soft-deleted users still hold their email. New signup with same email = unique constraint violation.

**Solution:** On account deletion, append suffix to email: `user@example.com.deleted.{timestamp}`. Preserves audit trail, frees email for reuse. Also helps with GDPR right-to-deletion compliance.

### 9.3 Timezone Handling

- Store `BrunchTime.scheduledAt` in UTC always
- `BrunchLocation.timezone` stores IANA zone (e.g., 'America/Chicago')
- Display logic: brunch time = UTC converted to location's timezone
- Each user sees the brunch in the location's local time

### 9.4 Vote Tables — No Redundant brunchId

Originally suggested keeping `brunchId` denormalized on vote tables for query performance. **Reverted** — premature optimization. Add back when actual scale demands it.

### 9.5 Token Lifecycle

```
Invite created → invitedEmail set, invitedUserId null
User signs up via token → invitedUserId populated, invitedEmail kept for record
```

### 9.6 Synthetic Invite for Host

When `Brunch` is created, create a synthetic `BrunchInvite` for the host AND a `BrunchAttendee` (rsvp = yes, respondedAt = now). Keeps `BrunchAttendee.inviteId` non-null and uniform.

### 9.7 Voting Close Rule

Single rule: voting closes on `votingDeadline`. Host can manually close early. No quorum-based auto-close. Simpler, predictable, no footguns.

### 9.8 Audit Log Scaling Plan

- v1: Postgres, partition by month
- Year 1: archive old rows to S3 / cold storage
- At scale: dedicated DB or ClickHouse
- Build behind an interface so the backend is swappable.

### 9.9 Notification Table TTL

Auto-delete read notifications older than 60 days. Keep unread indefinitely. Move to cold storage if needed.

### 9.10 Realtime Strategy

- v1: Supabase Realtime (in-stack, sufficient for early scale)
- Plan for swappable interface — Pusher, Ably, or self-hosted Redis pub/sub at larger scale

### 9.11 Rate Limiting

Don't use a DB table. Use Upstash Redis with TTL keys when needed. Defer until abuse appears.

### 9.12 Internationalization Groundwork

~~Use `next-intl` from day one even with English-only content.~~ **Amended by [ADR 0005](adrs/0005-defer-next-intl.md):** `next-intl` is deferred to the pre-launch checklist. UI copy is plain string literals until then; the string-extraction pass is accepted future work.

---

## 10. Async Event Architecture

### Principle

**API handles the transaction, queue handles the consequences.**

```
POST /brunch/:id/invite
  → creates BrunchInvite row (synchronous API)
  → fires 'invite/sent' event (queue)
    → sends email (Inngest handler)
    → creates Notification row (Inngest handler)
    → logs to AuditLog (Inngest handler)
```

### Events (v1)

- `brunch/created`, `brunch/confirmed`, `brunch/cancelled`
- `invite/sent`, `invite/resent`, `invite/expired`
- `attendee/rsvp.received`, `attendee/rsvp.changed`
- `vote/cast`, `vote/changed`
- `vote/deadline.approaching`, `vote/deadline.reached`
- `notification/email.send`

**v1 status (spec 0008).** `BrunchEventPayloads` in `packages/core/src/events/EventBus.ts` is the typed source of truth: `brunch/created`, `brunch/confirmed`, `invite/sent`, `invite/resent`, `attendee/rsvp.received`, `attendee/rsvp.changed`, `vote/cast` and `vote/changed`. Names nothing emits yet (`invite/expired`, `vote/deadline.approaching`, `vote/deadline.reached`, `brunch/cancelled`, `notification/email.send`) are out of the type until a spec gives them a producer. Only `invite/sent`, `invite/resent` and `brunch/confirmed` have handlers (the invite and confirmation emails); the others are emitted by the services but dropped by the Inngest bus until a handler lists them in `apps/web/src/inngest/events.ts`, which the follow-up notifications spec will do.

### Why Inngest, not Kafka

Brunchsters needs job queues, not event streaming. Kafka is overkill for the foreseeable future. Inngest is TypeScript-native, serverless, and integrates beautifully with Next.js.

---

## 11. Google Maps Integration

### Three APIs Used

- **Places API (New)** — autocomplete search + place details. Not the legacy "Places API" — a
  distinct product with a different service identifier (`places.googleapis.com` vs.
  `places-backend.googleapis.com`), enabled and key-restricted separately in Cloud Console.
- **Time Zone API** — resolves a selected place's IANA timezone (`timeZoneId`) from its lat/lng.
  Called once per place selection, alongside Place Details.
- **Maps JavaScript API** — display maps (optional v1, fine to defer)

### What's Stored

Five fields per location: `placeId`, `placeName`, `placeAddress`, `placeUrl`, `timezone` (IANA,
e.g. `America/Chicago`). Google not called again after place is selected.

### Cost Optimization

Only call Place Details (+ Time Zone) on user selection, not on every keystroke. A **session
token** (`crypto.randomUUID()`, generated client-side when the user starts typing) is passed on
every autocomplete request and the final Place Details call, then discarded after selection — this
groups a whole search-as-you-type sequence plus the details call into one Google billing session
instead of billing each keystroke separately. Autocomplete is cheap (~$2.83/1K), Details is more
(~$17/1K). Google's $200/month free credit covers significant usage.

### Provider Abstraction

```typescript
interface PlaceProvider {
  search(params: { query: string; sessionToken?: string }): Promise<readonly PlaceResult[]>;
  getDetails(params: { placeId: string; sessionToken?: string }): Promise<PlaceDetails | undefined>; // undefined on 404 — place no longer exists
}
```

App talks to interface, never directly to Google. Swap or add (Yelp, Foursquare) later without
touching app code. `GooglePlacesProvider` (the only implementation so far) lives in
`apps/web/src/adapters/`, not `packages/core` — it wraps live HTTP and is unit-tested with a
mocked `fetch` rather than the real API.

### API Key Setup

- **Server-only key, never sent to the browser.** `GOOGLE_PLACES_API_KEY` (no `NEXT_PUBLIC_`
  prefix) is read only in Next.js route handlers (`/api/v1/places/*`), which the wizard calls
  instead of hitting Google directly. This is a deviation from the original plan below — no
  client-side Maps usage exists yet, so there's nothing to referrer-restrict; if the Maps
  JavaScript API is ever added client-side, _that_ key should get its own
  `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` with an HTTP referrer restriction, kept separate from this one.
- API restriction: the key must explicitly list **Places API (New)** and **Time Zone API** in
  Cloud Console → Credentials → API restrictions. The legacy "Places API" restriction entry is a
  different service and won't work even when the API itself is enabled — this exact mismatch cost
  real debugging time (see `docs/SETUP.md` §3 troubleshooting note).
- Stored in `apps/web/.env.local` (dev) and Vercel env vars (prod)
- Two keys eventually (dev and prod); one key for now
- Set Google Cloud budget alert

---

## 12. Seed Data Required on Deploy

### v1 Schema Seeds (required at launch)

```
BrunchStatus:                  draft, active, confirmed, brunching*, paying*,
                               completed, cancelled, archived
BrunchDecisionType:            host_decides, group_vote
RsvpStatus:                    invited, yes, no, maybe
BrunchInviteSuggestionStatus:  pending, approved, declined
BrunchOptionSuggestionStatus:  pending, approved, declined
NotificationType:              rsvp.received, vote.cast, invite.suggestion,
                               location.suggested, time.suggested,
                               brunch.confirmed, vote.deadline.approaching,
                               invite.received
NotificationChannel:           email, push*, in_app
FeatureFlag:                   chat (off), bill_splitting (off),
                               friend_groups (off), favorites (off),
                               photos (off), ratings (off), calendar (off)

* = isActive false for v1
```

### v1 Schema Only Seeds (seed now, UI later)

```
FriendshipStatus:              pending, accepted, declined, blocked
Dish:                          eggs_benedict, avocado_toast, pancakes,
                               waffles, french_toast, omelette, granola,
                               bagel, shakshuka, huevos_rancheros
                               (curated initial set)
Ingredient:                    eggs, avocado, bacon, sausage, gluten_free,
                               dairy_free, vegetarian, vegan, nuts, shellfish
                               (dietary needs + common ingredients)
```

---

## 13. Things Intentionally Deferred from v1

### Deferred UI (schema present in v1, no UI yet)

These tables exist in your Prisma schema from day one but have no UI built around them. They either collect data passively or are referenced structurally by v1 tables.

| Item                    | Tables                                                                 | Why schema now                               | Why UI later                                            |
| ----------------------- | ---------------------------------------------------------------------- | -------------------------------------------- | ------------------------------------------------------- |
| Group chat              | `Message`                                                              | Placeholder in UI, structurally complete     | Realtime complexity — planning loop valuable on its own |
| Friends & groups        | `Friendship`, `FriendGroup`, `FriendGroupMember`, `FriendshipStatus`   | Brunch history passively builds social graph | Social features need critical mass of users first       |
| Favorite places         | `UserFavoritePlace`                                                    | Brunch creation can surface placeholder      | Not blocking v1 flow                                    |
| Dish & ingredient prefs | `Dish`, `Ingredient`, `UserDishPreference`, `UserIngredientPreference` | Optional onboarding collection from day one  | Recommendations engine needs data before UI is valuable |

### Deferred Schema (don't create tables yet)

These have no tables in v1. Infrastructure decisions or UI designs need to be made first.

| Item                                    | Reason for full deferral                                                               |
| --------------------------------------- | -------------------------------------------------------------------------------------- |
| Photos + ratings                        | Needs storage infrastructure + photo moderation policy + post-brunch status activation |
| Calendar integration                    | OAuth scope + token encryption strategy decisions needed first                         |
| External sharing                        | Deep-link only approach for now — no tables needed short term                          |
| Recommendations engine                  | No schema until approach decided + enough data exists                                  |
| Bill splitting                          | Out of brunch-planning scope entirely                                                  |
| Mid-brunch features                     | Out of brunch-planning scope entirely                                                  |
| Push notifications                      | Email sufficient for web v1                                                            |
| `RateLimitLog`                          | Use Upstash Redis with TTL keys — not a DB table                                       |
| `LegalDocument` / `UserLegalAcceptance` | No legal docs written yet                                                              |
| `Role` / `UserRole` tables              | Simple `User.role` enum sufficient for v1                                              |
| Embedded map display                    | Place details + address sufficient for v1                                              |
| Yelp / Foursquare                       | Provider abstraction makes this a clean add later                                      |
| Mobile app                              | API-first architecture ensures it's possible — build web first                         |

---

## 14. Future Feature Themes (Post-v1)

These are organized into themes for prioritization and architectural planning. Each theme has architectural notes for what would be added when implemented.

### 14.1 Personalization & Preferences

**Favorite Locations** — users save brunch spots they love.

```typescript
UserFavoritePlace {
  id
  userId (FK → User, indexed)
  placeId        // Google Maps place ID
  placeName
  placeAddress
  placeUrl
  timezone       // IANA, for consistency with BrunchLocation
  notes (nullable)  // user's personal note
  createdAt, updatedAt
  deletedAt, deletedBy
  // composite unique: userId + placeId
}
```

**Design notes:**

- Store our own table — never depend on Google to hold favorites. Your data, your control.
- Mirror fields from `BrunchLocation` for consistency
- Surfaces in: brunch creation ("Pick from favorites"), suggestions, profile page

**Favorite Dishes & Ingredients** — drives smart location suggestions.

```typescript
Dish {
  id, code, label, description, isActive, createdAt, updatedAt
  // lookup table — 'eggs_benedict', 'avocado_toast', 'pancakes'
}

Ingredient {
  id, code, label, description, isActive, createdAt, updatedAt
  // lookup table — 'eggs', 'avocado', 'bacon', 'gluten_free'
}

UserDishPreference {
  id
  userId (FK → User, indexed)
  dishId (FK → Dish)
  preference  // 'love', 'like', 'avoid'
  createdAt, updatedAt
  // composite unique: userId + dishId
}

UserIngredientPreference {
  id
  userId (FK → User, indexed)
  ingredientId (FK → Ingredient)
  preference  // 'love', 'like', 'avoid', 'allergic'
  createdAt, updatedAt
  // composite unique: userId + ingredientId
}
```

**Design notes:**

- Tag-based over free-text — enables matching/recommendations
- `allergic` for ingredients matters for safety surfacing in group brunches
- Lookup tables curated initially, possibly user-extensible later
- Recommendations engine consumes these + Google place categories/reviews

---

### 14.2 Social Graph

**Friends** — bidirectional connection between users.

```typescript
Friendship {
  id
  requesterId (FK → User, indexed)
  recipientId (FK → User, indexed)
  statusId (FK → FriendshipStatus, indexed)
  acceptedAt (nullable)
  blockedAt (nullable)
  blockedBy (FK → User, nullable)
  createdAt, updatedAt
  // composite unique: requesterId + recipientId
  // application-level: also enforce uniqueness regardless of direction
}

FriendshipStatus {
  id, code, label, description, isActive, sortOrder, createdAt, updatedAt
  // values: pending, accepted, declined, blocked
}
```

**Friend Groups** — "The Usual Crew", "Work Friends", etc.

```typescript
FriendGroup {
  id
  ownerId (FK → User, indexed)
  name           // user-defined, e.g., "Sunday Crew"
  description (nullable)
  emoji (nullable)  // optional visual marker
  createdAt, updatedAt
  deletedAt, deletedBy
}

FriendGroupMember {
  id
  friendGroupId (FK → FriendGroup, indexed)
  userId (FK → User, indexed)
  addedBy (FK → User)
  createdAt, updatedAt
  deletedAt, deletedBy
  // composite unique: friendGroupId + userId
}
```

**Design notes:**

- Friend groups are owned by one user — not collaborative groups
- Inviting a group = shortcut that generates individual `BrunchInvite` rows for each member
- Friendship required before adding to a group (or relax this if too restrictive)
- Privacy: friend groups are private to the owner
- Future: shared/collaborative groups would need a separate entity

**Architectural concern at scale:** Friendship queries (mutual friends, friend-of-friend) get expensive with growth. Plan for a graph-aware caching layer (Redis sets) when this matters.

---

### 14.3 Post-Brunch Engagement

**Photos** — share pictures from the brunch.

```typescript
BrunchPhoto {
  id
  brunchId (FK → Brunch, indexed)
  userId (FK → User, indexed)  // who uploaded
  storageUrl     // Supabase Storage / S3
  caption (nullable)
  takenAt (nullable)  // EXIF if available
  createdAt, updatedAt
  deletedAt, deletedBy
}

BrunchPhotoTag {
  id
  photoId (FK → BrunchPhoto, indexed)
  taggedUserId (FK → User, indexed)
  taggedBy (FK → User)
  createdAt, updatedAt
  // composite unique: photoId + taggedUserId
}
```

**Ratings & Reviews** — both the brunch experience AND the location separately.

```typescript
BrunchExperienceRating {
  id
  brunchId (FK → Brunch, indexed)
  userId (FK → User, indexed)
  rating         // 1-5
  review (nullable)
  createdAt, updatedAt
  deletedAt, deletedBy
  // composite unique: brunchId + userId
}

UserPlaceRating {
  id
  userId (FK → User, indexed)
  placeId (indexed)  // Google Maps place ID
  brunchId (FK → Brunch, nullable, indexed)  // origin brunch if applicable
  rating         // 1-5
  review (nullable)
  visitedAt
  createdAt, updatedAt
  deletedAt, deletedBy
  // composite unique: userId + placeId + visitedAt
}
```

**Design notes:**

- Separate experience rating (the brunch with friends) from location rating (the restaurant) — they're different things
- `UserPlaceRating` is portable — you can rate a place without it being tied to a brunch
- Multiple ratings per place over time allowed (`visitedAt` discriminates)
- This data becomes powerful for personalized suggestions later

**Storage requirements:**

- Add **Supabase Storage** (or S3) for photo uploads
- Image processing — resize/compress on upload via Inngest function
- CDN delivery for photos (Supabase Storage has this built-in)
- Photo moderation policy needs thought before launch

**Status flow updates required:**

- The `brunching`, `paying`, `completed` statuses (already defined as inactive in v1) become active when post-brunch features ship
- Photos and ratings only allowed in `brunching` and later statuses

---

### 14.4 External Integrations

**Calendar Export (Easy — ship first)**

- **Google Calendar** — Two paths:
  - Simple: Generate `.ics` file, user adds manually
  - Integrated: OAuth scope `calendar.events` to write directly
- **Apple Calendar** — `.ics` file (no public write API)
- **Outlook / others** — `.ics` file works universally

```typescript
// No new tables needed for .ics export — generated on demand
// For OAuth-integrated calendar writes:

UserCalendarIntegration {
  id
  userId (FK → User, indexed)
  provider       // 'google_calendar', 'apple_calendar' (future), 'outlook'
  externalAccountId
  accessToken    // encrypted
  refreshToken   // encrypted
  scopes (array)
  expiresAt
  isActive
  createdAt, updatedAt
}

BrunchCalendarEvent {
  id
  brunchId (FK → Brunch, indexed)
  userId (FK → User, indexed)
  integrationId (FK → UserCalendarIntegration)
  externalEventId  // Google's event ID for updates/deletion
  syncedAt
  createdAt, updatedAt
  // composite unique: brunchId + userId + integrationId
}
```

**Calendar Availability Reading (Medium effort)**

OAuth scope `calendar.readonly` lets you read free/busy times. Useful for:

- Suggesting brunch times when everyone's free
- Warning host about scheduling conflicts

**Privacy consideration:** Calendar data is sensitive. Read it only when needed, never store event details, only consume free/busy windows.

**Posting Reviews to External Services (Hard — partial possible)**

| Service             | Programmatic Posting | Workaround                   |
| ------------------- | -------------------- | ---------------------------- |
| Google Maps reviews | ❌ No public API     | Deep-link to review form     |
| Yelp reviews        | ❌ Partnership only  | Deep-link to Yelp            |
| Foursquare          | ❌ Limited           | Deep-link                    |
| Instagram           | ❌ Closed off        | Share image to user's device |

**Reality check:** Posting reviews programmatically to most platforms isn't supported. The realistic feature is:

- **Deep links** — "Share to Google Maps" opens the review form pre-populated
- **Image sharing** — generate a shareable photo card the user can post manually
- **Native share sheets** — on mobile, the OS handles cross-app sharing

```typescript
ExternalShareLog {
  id
  userId (FK → User, indexed)
  brunchId (FK → Brunch, nullable, indexed)
  photoId (FK → BrunchPhoto, nullable)
  platform       // 'google_maps', 'yelp', 'instagram', 'twitter'
  shareType      // 'review', 'photo', 'event'
  createdAt
  // analytics — what's actually being shared
}
```

**OAuth Architecture**

All third-party integrations should use a unified OAuth flow:

```typescript
// Already covers auth providers via UserAuthProvider
// For service integrations beyond identity:
UserExternalIntegration {
  id
  userId (FK → User, indexed)
  provider       // 'google_calendar', 'yelp', 'instagram', etc.
  externalAccountId
  accessToken    // encrypted at rest
  refreshToken   // encrypted at rest
  scopes (array of strings)
  expiresAt
  isActive
  lastUsedAt
  createdAt, updatedAt
  // composite unique: userId + provider + externalAccountId
}
```

**Critical security notes:**

- All tokens encrypted at rest (Postgres `pgcrypto` or app-level encryption)
- Never expose tokens to frontend — all API calls go through backend
- Track scopes granted — re-prompt user if scope expansion needed
- Provide one-click revoke per integration

---

### 14.5 Recommendations Engine (Enabling Layer)

This isn't a feature itself but the system that makes preferences valuable.

**What it consumes:**

- `UserFavoritePlace` — places user already loves
- `UserDishPreference` / `UserIngredientPreference` — taste profile
- `UserPlaceRating` — what user actually liked vs. didn't
- `BrunchExperienceRating` — group dynamics (some places are great for groups, others for couples)
- Google Places categories, hours, price level, ratings
- Friend graph — what your friends rate highly
- Time of day, neighborhood, dietary needs

**What it produces:**

- Suggestions during brunch creation ("3 places your crew might love")
- Personalized homepage feed (deferred from v1, comes back here)
- "Surprise me" feature — let the app pick

**Architecture:**

- Likely starts as Postgres queries + simple scoring
- Graduates to a separate recommendations service when complexity warrants
- Don't build until you have data — recommendations without data are random

---

### 14.6 Theme Priority Matrix

If implemented in this order, each unlocks value for the next:

| Order | Theme                                 | Why this order                                                               |
| ----- | ------------------------------------- | ---------------------------------------------------------------------------- |
| 1     | **Friends + Friend Groups**           | Foundation for everything social. Removes invite friction immediately.       |
| 2     | **Calendar Export (.ics)**            | Easy win, no OAuth needed, completes the planning loop.                      |
| 3     | **Favorite Locations**                | Builds quickly on existing place data. Reduces brunch creation friction.     |
| 4     | **Group Chat (already deferred)**     | Best added once social graph exists.                                         |
| 5     | **Photos + Ratings**                  | Activates `brunching`/`completed` statuses. Requires storage infrastructure. |
| 6     | **Favorite Dishes/Ingredients**       | Data collection layer for recommendations.                                   |
| 7     | **Calendar Availability (OAuth)**     | Sensitive data, builds on calendar export trust.                             |
| 8     | **Recommendations Engine**            | Needs all the above as input.                                                |
| 9     | **External sharing**                  | Polish layer once core experience is solid.                                  |
| 10    | **Bill splitting (already deferred)** | Mid-brunch feature, lowest planning-loop value.                              |

---

### 14.7 Updated Lookup Table Additions for Future Themes

When these themes are implemented, add:

```
FriendshipStatus:        pending, accepted, declined, blocked
PreferenceLevel:         love, like, neutral, avoid, allergic
ExternalProvider:        google_calendar, apple_calendar, yelp, instagram, etc.
SharePlatform:           google_maps, yelp, instagram, twitter, native_share
```

Already-defined inactive statuses become active:

```
BrunchStatus:  brunching → active when photos/ratings ship
               paying → active when bill splitting ships
               completed → active when post-brunch engagement ships
```

---

## 15. Repository Structure

**One repo, monorepo-style internal structure.** No separate repos for backend, frontend, migrations, or infrastructure for v1.

```
brunchsters/
├── apps/
│   └── web/                    # Next.js app (frontend + API routes)
├── packages/
│   ├── database/               # Prisma schema, migrations, seed scripts
│   ├── shared/                 # Shared types, constants, utilities
│   └── core/                   # Business logic, services (framework-agnostic)
├── infrastructure/             # IaC (added if/when AWS migration happens)
├── docs/
│   ├── constitution.md         # Non-negotiable project principles
│   ├── PLANNING.md             # This document — what we're building
│   └── adrs/                   # Architecture Decision Records — why we built it this way
│       ├── README.md
│       ├── 0001-monorepo-structure.md
│       ├── 0002-hosting-vercel-supabase.md
│       └── 0003-no-email-password-auth.md
├── specs/                      # Per-feature specifications
│   ├── README.md
│   └── 0001-create-brunch/
│       ├── spec.md             # WHAT
│       ├── plan.md             # HOW
│       └── tasks.md            # Breakdown
└── .github/
    └── workflows/              # CI/CD pipelines
```

### Rationale

- **One repo to start** — no cross-repo coordination, faster to ship
- **`packages/core` is framework-agnostic** — when mobile app eventually exists, it imports this package directly. No business logic rewrite.
- **`packages/database` is the schema source** — Prisma schema, migrations, seed scripts all live together. No separate "data" repo (migrations are tightly coupled to the model — splitting them creates sync headaches).
- **`packages/shared`** — types and constants used by web, future mobile, future services. DRY enforced.
- **`docs/PLANNING.md` lives in the repo** — git history is the design audit trail; PRs are how decisions get committed.

### When to split into multiple repos

- Mobile app with different release cycle → mobile gets own repo
- Team with ownership boundaries
- API needs independent deploy from frontend

For solo side project: don't split. Premature.

### Tools to consider

- **Turborepo** — handles the monorepo build caching well, popular with Next.js
- **pnpm workspaces** — package management for the monorepo
- Both are optional for v1 — npm workspaces work fine to start

---

## 16. Build Order

1. ✅ Planning (this document)
2. ✅ **Project scaffold** — Next.js + TypeScript + Prisma (specs/0001-repo-scaffold)
3. ✅ **Prisma schema** — codify this data model (specs/0001-repo-scaffold M4)
4. ✅ **Seed lookup tables** (specs/0001-repo-scaffold M5)
5. ✅ **Auth** — NextAuth + Google (specs/0002-auth). Apple Sign-In deliberately deferred — see spec 0002 "What".
6. ✅ **Core brunch flow** — create → invite → attendee → vote → confirm (specs/0001–0005)
   - ✅ create (specs/0003-create-brunch)
   - ✅ invite + attendee/RSVP (specs/0004-invitations)
   - ✅ vote (specs/0005-voting-and-confirmation, shipped — PR #8): `castLocationBallot`/`castTimeBallot`, `closeVoting`, `updateVotingDeadline`, `getBrunchVoting`, and the `BallotChecklist`/`OptionSuggestionControl` UI on `/brunch/[id]`. Decision mode is derived, not stored (ADR 0006).
   - ✅ confirm (specs/0005-voting-and-confirmation, shipped — PR #8): `confirmBrunch`, partial unique indexes enforcing one confirmed location/time per brunch, and the `/brunch/[id]/manage` host workbench (`OptionManager`, `VotingControls`, `ConfirmControl`, `OptionSuggestionReview`). Also includes an independent-review fix-through (real `FOR UPDATE` row locking for the vote-vs-close race, duplicate-ballot/duplicate-live-option rejection, voting-closed gating on add/approve, confirm's unique-constraint-collision mapping, and several UI staleness/timezone fixes) — see `specs/0005-voting-and-confirmation/tasks.md`.
7. ✅ **Google Places integration** — folded into specs/0003-create-brunch (`GooglePlacesProvider`: Places Autocomplete (New) + Time Zone API); `PlaceSearchInput` extracted in specs/0005 M8 and shared between the creation wizard and the manage route
8. **Notifications + Inngest** — split in two. ✅ **Spec 0008** (shipped: PR #12, released as v1.6.0, [ADR 0009](adrs/0009-inngest-event-bus-and-email-delivery.md)): typed events, Inngest + Resend wiring, and the invite and brunch-confirmed emails. **The notifications spec** (not started; it comes after design fidelity (spec 0011) and the feedback-surfaces spec, and takes the next free number when written; its toast and unread-count UI state belongs in the Redux store, ADR 0011): in-app inbox, preferences, per-brunch mute, realtime, deadline reminders and host-facing emails. Cancel/undo, running-late and host transfer are separate features whose services do not exist yet. The 66% close-voting nudge (`vote.autoclose.prompted`, §7) is derived on every read rather than fired as an event, for the same reason — see §7's v1 note.
9. **UI** — host flow, invitee flow, dashboard. Dashboard, creation wizard, brunch detail page, invite panel, RSVP control, suggestion panel, the public invite landing page, the voting/suggestion UI on the brunch detail page, and the host's manage workbench are all built (specs/0003, 0004, 0005). **Styling is spec 0009** ([ADR 0010](adrs/0010-css-modules-and-design-tokens.md), shipped: PR #14, released as v1.7.0; signed off on 2026-10-19 as the foundation, with the prototype's screen compositions and tone left to a follow-up design-fidelity spec, now 0011, which follows the Redux UI-state spec 0010 and [ADR 0011](adrs/0011-redux-toolkit-for-client-ui-state.md)): tokens, fonts, dark mode, primitives, and every screen above restyled from `prototype/` and `design-docs/`; the prototype's screens that need new behavior (inbox, cancel/change, Quick Brunch, ...) are tracked in that spec's parity table and ship with their features.
   - ✅ **Redux for UI state** — spec 0010 ([ADR 0011](adrs/0011-redux-toolkit-for-client-ui-state.md)): Redux Toolkit store per request in the `(authenticated)` layout; the creation wizard and the vote ballots (places and times) moved onto it with no visible change.
   - **Ideas that are not on the roadmap yet** (friends and "people you know" in the invite panel, pending suggestions inside the Locations and Times panels, staged confirmation) are logged in §17 under "Product candidates raised after spec 0011 closed". Add new ideas there.
   - **Roadmap order (decided 2026-10-21):** (1) ✅ **design fidelity, spec 0011** (complete 2026-10-22, ready to merge: [`specs/0011-design-fidelity/`](../specs/0011-design-fidelity/spec.md), [ADR 0012](adrs/0012-design-fidelity-and-presentation-rules.md)): the prototype's screen compositions, copy and tone, no state changes; (2) the **brunch lifecycle spec**: cancel (with its confirmation), archive and delete as host actions, hidden from the dashboard once done (the schema already has `archivedAt` and an `archived` status and nothing uses them yet; added 2026-10-21 because old test brunches clog the dashboard and the Copy Pass already words "Call it off"); (3) the **feedback-surfaces spec**: one shared mutation thunk and the migration of the remaining controls off local state, toasts, loading skeletons, the server's real error messages and the silent failures (§17 "Redux follow-ups" and "Silent failures to surface"); (4) the **notifications spec**: inbox, preferences, per-brunch mute, realtime, reminders, host-facing emails, and the cancellation notice; (5) a **security-hardening spec** (added 2026-10-22: rate limits first, then the items under "Security and session follow-ups" in §17), so the beta does not open before limits exist; (6) the **deployment spec**, last: put the app in the cloud as a private beta (Vercel, Supabase, Google OAuth production redirect, Inngest, Resend, domain, the §17 pre-launch checklist) so the signed-in screens are reviewed on a real phone and every production-only problem is found once, with all the behavior built; infrastructure, no UI change. Fidelity goes first because the later specs need its final look and shell, and migrating the controls afterwards avoids restyling and rewriting the same files twice. **Order revised by the owner on 2026-10-21:** deployment moved from second to last (build the behavior first; until then the phone is judged on phone-width boards, because signed-in screens need a deployed sign-in to open on a device). Whether the lifecycle spec or the feedback-surfaces spec comes first is settled in the lifecycle spec's grill: cancelling wants a confirmation and an undo, which are feedback surfaces. Later specs are referred to by name, not number, so the numbers are assigned when each is written.
10. ✅ **E2E testing infrastructure** — shipped: [ADR 0007](adrs/0007-e2e-testing-stack.md), specs/0006-e2e-testing-infra (PR #9). Playwright (Chromium) against a dedicated `brunchsters_e2e` database with minted session cookies; 34 journeys across auth, creation, invitations, voting, manage, confirm, failure recovery, sessions and API authorization (65 tests at the time; 75 now, with spec 0008's email journeys), run on every PR and every push to `main`, and releases are gated on the whole CI run. Testcontainers deferred and no test-only auth provider (see the ADR). Every new feature spec now lists its E2E journeys (CLAUDE.md — Process).

### Setup tasks parallel to development

- GitHub repo ✅ / `main` rulesets ✅ — as of 2026-10-18 two rulesets are active on `main` (read with `gh api repos/eknapp44/brunchsters-v2/rules/branches/main`; the classic branch-protection endpoint does not see rulesets): `main-1` blocks deleting it and force-pushing; `main-2` requires a pull request (0 approvals) and the seven CI checks to pass with the branch up to date, with a bypass for the repository Admin role. The release job only tags and creates a GitHub Release (it never commits to `main`), so it needs no allowance. Details and an optional hardening step are in `docs/SETUP.md` ("Protecting `main`").
- ✅ CI pipeline (lint, typecheck, test on every PR) — `.github/workflows/ci.yml`; integration tests (`test-integration`, real Postgres service container) added as of specs/0004-invitations; Playwright E2E (`e2e`) added as of specs/0006. As of spec 0006 M8 CI also runs on every push to `main` and the semantic-release job lives in the same workflow, needing every check — a release can only be cut from a commit that passed them all.
- Vercel project linked to GitHub (auto-deploy)
- Supabase project (Postgres + auth optional)
- Google Cloud project + API keys
- Inngest account
- Resend account
- Domain registration

---

## 17. Open Questions / Future Decisions

### Resolved

- **Invite token expiry** — 7 days after the scheduled brunch date. Hosts can revoke and regenerate at any time.
- **Calendar integration** — Google Calendar add-to-calendar chip is v1 (one-tap, no OAuth, disabled until location + time locked). Full calendar export (.ics) and availability reading are v2.
- **Realtime mechanism** — Supabase Realtime for v1. Sufficient for early scale; re-evaluate if vote-animation latency becomes a UX issue.
- **RSVP visibility** — Host sees every attendee by full name and state, plus invited people who have not responded (as an email, "Hasn't said yet"). Every other member sees `First L.` for those who said **yes** or **maybe** and only **counts** for "no" and "hasn't said yet" (names are hidden on "no" entries). Outsiders see nothing (404). Reworded 2026-10-21 by [ADR 0012](adrs/0012-design-fidelity-and-presentation-rules.md); implemented as `getBrunchRoster` in spec 0011. Display-layer rule, no schema impact.
- **Push notification provider** — Deferred to v2 ADR. Candidates: OneSignal (easiest multi-platform) vs. native APNs/FCM. Decide when push scope is specced.

### Still Open

- **Design-fidelity deferrals** ([ADR 0012](adrs/0012-design-fidelity-and-presentation-rules.md), spec 0011 "What This Spec Does Not Cover"): (1) a **Settings spec** — profile photos (Google or uploaded, **opt-in**: members' browsers would fetch the image from Google and the photo was given for sign-in, not for sharing), dark-mode toggle, edit profile; until then every avatar is initials; (2) **collapsible phone sections**, decided after a real-phone review on the deployment; (3) **link-preview (Open Graph) images**, **privacy and terms pages and a footer**, a `theme-color` — deployment-adjacent; (4) **auto-"yes" on opening an invite link** while signed in (spec 0004): the owner finds it odd and a GET should not change data; direction recorded under "Security and session follow-ups" (3) below; (5) unify dashboard status wording ("Open for votes") with the brunch page's lookup label; (6) live regions for vote counts (flagged in `design-docs/Accessibility Pass.html`) — feedback-surfaces spec; (7) the Copy Pass's notification strings, kept in `specs/0011-design-fidelity/plan.md` for the notifications spec; (8) prototype features with no backend (cancel and change, tiebreaker, quiet nudge, plus-ones, add to calendar, join-by-link, share sheet) and their copy. (9) the wizard's description as an "add a description" button instead of an always-visible field (the field is marked "optional" in the meantime), and a brunch that needs no title (it would need a fallback name wherever the title is shown). (10) the invite email's **when and where** (the prototype shows the date, the place and "Voting between 3 spots (closes Thu)"; the invite email job does not read the options or the deadline, and spec 0011 is copy only) — the notifications spec, which reshapes these emails anyway. (11) a **visual-regression gate with baselines** (the boards are for review by eye; nothing compares pixels).
- **Security and session follow-ups** (added 2026-10-22 after spec 0011's review; owner decisions in brackets). (1) **Rate limits** [wanted, before the beta]: nothing limits how many invitations a person can email (the app could be used to send spam), how often place search is called (it costs money through the Google Places key), or how often anything else is hit. Needs its own spec and probably an ADR (where the counters live: the database, or a hosted store; per person and per brunch; what a person sees when limited). (2) **Security headers**: shipped 2026-10-22 (nosniff, frame denial, a referrer policy with `no-referrer` on `/invite/*`, a permissions policy, no `X-Powered-By`; journey S1). Still open: a **Content-Security-Policy** (Next's inline scripts need a per-request nonce, middleware work), **Strict-Transport-Security** (set by the host on the real domain, not from localhost), and a `pnpm audit` / dependency-alert routine. (3) **Opening an invite link changes data on a GET** [owner: "odd for a GET to change data", and the auto-"yes" feels wrong]: today a signed-in person opening `/invite/<token>` is RSVP'd yes and redirected (spec 0004), and that page also adds them as an attendee. Direction: the page shows the preview with an explicit **Join** button (a POST), the brunch page then asks "You in?" with nothing chosen; the auto-"yes" goes away. Needs a journey change in the invitee journeys (A-series) and belongs with the feedback-surfaces spec, which touches the same controls. This supersedes design-fidelity deferral 4. (4) **Expired or invalid session mid-use** [owner: revisit]: what a person sees when their session ends while a page is open (a control's fetch gets a 401 and shows the generic error; a page load redirects to sign-in with a callback). The e2e server logs show `JWTSessionError` for the deliberately expired cookies; the real-user behavior has not been checked. Decide the wording and whether to send the person back where they were; belongs with the feedback-surfaces spec. (5) **Account deletion** does not exist, so a soft-deleted user's row would still show in a roster (every read behaves the same way); decide with the Settings spec. (6) `callbackUrl` is now restricted to a path on this site (`safeCallbackPath`, unit-tested, journey P9). (7) A member opening the host-only manage page now gets a **403** (`forbidden()`, journey C3/H4), an outsider the same 404 as a made-up id.
- **Product candidates raised after spec 0011 closed** (owner, 2026-10-22; none is specced or scheduled; each needs `/spec-grill`). (1) **Inviting people you know instead of typing emails.** The friends tables already exist (`Friendship`, `FriendGroup`, `FriendGroupMember`, with no UI, §8) and `BrunchAttendee` history already records who has brunched with whom. Recommended shape, in two phases: first a **"people you've brunched with" picker** in the invite panel (derived from past brunches, searchable by name, invites by user id so no email is shown; typing an email stays for people not on Brunchsters yet), with no request flow; then **explicit friends and groups** ("The Usual Crew") with the accept/decline states the schema already has. Searching all users is not allowed (it would let anyone enumerate accounts); the pool is people you share a brunch with, or accepted friends. Best after the notifications spec, so an invited existing user hears about it in the app. (2) **Pending suggestions inside the Locations and Times panels** on the manage page (a "Suggested" group under the approved options, each with Approve and Decline, beside Remove) instead of their own panel. Recommended, as part of the lifecycle spec's manage-page pass; it changes journeys that count list items and find "suggested by" (listed per milestone). Pending rows stay out of vote counts and out of the Confirm panel. (3) **Separate closing times or separate confirmations for places and times.** Not recommended as separate deadlines (two clocks, more states, nobody has asked). A narrower idea worth watching: **staged confirmation** (lock the place early, keep voting on times); it fits the rule that times show in the place's timezone once the place is confirmed (§9.3), but it changes the status and lock rules and the confirmation emails, so it needs its own spec and real beta feedback first.
- **Redux follow-ups** ([ADR 0011](adrs/0011-redux-toolkit-for-client-ui-state.md), spec 0010 "What this spec does not cover"). Deliberately left out of the first Redux slice, to pick up as their own specs: (1) move the other controls' `submitting`/`error`/`pending` (RSVP, invites, suggestions, option management, voting controls, confirmation, suggestion review) into a shared mutation slice; (2) toasts and a visible error surface, and show the server's real error message instead of the generic strings (overlaps "Silent failures to surface" below); (3) the unread-notifications count and realtime updates (the notifications spec); (4) wizard draft persistence across reloads (needs a decision on stale drafts); (5) RTK Query, only if Server Components plus `router.refresh()` stop being enough; (6) accepted gaps from the pre-merge review, listed with reasons in `specs/0010-redux-ui-state/spec.md` "Known gaps": no test that sign-out drops the store (revisit if the provider moves or sign-in becomes client-side), and two overlapping saves from different visits can reach the server out of order (needs sequencing or a conditional write on the vote endpoints). Also one unexplained intermittent dev-mode e2e failure (V2, mobile project) seen once; if it recurs, turn on Playwright `trace: 'retain-on-failure'`. The recipe for moving a control is in `apps/web/CLAUDE.md` (State); the feedback-surfaces spec should migrate all of the controls in (1) at once through one shared mutation thunk with per-key status, and give the notifications spec its unread count and inbox state in the same store.
- **Pre-launch checklist (email and queue)** — before real invitees: set the five production variables in Vercel (`AUTH_URL`, `RESEND_API_KEY`, `EMAIL_FROM`, `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY`; never `INNGEST_DEV`); register the deployed `/api/inngest` URL with Inngest Cloud; add the production redirect URI for Google sign-in; do the first real production boot and send; send to non-Gmail inboxes; exercise Resend's rejected-recipient path (`validation_error`) and Inngest Cloud's signature check against the real deployment; decide what happens to replies to the sending address (there is no `replyTo`). Detail in `specs/0008-email-notifications/tasks.md`.
- **Silent failures to surface** — the creation wizard ignores the invite request's response (a spec 0004 choice), and a host gets no signal when an email did not go out (a rejected address, the queue down). Input for the feedback-surfaces spec (the wizard's ignored invite response, real server error text) and the notifications spec (the host-facing email signal).
- **Brunch size cap** — nothing limits how many people a brunch can invite or accept (there is a minimum size, no maximum). Needs its own spec: does it count invited or "yes"? what does the host see at the limit? do suggestions respect it? Spec 0008 only bounds a single `sendInvites` request to 50 addresses (an input guard for email fan-out, not this cap).
- **E2E testing infrastructure (testcontainers + test-auth bypass + Playwright).** **Resolved — shipped as [ADR 0007](adrs/0007-e2e-testing-stack.md) / `specs/0006-e2e-testing-infra`; the proposal below changed in two ways: testcontainers is deferred (a dedicated e2e database on local Postgres / the CI service container instead) and there is no test-only `Credentials` provider (Playwright mints session cookies, so `auth.ts` is untouched).** Original proposal, after spec 0004: an ephemeral Postgres via `@testcontainers/postgresql` for integration tests (no dependency on a locally running Supabase instance), a test-only NextAuth `Credentials` provider gated behind an env flag (never reachable in production) so headless tests can log in as fixture users without real Google OAuth, and Playwright driving full multi-actor flows (invite → second account joins → RSVP → suggestion → approve) as automated regression coverage. Motivated by spec 0004's M5/M6 bugs (self-invite batch rejection, already-member collision) — both were only caught by manual two-account browser testing, never by unit/integration tests, because the bug required two different signed-in identities interacting with the same data. **Reinforced by spec 0005:** its voting/manage UI (M7/M8) had no browser or auth-bypass available at all, so verification fell back to hand-minting NextAuth session JWTs with `next-auth/jwt`'s `encode()` and driving the live dev server's HTTP surface directly — a real but one-off, non-reusable workaround that proved the server-rendered data and route handlers were correct without ever proving a checkbox click, a debounced search, or `router.refresh()` work in an actual browser. That gap (client-side interactivity, unverified) is recorded in `specs/0005-voting-and-confirmation/tasks.md`'s M7/M8 testing notes and its post-M8 review section. Candidate for CI (GitHub Actions runners have Docker by default, so both testcontainers and headless Playwright run there naturally). Author wants to push for including this before the initial release but is open to sequencing it after if it doesn't fit. Needs its own ADR (new libraries, new auth code path) and spec before implementation — not a milestone of any single feature spec.
- **Email addresses are compared case-sensitively across requests — RESOLVED by [spec 0007](../specs/0007-email-normalization/spec.md) / [ADR 0008](adrs/0008-normalize-email-addresses.md):** addresses are now stored and compared trimmed and lowercased, produced by `normalizeEmail` (the only constructor of the branded `Email` type) at the request schemas and at sign-in, existing rows were backfilled by a migration, and `CHECK` constraints make the database refuse anything else. Original finding, kept for the record — found by the e2e suite (spec 0006 M5): inviting `Case-X@Example.com` and later `case-x@example.com` creates **two** `BrunchInvite` rows — two links, two lines in the host's list — for one person. `sendInvites` de-duplicates case-insensitively only within a single batch and against the host's own address; the unique keys (`BrunchInvite[brunchId, invitedEmail]`, `BrunchInviteSuggestion[brunchId, suggestedEmail]`, `User.email`) are exact-string, and the known-user lookups (`user.findFirst({ where: { email } })` in `sendInvites`, `suggestInvitee`, `signInWithProvider`) are too, so a mixed-case invite can also miss an existing account. Needs a decision before a fix — normalize to lowercase at every write/lookup boundary vs. Postgres `citext` — plus a data migration for existing mixed-case rows, so it warrants a short ADR and its own small spec rather than a quick patch. Not yet scheduled.
- **Allow resubmitting a declined suggestion.** `BrunchInviteSuggestion` (spec 0004), `BrunchLocationSuggestion`, and `BrunchTimeSuggestion` (spec 0005) have no soft-delete — once a host declines one, that exact suggestion (same email / place / time) can never be resubmitted by anyone, for that brunch, ever. Raised during spec 0005's senior-architect review pass as a question, not a bug (it's spec 0004's existing, already-shipped behavior, consistently applied to spec 0005's new tables). User decided to fix all three rather than leave spec 0005 behaving differently from spec 0004. Scoped out of the spec 0005 branch because it touches already-shipped spec 0004 code and needs a real decision on resubmission mechanics (insert a fresh row reusing the old one's identity, or reset the existing row back to `pending`) — bigger than a pre-MR polish pass. Needs its own small spec; not yet started.
- Pricing/monetization model (reservations affiliate? premium features? restaurant partnerships?)
- ToS and Privacy Policy (will need before public launch)
- Email digest vs. immediate per-event email
- Onboarding flow for first-time users
- Photo moderation policy (auto-moderation? user reports? both?)
- Friend group privacy model (private only, or eventually shared/collaborative?)
- Recommendations algorithm approach (simple scoring vs. ML-driven, when to invest)
- Storage cost management (photo retention policy, image compression strategy)
- ~~Token encryption strategy~~ — **resolved: application-level**. AES-256-GCM via Node `crypto` or `@noble/ciphers`, key from env var, encrypt/decrypt in `packages/core/src/crypto/` behind an interface. Keeps database portable (Constitution Principle 9). ADR to be written at the OAuth integrations sprint (v2+).
- Whether dish/ingredient lookup tables stay curated or become user-extensible
- Restaurant data shape — `PlaceResult` type (`id`, `name`, `address`, `lat`, `lng`, `priceLevel`, `placeUrl`) to be specced in `packages/core` before the Google Places integration sprint
