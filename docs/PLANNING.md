# Brunchsters — Planning Document

**Version:** 1.6
**Last Updated:** May 26, 2026
**Status:** Pre-development planning complete — design reconciliation done, ready for scaffold

> **v1.6 — Design reconciliation (May 26, 2026):** Merged decisions from the Claude Design session (Engineering Handoff v1.1). Changes: v1 scope expanded (rich RSVP states, host transfer, undo-cancel, running late, Google Calendar chip, timezone display, voting auto-close + tie-breaker); `BrunchAttendee` schema extended; `Brunch` schema extended; notification type list updated; token expiry, calendar scope, realtime mechanism, RSVP visibility, and push provider questions resolved. See ADR history for rationale.
>
> **Working with this doc across chats:** This document lives in the project's GitHub repo (`docs/PLANNING.md`) as the single source of truth. When starting a new chat (UI design, code review, etc.), upload or paste this doc to give that chat context. Decisions made in any chat should be committed back to the doc via PR — git history becomes the audit trail of design evolution. Don't rely on Claude's memory across chats; rely on the repo.
>
> **Documentation hierarchy:**
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

| Layer | Decision |
|-------|----------|
| Framework | Next.js + TypeScript |
| State Management | Redux |
| ORM | Prisma |
| Database | PostgreSQL (Supabase) |
| Auth | NextAuth.js (Google + Apple) |
| Realtime | Supabase Realtime (v2) |
| Job Queue | Inngest |
| Email | Resend + React Email |
| Hosting | Vercel + Supabase |
| Maps | Google Maps Places API (abstracted via `PlaceProvider` interface) |

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
- **Brunch already confirmed:** Read-only view, still allow late RSVPs
- **Declined invitee:** Allow them to change mind until confirmed

### Confirmation Lock Rules
After a brunch is confirmed:
- **Locked:** Location, time, planning mode
- **Still editable:** Title, description, invitee list

### Minimum Brunch Size
2 people including host (1-on-1s are valid brunches).

---

## 6. Permissions Model

Host controls per-brunch:
- `allowInviteSuggestions` — can invitees suggest new people?
- `requireHostApprovalToInvite` — must host approve suggestions?
- `allowLocationSuggestions` — can invitees suggest places?
- `allowTimeSuggestions` — can invitees suggest times?

**Defaults:** All permissions ON, host approval required (always safe default).

Stored as fields directly on `Brunch` (not a separate `BrunchSettings` table — premature normalization).

---

## 7. Notifications

Two layers:
- **Real-time in-app** — Supabase Realtime, presence-aware (don't notify someone watching the page)
- **External notifications** — email via Resend. Push deferred to v2; v1 features that conceptually want push (running late, host transfer) use in-app + email instead.

User can configure per-type preferences via `UserNotificationPreference`. Per-brunch mute is a separate UI control (All / Just big stuff / Muted) surfaced on the invitee detail screen.

### Notification Types (v1)
- `rsvp.received` — someone responded to invite
- `vote.cast` — someone voted
- `vote.deadline.approaching` — pre-deadline reminder
- `vote.autoclose.prompted` — ≥66% participation threshold reached, host prompted to close
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

| Tag | Meaning |
|-----|---------|
| `[v1 schema + ui]` | Build table AND feature UI in v1 |
| `[v1 schema only]` | Include in Prisma schema now, UI deferred — enables passive data collection or is referenced by v1 tables |
| `[future schema]` | Don't create table yet — needs infrastructure decisions or UI before it's useful |

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
}

