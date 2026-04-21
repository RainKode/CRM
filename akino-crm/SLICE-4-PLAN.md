# Slice 4 — @mentions, Notes & Notifications

> **Source:** [NEXT-SLICES.md](NEXT-SLICES.md) § "Slice 4 — @mentions, Notes, and Comments"
> **Goal:** light collaboration without building a chat system — rich notes on deals & leads, `@`-mention teammates, and a notification bell in the topbar.
> **Prereqs shipped:** Tasks & scheduled activities (Slice 1), Recycle Bin (Slice 2), Follow-up Queue & Saved Views (Slice 3).

---

## 1. Design decisions

1. **Notes are a first-class entity, not an activity row.**
   The `activities.type = 'note'` enum value exists today and is used by `QuickLogPopover` for ~1-line summaries. Rich notes (multi-paragraph, mentions, future-edit) deserve their own table. Activities stays append-only log; `notes` is editable content.
2. **Timeline unification happens in the view layer.**
   `DealDetail` already builds a `TimelineEvent[]` from activities + the synthetic `created` event (see [pipeline-view.tsx](app/(authenticated)/pipeline/pipeline-view.tsx#L701-L713)). We extend that merge to pull from `notes` too — no schema gymnastics.
3. **Mentions store resolved `user_id`s, not raw handles.**
   `mentions uuid[]` on `notes` keeps lookups cheap and survives profile renames. The rendered `@name` string lives in `body` with a marker like `@[Full Name](user_id)` so the renderer can re-resolve.
4. **Notifications are a single generic table.**
   Start narrow (mention only), but design for `type` extension so Slice 5+ (import results) and Slice 6 (template sends) can reuse it.
5. **Entity polymorphism via `(entity_type, entity_id)`.**
   Same pattern as `tasks.deal_id` / `tasks.lead_id` but more future-proof — a note can target a deal, lead, or (later) a company.
6. **No realtime yet.** Bell polls on mount + after actions via `router.refresh()`. Supabase realtime is a cheap add-on later but out of scope here.

---

## 2. Schema — migration `20260422000001_notes_and_notifications.sql`

```sql
-- =====================================================================
-- Slice 4: notes (rich), notifications (mention-first), helpers
-- =====================================================================

-- 1. notes --------------------------------------------------------------
create table if not exists notes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  entity_type text not null check (entity_type in ('deal', 'lead')),
  entity_id uuid not null,
  body text not null,               -- plain text with @[Name](uuid) markers
  mentions uuid[] not null default '{}',
  author_id uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz           -- soft-delete, consistent with Slice 2
);

create index if not exists idx_notes_entity
  on notes(entity_type, entity_id)
  where deleted_at is null;
create index if not exists idx_notes_company_recent
  on notes(company_id, created_at desc)
  where deleted_at is null;
create index if not exists idx_notes_mentions
  on notes using gin (mentions);

create trigger trg_touch_notes_updated_at
  before update on notes
  for each row execute procedure public.touch_updated_at();  -- reuse helper

alter table notes enable row level security;
create policy notes_company_rls on notes for all
  using  (public.is_member_of_company(company_id))
  with check (public.is_member_of_company(company_id));

-- 2. notifications ------------------------------------------------------
create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,   -- recipient
  type text not null,              -- 'mention' for now
  -- Source link — what to navigate to on click
  entity_type text,                -- 'deal' | 'lead'
  entity_id uuid,
  note_id uuid references notes(id) on delete cascade,
  actor_id uuid references profiles(id) on delete set null,
  body text,                       -- denormalised preview snippet
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_notifications_user_unread
  on notifications(user_id, created_at desc)
  where read_at is null;
create index if not exists idx_notifications_user_recent
  on notifications(user_id, created_at desc);

alter table notifications enable row level security;
create policy notifications_owner_select on notifications for select
  using (user_id = auth.uid());
create policy notifications_owner_update on notifications for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());
-- Insert only via server actions (service role not needed — use
-- security-definer RPC if a policy-gated insert is required).
create policy notifications_insert on notifications for insert
  with check (
    public.is_member_of_company(company_id)
    and actor_id = auth.uid()
  );
```

> **Naming / ordering note:** there is already `20260421000003_email_integration.sql` and `20260421000003_saved_views.sql` sharing a timestamp. Bump to `20260422…` to avoid a third collision.

---

## 3. Server actions — `app/(authenticated)/notes/actions.ts`

All `"use server"`, all scoped by `getActiveCompanyId()`, mirroring `pipeline/actions.ts` conventions.

| Function | Signature | Notes |
|---|---|---|
| `createNote` | `(input: { entity_type, entity_id, body, mentions: string[] }) => Note` | Writes note, then fans out one row into `notifications` per mentioned user (skipping the author). Revalidates the deal/lead path. |
| `updateNote` | `(id, body, mentions) => Note` | Author-only (enforced in action, not RLS). Diff mentions: create notifications for *new* mention targets only. |
| `deleteNote` | `(id) => void` | Sets `deleted_at`; also soft-hides linked notifications (set `read_at = now()`). |
| `getNotesForEntity` | `(entity_type, entity_id) => Note[]` | Timeline consumption. |
| `searchCompanyMembers` | `(query: string) => { user_id, full_name, email, avatar_url }[]` | Drives `@` typeahead. Joins `company_members` → `profiles`, limit 8, `ilike` on name/email. |

New `app/(authenticated)/notifications/actions.ts`:

| Function | Signature |
|---|---|
| `getUnreadNotifications` | `() => Notification[]` (limit 20) |
| `getRecentNotifications` | `() => Notification[]` (limit 50, read + unread) |
| `markNotificationRead` | `(id) => void` |
| `markAllNotificationsRead` | `() => void` |
| `getUnreadCount` | `() => number` |

---

## 4. UI

### 4.1 `NoteComposer` component (`components/notes/note-composer.tsx`)
- Autosizing `<textarea>` with contentEditable-lite `@` handling: on `@`, open floating menu anchored to caret, query `searchCompanyMembers`, ↑/↓/Enter/Esc handling, click-to-select.
- On select, inserts `@[Full Name](user_id)` into the stored body, but **renders** just the highlighted chip in-place using a lightweight regex-based split (no rich-text editor dependency).
- Submit: `⌘/Ctrl + Enter`. Cancel: `Esc`.
- Reused for create + edit.

### 4.2 `NoteCard` (in deal timeline)
- New `TimelineEventType = ActivityType | "created" | "note_rich"` to distinguish from the old 1-line `activity.type = 'note'`.
- Renders author avatar + relative time + mention chips (clickable → future user profile, no-op for now).
- Author sees inline "Edit · Delete".

### 4.3 `DealDetail` wiring ([pipeline-view.tsx](app/(authenticated)/pipeline/pipeline-view.tsx#L750))
- Above timeline: always-visible `NoteComposer` (collapsed 1-line → expand on focus).
- Merge `notes` into the existing `TimelineEvent[]` alongside activities, sorted by `occurred_at` / `created_at`.
- Lead detail (folder page) gets the same composer + merged list when we wire Slice 4b to leads.

### 4.4 Notification bell ([topbar.tsx](components/shell/topbar.tsx#L94-L100))
The placeholder `<Bell>` button already exists. Replace with `<NotificationBell />`:
- Red dot + count badge when `unread > 0`.
- Click → dropdown panel (reuse `useDropdown` pattern from [pipeline-view.tsx](app/(authenticated)/pipeline/pipeline-view.tsx#L20-L32)).
- Rows: actor avatar, "**Alex** mentioned you in **Acme deal**", relative time, preview snippet.
- Click a row → `markNotificationRead(id)` → `router.push('/pipeline?deal=<id>')` (deep-link support already exists via `?deal=` param in pipeline-view).
- Footer: "Mark all as read".
- Fetch strategy: server-rendered initial count passed via shell layout props, then client refetch on `router.refresh()` and after `markAll`.

---

## 5. Types — `lib/types.ts` additions

```ts
export type NoteEntityType = "deal" | "lead";

export type Note = {
  id: string;
  company_id: string;
  entity_type: NoteEntityType;
  entity_id: string;
  body: string;
  mentions: string[];         // user_ids
  author_id: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type NotificationType = "mention";

export type Notification = {
  id: string;
  company_id: string;
  user_id: string;
  type: NotificationType;
  entity_type: NoteEntityType | null;
  entity_id: string | null;
  note_id: string | null;
  actor_id: string | null;
  body: string | null;
  read_at: string | null;
  created_at: string;
};

export type CompanyMemberLite = {
  user_id: string;
  full_name: string | null;
  email: string;
  avatar_url: string | null;
};
```

---

## 6. Cross-cutting

- **Command palette:** add "New note on current deal" action when the deal detail is open (consumes the `?deal=` param).
- **Keyboard:** `N` on a focused deal card / detail → opens composer (respects existing J/K selection from Slice 3).
- **Dashboard:** no new widget this slice — unread count surfaces on the bell only.
- **Email (Phase 3 handshake):** leave a `TODO` comment in `lib/unipile/ingest.ts` — when a reply arrives referencing a deal, fire a `notifications` row of type `'reply'`. Not implemented here.

---

## 7. Acceptance criteria

- [ ] Typing `@` in a note on a deal opens a live member typeahead; selection inserts a chip.
- [ ] Saving a note containing 2 distinct mentions creates exactly 2 notification rows (none for the author even if they @-self).
- [ ] The note appears in the deal timeline merged in correct chronological order with activities.
- [ ] Author can edit & soft-delete their own note; other members cannot.
- [ ] Topbar bell shows unread count, opens a dropdown of recent mentions, click-through scrolls to the mentioned note, and mark-all-read clears the badge.
- [ ] RLS verified: a member of company A cannot read notes or notifications belonging to company B (smoke test via `scripts/` or manual multi-user).
- [ ] `npm run build` passes.

---

## 8. Out of scope (explicit)

- Threaded replies / comments on notes. (Revisit if requested — table already supports it via a self-ref; not needed for first release.)
- Rich text formatting (bold/links/lists). Plain text + mention chips only.
- Mobile push / email delivery of notifications.
- Realtime bell updates.
- Notifications on tasks, stage changes, or assignments. (Mention-only for this slice.)

---

## 9. Suggested build order

1. Migration + types.
2. `searchCompanyMembers` + `NoteComposer` in isolation (Storybook-style: throw it on an existing page).
3. `createNote` + timeline merge in `DealDetail`.
4. Notifications table fan-out on create.
5. `NotificationBell` + topbar swap.
6. Edit/delete + mention diff on update.
7. Extend to lead detail.
8. Command-palette + keyboard.
9. Smoke test + build.
