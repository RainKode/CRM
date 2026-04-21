# Phase 3 — Unipile Email Integration Plan

> Goal: turn the CRM into the **single window** for sales email. Sending, receiving, threading, tracking, and triaging all happen inside the pipeline. The rep never opens Gmail/Outlook to do CRM work. Every reply becomes a signal that advances (or stalls) a deal.

---

## 1. Guiding Principles

1. **Email lives on the deal, not on the user.** Every message is linked to a deal + lead. The inbox is just a view of deal activity filtered by channel.
2. **Replies move the pipeline.** A reply = automatic activity log + optional auto-advance of stage.
3. **No-reply = a signal too.** "Waiting on them" is a first-class state with automatic follow-up reminders.
4. **One send surface.** Users send from the deal card / deal detail / a global composer. Never leave the CRM.
5. **Unipile is the transport; our DB is the source of truth.** We store every sent + received message so search, filters, and analytics don't depend on Unipile uptime.

---

## 2. Unipile Capabilities We'll Use

From Unipile's Email API (IMAP/Gmail/Outlook/etc. unified):
- **OAuth hosted-auth** → connect a user's Gmail / Outlook / IMAP inbox.
- **Webhooks** → realtime `mail.received`, `mail.sent`, `mail.reply`, `account.disconnected`.
- **Send mail** → with threading (In-Reply-To / References headers), attachments, CC/BCC, HTML body.
- **List / get messages** → for initial backfill and on-demand sync.
- **Mark read / star / archive / trash** → mirror actions from CRM back to mailbox.
- **Tracking pixel + link wrapping** (we self-host) → open + click tracking; Unipile just carries the mail.

Out of scope for Phase 3 (park for later):
- Calendar / meeting scheduling (separate Unipile endpoints).
- Shared team inboxes across providers (we scope 1 mailbox per user first).

---

## 3. Data Model

### New tables

```sql
-- 3.1 Mailbox connections (one row per connected provider account)
email_accounts (
  id uuid pk,
  company_id uuid fk,
  user_id uuid fk,                -- the CRM user who owns this mailbox
  provider text,                  -- 'gmail' | 'outlook' | 'imap'
  email_address text,
  unipile_account_id text unique, -- id returned by Unipile
  status text,                    -- 'connected' | 'disconnected' | 'error'
  last_sync_at timestamptz,
  created_at timestamptz default now()
)

-- 3.2 Threads (conversation = subject + participants)
email_threads (
  id uuid pk,
  company_id uuid fk,
  deal_id uuid fk null,           -- auto-linked or manually linked
  lead_id uuid fk null,
  subject text,
  participants text[],            -- normalized lowercase emails
  last_message_at timestamptz,
  message_count int default 0,
  unread_count int default 0,
  is_waiting_on_them boolean default false,
  awaiting_since timestamptz,     -- set when we send, cleared when they reply
  status text default 'open',     -- 'open' | 'snoozed' | 'done' | 'archived'
  snoozed_until timestamptz null,
  created_at timestamptz default now()
)

-- 3.3 Messages (every send + receive)
email_messages (
  id uuid pk,
  company_id uuid fk,
  thread_id uuid fk,
  unipile_message_id text unique,
  direction text,                 -- 'outbound' | 'inbound'
  from_address text,
  to_addresses text[],
  cc_addresses text[],
  bcc_addresses text[],
  subject text,
  body_text text,
  body_html text,
  sent_at timestamptz,
  received_at timestamptz,
  sent_by_user_id uuid fk null,   -- only for outbound
  sent_from_account_id uuid fk null,
  in_reply_to text,               -- Message-Id header this replies to
  message_id_header text,
  has_attachments boolean default false,
  -- tracking
  opens int default 0,
  first_opened_at timestamptz null,
  clicks int default 0,
  first_clicked_at timestamptz null,
  -- template used (if any)
  template_id uuid fk null,
  -- raw for debugging / future reprocess
  raw_payload jsonb
)

-- 3.4 Attachments (lazy-fetched on click)
email_attachments (
  id uuid pk,
  message_id uuid fk,
  filename text,
  content_type text,
  size_bytes int,
  unipile_attachment_id text,
  storage_path text null          -- populated when user downloads
)

-- 3.5 Tracking events (raw pixel + link hits)
email_tracking_events (
  id uuid pk,
  message_id uuid fk,
  event text,                     -- 'open' | 'click'
  url text null,                  -- for clicks
  user_agent text,
  ip inet,
  occurred_at timestamptz default now()
)

-- 3.6 Templates (already scoped in Slice 6 — extended here)
email_templates (
  id uuid pk,
  company_id uuid fk,
  folder_id uuid null,            -- optional scoping
  name text,
  subject text,
  body_html text,
  variables text[],
  created_by uuid,
  is_shared boolean default true
)

-- 3.7 Sequences (multi-step cadences)
email_sequences (
  id uuid pk,
  company_id uuid fk,
  name text,
  is_active boolean default true,
  created_by uuid
)

email_sequence_steps (
  id uuid pk,
  sequence_id uuid fk,
  position int,
  wait_days int,                  -- wait N days after previous
  template_id uuid fk,
  condition text                  -- 'always' | 'no_reply' | 'no_open'
)

email_sequence_enrollments (
  id uuid pk,
  sequence_id uuid fk,
  deal_id uuid fk,
  lead_id uuid fk null,
  current_step int default 0,
  next_send_at timestamptz,
  status text,                    -- 'active' | 'paused' | 'completed' | 'replied' | 'bounced'
  enrolled_by uuid,
  enrolled_at timestamptz default now()
)
```

