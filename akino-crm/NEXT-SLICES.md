# Next Slices — Roadmap Plan

> Shipped so far (Slice 1): Tasks entity, scheduled activities backend, inline quick-log popover on deal cards, dashboard Tasks widget, sidebar + command-palette entries.
> Still open from Slice 1: "Add activity" button on Deal Detail + scheduled-activity pill/mark-done in the timeline.

---

## Slice 2 — Finish Deal Detail activity UX + Recycle Bin

**Goal:** close out Slice 1 loose ends and add the most-requested safety net.

1. **Deal Detail: "Add activity" button**
   - Header button in `DealDetail` opens the same `QuickLogPopover`, anchored to the button.
   - Supports call / email / note / meeting + "schedule for later".
2. **Deal Detail: scheduled-activity pills in timeline**
   - Rows with `status === "scheduled"` render a blue "Scheduled · <relative>" pill + "Mark done" button.
   - "Mark done" calls `completeScheduledActivity(id)` → flips status, sets `occurred_at` to now, refreshes.
3. **Recycle Bin (soft-delete) for deals + leads**
   - Add `deleted_at` column to `deals`, `leads` (migration).
   - Replace hard-delete server actions with soft-delete; add `restoreDeal` / `restoreLead` / `purgeDeleted` actions.
   - New `/trash` page with tabs (Deals · Leads), restore + permanent-delete.
   - Sidebar link under Settings or as its own section; 30-day auto-purge via a simple SQL cron or manual "Empty trash".

---

## Slice 3 — Follow-up Queue + Saved Views

**Goal:** make the daily "what do I work on" question instant.

1. **Follow-up Queue page (`/queue`)**
   - Unified inbox of: open tasks (due ≤ today), scheduled activities (due ≤ today), deals with `follow_up_at ≤ today`.
   - One-click "Done" per row (marks the underlying task / activity / clears follow-up).
   - "Snooze 1d / 3d / 1w" dropdown.
   - Dashboard widget: count badge + link to `/queue`.
2. **Saved Views for Pipeline + Folders**
   - New table `saved_views (id, company_id, owner_id, scope, name, filters jsonb, is_shared)`.
   - UI: "Save current view" dropdown on pipeline & folder pages; dropdown to switch between views.
   - Share toggle ("Only me" / "Team").
3. **Keyboard-first polish**
   - `J` / `K` to move selection in tables & kanban; `Enter` to open; `E` to edit.
   - Show current hotkeys in the existing `?` overlay.

---

## Slice 4 — @mentions, Notes, and Comments

**Goal:** light collaboration without a full chat system.

1. **Rich notes on deals + leads**
   - Add `notes` table (`id, company_id, entity_type, entity_id, body, author_id, mentions text[]`).
   - Rendered in the Deal Detail activity timeline alongside existing activities.
2. **@mentions**
   - Typeahead of company members while typing `@`.
   - On save, creates a row in new `notifications` table for each mention.
3. **Notification bell in topbar**
   - Dropdown lists recent unread: "You were mentioned in <deal>".
   - Mark-all-read + click-through.

---

## Slice 5 — Import Safety + Data Hygiene

**Goal:** make bulk operations reversible and de-duped.

1. **Import undo**
   - Store `import_batches` row per CSV upload (already partially there via `logImport`).
   - "Undo last import" button (visible 24h after upload) deletes all leads from that batch.
2. **Dedupe on import**
   - Configurable match keys per folder (email, phone, name+company).
   - Preview screen before commit: "X new, Y updated, Z skipped".
3. **Bulk edit in leads table**
   - Select rows → "Edit field" popover → set one field across selection.

---

## Slice 6 — Email Templates (no send yet)

**Goal:** prep ground for Phase 3 Unipile without blocking on it.

1. **Templates table + CRUD page** (`/settings/templates`)
   - `id, company_id, name, subject, body, variables text[]`.
   - Mustache-style `{{first_name}}`, `{{company}}`, etc.
2. **"Insert template" in Deal Detail**
   - When logging a manual email activity, prefill summary/body from a chosen template.
   - Placeholder substitution pulls from deal + lead fields.
3. **Later (Phase 3):** plug into Unipile `send` — this slice is the groundwork only.

---

## Slice 7 — Pipeline Analytics

**Goal:** first-pass numbers without a full BI surface.

1. **Pipeline summary header**
   - Total deals, total weighted value, avg stage age, conversion rate per stage.
2. **Stage velocity**
   - Compute avg days spent in each stage from `deal_stage_history` (add table if missing).
3. **Win/loss dashboard card**
   - Win rate + top loss reasons (already have `loss_reasons` table).

---

## Phase 3 (separate effort) — Unipile email integration
Deferred per earlier direction. Will slot in after Slice 4 so @mentions + notifications are ready to surface reply events.

---

## Proposed ordering

1. **Slice 2** — finish what's half-done + ship Recycle Bin.
2. **Slice 3** — Follow-up Queue is the biggest daily-value win.
3. **Slice 5** — import safety (prevents data loss).
4. **Slice 4** — mentions + notifications.
5. **Slice 6** — templates groundwork.
6. **Phase 3** — Unipile.
7. **Slice 7** — analytics last (needs enough data).

---

## Conventions to keep

- Every new entity is `company_id`-scoped with RLS via `is_member_of_company(company_id)`.
- Server actions in `app/(authenticated)/<feature>/actions.ts`; `"use server"` files export **only** async functions (constants go in `constants.ts`).
- No arbitrary Tailwind values; use design-system CSS vars (`bg-(--color-surface-2)` etc.).
- Soft-delete over hard-delete where users can realistically lose data.
- New migrations get unique `YYYYMMDDHHmmSS` prefixes — double-check the latest folder before creating.