RsvpStatus {
  id, code, label, description, isActive, sortOrder,
  countsAsAttendee, createdAt, updatedAt
  // values: invited, yes, no, maybe
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

  // Permissions (folded in from BrunchSettings)
  allowInviteSuggestions (default true)
  requireHostApprovalToInvite (default true)
  allowLocationSuggestions (default true)
  allowTimeSuggestions (default true)

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

```typescript
BrunchLocation {
  id
  brunchId (FK → Brunch, indexed)
  decisionTypeId (FK → BrunchDecisionType)  // moved from Brunch — per-resource
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
  decisionTypeId (FK → BrunchDecisionType)
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
Use `next-intl` from day one even with English-only content. Avoids painful refactor later if you go international.

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

### Why Inngest, not Kafka
Brunchsters needs job queues, not event streaming. Kafka is overkill for the foreseeable future. Inngest is TypeScript-native, serverless, and integrates beautifully with Next.js.

---

## 11. Google Maps Integration

### Two APIs Used
- **Places API** — autocomplete search + place details
- **Maps JavaScript API** — display maps (optional v1, fine to defer)

### What's Stored
Four fields per location: `placeId`, `placeName`, `placeAddress`, `placeUrl`. Google not called again after place is selected.

### Cost Optimization
Only call Place Details on user selection, not on every keystroke. Autocomplete is cheap (~$2.83/1K), Details is more (~$17/1K). Google's $200/month free credit covers significant usage.

### Provider Abstraction
```typescript
interface PlaceProvider {
  search(query: string): Promise<PlaceResult[]>
  getDetails(placeId: string): Promise<PlaceDetails>
}
```
App talks to interface, never directly to Google. Swap or add (Yelp, Foursquare) later without touching app code.

### API Key Setup
- Two keys: dev and prod
- HTTP referrer restriction (localhost / brunchsters.com)
- API restriction (Places + Maps JS only)
- Stored in `.env.local` (dev) and Vercel env vars (prod)
- `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` prefix for client-side access (referrer restriction protects it)
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

| Item | Tables | Why schema now | Why UI later |
|------|--------|----------------|--------------|
| Group chat | `Message` | Placeholder in UI, structurally complete | Realtime complexity — planning loop valuable on its own |
| Friends & groups | `Friendship`, `FriendGroup`, `FriendGroupMember`, `FriendshipStatus` | Brunch history passively builds social graph | Social features need critical mass of users first |
| Favorite places | `UserFavoritePlace` | Brunch creation can surface placeholder | Not blocking v1 flow |
| Dish & ingredient prefs | `Dish`, `Ingredient`, `UserDishPreference`, `UserIngredientPreference` | Optional onboarding collection from day one | Recommendations engine needs data before UI is valuable |

### Deferred Schema (don't create tables yet)

These have no tables in v1. Infrastructure decisions or UI designs need to be made first.

| Item | Reason for full deferral |
|------|--------------------------|
| Photos + ratings | Needs storage infrastructure + photo moderation policy + post-brunch status activation |
| Calendar integration | OAuth scope + token encryption strategy decisions needed first |
| External sharing | Deep-link only approach for now — no tables needed short term |
| Recommendations engine | No schema until approach decided + enough data exists |
| Bill splitting | Out of brunch-planning scope entirely |
| Mid-brunch features | Out of brunch-planning scope entirely |
| Push notifications | Email sufficient for web v1 |
| `RateLimitLog` | Use Upstash Redis with TTL keys — not a DB table |
| `LegalDocument` / `UserLegalAcceptance` | No legal docs written yet |
| `Role` / `UserRole` tables | Simple `User.role` enum sufficient for v1 |
| Embedded map display | Place details + address sufficient for v1 |
| Yelp / Foursquare | Provider abstraction makes this a clean add later |
| Mobile app | API-first architecture ensures it's possible — build web first |

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

| Service | Programmatic Posting | Workaround |
|---------|---------------------|------------|
| Google Maps reviews | ❌ No public API | Deep-link to review form |
| Yelp reviews | ❌ Partnership only | Deep-link to Yelp |
| Foursquare | ❌ Limited | Deep-link |
| Instagram | ❌ Closed off | Share image to user's device |

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

| Order | Theme | Why this order |
|-------|-------|----------------|
| 1 | **Friends + Friend Groups** | Foundation for everything social. Removes invite friction immediately. |
| 2 | **Calendar Export (.ics)** | Easy win, no OAuth needed, completes the planning loop. |
| 3 | **Favorite Locations** | Builds quickly on existing place data. Reduces brunch creation friction. |
| 4 | **Group Chat (already deferred)** | Best added once social graph exists. |
| 5 | **Photos + Ratings** | Activates `brunching`/`completed` statuses. Requires storage infrastructure. |
| 6 | **Favorite Dishes/Ingredients** | Data collection layer for recommendations. |
| 7 | **Calendar Availability (OAuth)** | Sensitive data, builds on calendar export trust. |
| 8 | **Recommendations Engine** | Needs all the above as input. |
| 9 | **External sharing** | Polish layer once core experience is solid. |
| 10 | **Bill splitting (already deferred)** | Mid-brunch feature, lowest planning-loop value. |

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
2. **Project scaffold** — Next.js + TypeScript + Prisma
3. **Prisma schema** — codify this data model
4. **Seed lookup tables**
5. **Auth** — NextAuth + Google + Apple + UserAuthProvider
6. **Core brunch flow** — create → invite → attendee → vote → confirm
7. **Google Places integration**
8. **Notifications + Inngest**
9. **UI** — host flow, invitee flow, dashboard

### Setup tasks parallel to development
- GitHub repo + branch protection
- CI pipeline (lint, typecheck, test on every PR)
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
- **RSVP visibility** — Host sees all RSVP states and names. Other invitees see aggregate counts only (e.g. "5 yes, 2 maybe, 1 no") — names are hidden on "no" entries. Display-layer rule, no schema impact.
- **Push notification provider** — Deferred to v2 ADR. Candidates: OneSignal (easiest multi-platform) vs. native APNs/FCM. Decide when push scope is specced.

### Still Open
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