### Extensions to existing tables

```sql
-- Activity row gets a pointer to the source message so the timeline can deep-link.
alter table activities add column email_message_id uuid references email_messages(id);

-- Deals get an "email status" derived column we update via triggers.
alter table deals add column email_status text,  -- 'no_contact' | 'awaiting_reply' | 'replied' | 'stale'
                 add column last_inbound_at timestamptz,
                 add column last_outbound_at timestamptz;
```

All new tables are `company_id`-scoped with RLS via `is_member_of_company(company_id)`.

---

## 4. How Linking Works (Email ↔ Deal)

The hardest problem. Strategy in priority order:

1. **Header match**: if `in_reply_to` / `References` points to a `message_id_header` we already stored → attach to that thread's deal.
2. **Participant match**: match `from_address` / `to_addresses` against `leads.email` within the mailbox owner's company → link to that lead → link to the lead's newest open deal.
3. **Subject heuristic** (fallback): if `subject` starts with `Re:` / `Fwd:` and matches a known thread subject from the same participants in the last 90 days → attach.
4. **Unmatched** → inbox goes to an "Unassigned" triage tray. User drags onto a deal to link. That action stores a `thread_link_rule` so future messages in that thread auto-link.

Every auto-link writes an `activities` row (`type='email_received'` or `'email_sent'`) for the timeline.

---

## 5. Sync Architecture

### 5.1 Connect
- Settings page → "Connect mailbox" → opens Unipile hosted auth popup → redirects back with `unipile_account_id` → we store `email_accounts` row.

### 5.2 Initial backfill
- On first connect, enqueue a background job: fetch last 90 days of messages.
- Insert into `email_messages`, group into `email_threads`, try to link each thread to a deal.
- Batched 200 at a time to respect rate limits. Progress shown in Settings.

### 5.3 Realtime (webhooks)
- Single Next.js route handler `POST /api/unipile/webhook` with HMAC verification.
- Dispatches by `event_type`:
  - `mail.received` → upsert message, link to thread, update `deals.email_status`, bump `threads.unread_count`, fire Supabase Realtime broadcast so open CRM tabs update.
  - `mail.sent` → mirror sent items that originated outside CRM (so Gmail web sends still show up).
  - `mail.delivery_failure` → mark bounced + alert user.
  - `account.disconnected` → flip `email_accounts.status`, show banner.

### 5.4 Outgoing sends
- User composes in CRM → we POST to Unipile send endpoint → Unipile returns `message_id`.
- We insert the outbound `email_messages` row immediately (optimistic) with `sent_at = now()`.
- If send fails, row is marked `status='failed'` and the composer reopens with the draft.
- If `track_opens` is on, we inject a 1×1 pixel at `/api/t/open/<msg_id>`. If `track_clicks`, we rewrite `<a href>` to `/api/t/click/<msg_id>?u=<b64>`.

---

## 6. User-Facing Features

### 6.1 Global inbox (`/inbox`)
- Tabs: **Primary** (linked to my deals) · **Unassigned** (needs triage) · **Sent** · **All**.
- Left list: threads with subject, last snippet, relative time, unread dot, "⏳ awaiting 4d" pill.
- Right pane: full thread view with quoted replies collapsed, attachments inline.
- Keyboard: `j`/`k` navigate, `e` archive, `r` reply, `a` reply all, `l` link to deal.

### 6.2 Inline composer inside Deal Detail
- Right-hand drawer tab "Email" next to Activity/Notes.
- Top shows the thread history with the linked lead; bottom is a composer.
- Compose options:
  - **From** picker (if user has multiple accounts).
  - **Template** dropdown → inserts subject + body with `{{first_name}}` etc. auto-filled from deal + lead fields.
  - **Track opens / clicks** toggles (default on).
  - **Schedule send** (store in `email_messages` with `scheduled_send_at`, dispatched by cron).
  - **Snippets** (short reusable blurbs, personal scope).
- Hit send → optimistic append to thread → server action calls Unipile.

### 6.3 Email from the kanban card
- Hover a `DealCard` → the existing "Log" button gets a sibling "Mail" button → opens a mini-composer popover (reuse `QuickLogPopover` shell) pre-filled with the lead's email and most-recent template.
- Zero-click flow for standard follow-ups: pick template → send.

### 6.4 Reply detection → pipeline signal
- When `mail.received` lands on a linked thread:
  1. `deals.email_status` → `'replied'`.
  2. Write `activities` row `type='email_received'`.
  3. Clear `threads.is_waiting_on_them`, clear `awaiting_since`.
  4. Fire "Reply received" toast to the deal owner (Realtime channel).
  5. If deal has `auto_advance_on_reply = true` and current stage is "Emailed" → advance to next stage.

### 6.5 Follow-up queue auto-population
- Any deal with `email_status='awaiting_reply'` + `last_outbound_at < now() - 3d` shows in `/queue` under "Awaiting reply".
- One-click "Bump" button → drops the user into the composer with a "Just checking in…" template.

### 6.6 Pipeline overlays
- Kanban `DealCard` gets:
  - 📬 icon if `email_status='replied'` (green).
  - ⏳ icon if `awaiting_reply` for > 3 days (amber).
  - 💤 icon if `stale` (> 14 days no outbound + no inbound).
- Hovering shows a tiny "Last email: sent 2d ago · opened 3×" tooltip.

### 6.7 Sequences (cadences)
- Settings → Sequences → build N-step cadence with waits + conditions.
- Enroll from:
  - Deal detail ("Add to sequence").
  - Bulk-select deals in pipeline/folder → "Enroll in sequence".
- A cron job (`/api/cron/sequences`) runs every 15min:
  - For each active enrollment where `next_send_at ≤ now()`: render template against deal+lead data, call Unipile send, advance step.
  - On `mail.received` matching an enrolled deal: set `status='replied'`, halt further sends.

### 6.8 Triage tray (Unassigned)
- Inbox tab "Unassigned".
- Drag a thread onto a deal in the pipeline side-panel OR click "Link to deal" → search deals → attach.
- Action stores a linking rule so future messages in that thread auto-link.
- "Create deal from email" shortcut — pre-fills name from sender, company from email domain.

### 6.9 Tracking dashboard per deal
- Deal detail → "Emails" tab shows a table: subject · sent · opened (count + first open) · clicked · replied.
- Per-message click-through to full tracking timeline.

### 6.10 Team / account-level analytics
- `/settings/analytics/email`:
  - Emails sent (per user, per day).
  - Open rate, click rate, reply rate.
  - Avg response time.
  - Best-performing templates by reply rate.

---

## 7. Server Actions Surface

`app/(authenticated)/inbox/actions.ts`
- `listThreads(filter)` · `getThread(id)` · `markRead(threadId)` · `snoozeThread(id, until)` · `archiveThread(id)` · `linkThreadToDeal(threadId, dealId)` · `createDealFromThread(threadId)`.

`app/(authenticated)/deals/email-actions.ts`
- `sendEmail({deal_id, to, cc, subject, html, template_id?, scheduled_send_at?, track_opens, track_clicks})`.
- `scheduleEmail(...)` · `cancelScheduledEmail(id)`.
- `enrollInSequence(deal_id, sequence_id)` · `pauseSequence(enrollment_id)`.

`app/(authenticated)/settings/email/actions.ts`
- `connectMailbox()` (returns Unipile hosted-auth URL) · `disconnectMailbox(id)` · `listAccounts()`.

`app/(authenticated)/settings/templates/actions.ts`
- CRUD for `email_templates`.

`app/(authenticated)/settings/sequences/actions.ts`
- CRUD for `email_sequences` + `steps`.

### Webhook + cron endpoints (route handlers, not server actions)
- `POST /api/unipile/webhook` — HMAC-verified event dispatcher.
- `GET  /api/t/open/:messageId` — 1×1 PNG + record open event.
- `GET  /api/t/click/:messageId` — 302 redirect + record click.
- `POST /api/cron/sequences` — runs every 15 min (Vercel cron).
- `POST /api/cron/scheduled-sends` — runs every 5 min, flushes `scheduled_send_at ≤ now()`.
- `POST /api/cron/email-staleness` — nightly, updates `email_status='stale'` on idle deals.

---

## 8. Security & Privacy

- **Token storage**: Unipile OAuth tokens stay with Unipile; we only store `unipile_account_id`. Zero secrets in our DB.
- **Webhook HMAC**: reject any webhook without matching signature. Secret rotated per environment.
- **Per-row RLS**: `email_messages`, `email_threads`, etc. all behind `is_member_of_company(company_id)`. No cross-tenant leakage.
- **Mailbox scoping**: a user can only see threads whose messages involve their own `email_accounts` OR a lead inside their company. Admins see all.
- **PII in tracking URLs**: never embed lead email in tracking URLs — use opaque `message_id`.
- **Bounces / spam compliance**: unsubscribe link auto-injected in sequence sends. Hard-bounce emails auto-mark `lead.email_status='invalid'` and pull from sequences.

---

## 9. UI/UX Seams

Where emails show up across the app:

| Surface | What the user sees |
|---|---|
| Sidebar | New "Inbox" link with unread badge |
| Dashboard | "Replies today", "Awaiting reply > 3d" widgets |
| Kanban card | Email status icon + hover tooltip |
| Deal detail → Activity timeline | Email rows inline with calls/notes |
| Deal detail → Emails tab | Full thread UI + composer |
| Follow-up queue (`/queue`) | "Awaiting reply" section |
| Lead detail | Email history with this lead |
| Command palette | "Compose email", "Go to inbox" |
| Topbar | Notification bell fires on new inbound to my deal |

---

## 10. Rollout Plan (order of implementation)

**Milestone A — Plumbing (read-only)**
1. Migrations for all tables.
2. Unipile OAuth connect + `/settings/email` page.
3. Initial backfill + thread linking logic.
4. Webhook handler (read path only).
5. Inbox page (list + thread view, read-only).
6. Deal Detail "Emails" tab (read-only).

**Milestone B — Send + track**
7. Inline composer in Deal Detail (send + template insert).
8. Open/click tracking pixels + endpoints.
9. Reply detection → activity log + email_status updates.
10. Kanban card email-status icons.

**Milestone C — Automation**
11. Scheduled sends.
12. Follow-up queue integration.
13. Sequences (tables, builder UI, cron runner).
14. Triage tray + "Create deal from email".

**Milestone D — Insights**
15. Per-deal tracking table.
16. Company-wide email analytics.
17. Template performance leaderboard.

Each milestone ships independently so the CRM keeps working if we pause.

---

## 11. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Unipile rate limits during backfill | Batch + exponential backoff; surface "still syncing" banner |
| Linking false positives (wrong deal) | Confidence score; auto-link only if ≥ 0.9, else "Suggested match" in triage |
| Webhook missed / duplicated | Idempotent upserts keyed on `unipile_message_id`; nightly reconcile job |
| Big inboxes explode DB | Only backfill 90 days by default; older fetched on-demand |
| Tracking pixel blocked by Gmail proxy | Treat opens as best-effort; always rely on replies as primary signal |
| User concerns about tracking | Per-send toggle + per-mailbox default; team setting to disable |
| Provider-specific quirks (Gmail thread-id vs Outlook conversation-id) | Normalize at the webhook boundary; test matrix covering Gmail/Outlook/IMAP |

---

## 12. "Feels Seamless" Test

By the end of Phase 3 the rep's day looks like this:

1. Opens the CRM in the morning.
2. Dashboard shows "7 replies overnight" — clicks, reads them inside the inbox tab, each already linked to the right deal.
3. Drags 3 hot deals to the "Proposal Sent" column → a sequence auto-fires the proposal template.
4. Follow-up queue shows 12 deals awaiting reply > 3d. Bulk-selects → "Send bump template". Done.
5. Gets a toast mid-afternoon: "Acme replied to your proposal". One-click opens the deal, reads, replies from the same window.
6. Never opened Gmail/Outlook.

That's the bar.
