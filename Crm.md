# Akino CRM — Product Architecture Document

> A lean, no-nonsense B2B outbound CRM built for Akino Studio — handling mass lead import, flexible field configuration, manual enrichment batching, and a hard-working sales pipeline.

**Version:** 1.0
**Date:** April 19, 2026
**Status:** Product Definition Complete — Ready for Technical Planning

---

## 1. Executive Summary

### 1.1 The Problem
Akino Studio does high-volume B2B outbound sales. Generic CRMs like HubSpot or Zoho are bloated with features that don't apply and rigid in how they expect data to be structured. Managing lead lists in spreadsheets, enriching them manually, and tracking outreach across tools creates chaos and loses deals.

### 1.2 The Solution
A purpose-built CRM for Akino's outbound workflow: import raw leads in bulk via CSV, organise them into named folders, define your own data columns (like a spreadsheet but smarter), enrich leads in batches manually, then move qualified leads into a tight sales pipeline with stage tracking, call logs, and follow-up management.

### 1.3 Target Users
Internal Akino Studio team — primarily the founder (RainKode) and any sales or outreach staff added later. Single-organisation tool.

### 1.4 Business Model
Internal tool — no external monetisation. Built to serve Akino's outbound sales operations.

### 1.5 Core Value Proposition
The one thing this must do brilliantly: **let a small outbound team process thousands of raw leads all the way to a closed deal without switching tools.**

---

## 2. User Roles and Permissions

### 2.1 User Types

The CRM is multi-tenant: every user belongs to one or more **companies**, and
roles are scoped to the membership (`company_members.role`), not to the user
globally. A single user can be a Manager in company A and an Executive in
company B.

| Role | Description | Key Abilities |
|------|-------------|---------------|
| Manager | CEO / team lead — auto-assigned to the user that creates the company | Everything an Executive can do, plus: invite/promote/demote members, reassign batches and deals across the team, see the master Team view |
| Executive | Sales executive who actually works batches and deals | View/work all leads, batches and deals in the company; reassign deals they personally own; cannot change roles or bulk-reassign other people's work |

> Authorization model: RLS in Supabase is intentionally flat — any company
> member can read/write company-scoped rows. Manager-only operations are
> gated **app-side** by `requireManager()` (see `lib/auth/roles.ts`), which
> calls the SECURITY DEFINER `is_company_manager` RPC. This keeps the
> policy surface small while still preventing executives from invoking
> manager-only server actions.

### 2.2 Access Control Summary

| Action | Manager | Executive |
|--------|---------|-----------|
| Create / delete lead folders | ✅ | ✅ |
| Define / edit column schema | ✅ | ✅ |
| Upload CSV | ✅ | ✅ |
| View leads / batches / deals | ✅ | ✅ |
| Edit lead fields | ✅ | ✅ |
| Create enrichment batches | ✅ | ✅ |
| Fill enrichment forms | ✅ | ✅ |
| Move pipeline stages | ✅ | ✅ |
| Log calls / emails / notes | ✅ | ✅ |
| Reassign a deal **they own** | ✅ | ✅ |
| Reassign **any** deal in the company | ✅ | ❌ |
| Reassign / bulk-reassign batches (cascades to deals) | ✅ | ❌ |
| Promote / demote members | ✅ | ❌ |
| Access the master `/team` view | ✅ | ✅ (read-only) |

Every company must keep at least one Manager — the last Manager cannot be
demoted. If a legacy company predating roles loads with zero Managers, the
company creator is offered a one-time self-promotion via `bootstrapManager`.

### 2.3 Collaborative Pipelines (master Team view)

The `/team` page is the manager's master view across the whole company.
For every member (and an "Unassigned" bucket) it shows:

- Open / In-closing / Won / Lost deal counts
- Open value, leads owned, batches owned
- Per-stage breakdown across every active pipeline
- Last-activity timestamp

Updates are pushed live via Supabase Realtime (`use-team-channel.ts`)
whenever a deal, batch, or membership changes. Reassignment is two-tiered:

- `reassignDeal(dealId, ownerId)` — owner-self or any manager
- `reassignBatch(batchId, assigneeId, { cascadeDeals: true })` — manager-only;
  cascades the new owner onto every deal whose lead is currently in that
  batch's `batch_leads` (deals whose leads have since moved to a different
  batch are intentionally NOT touched, to preserve historical ownership).

Both writes record `assigned_at` / `assigned_by` for audit.

### 2.4 User Lifecycle
- The first user to create a company is automatically that company's first Manager
- Managers invite team members via the company switcher → "Manage members"
- Departing users keep their historical activity; their `owner_id` references stay intact even after they leave a company (rendered as a "ghost" bucket in `/team`)

---

## 3. Product Modules

---

### 3.1 Lead Folders

**Purpose:** Organise raw lead databases into named containers so different campaigns, industries, or batches stay separate and navigable.

**User Stories:**
- As an Admin, I can create a named lead folder so I can keep my UK agency leads separate from my US ecommerce leads
- As an Admin, I can rename or delete a folder so I can stay organised as campaigns evolve
- As a Sales Rep, I can view the folders I have access to and see how many leads are in each

**Features:**

| Feature | Description | Who Can Use It | Priority |
|---------|-------------|----------------|----------|
| Create folder | Name a new lead folder — like creating a new spreadsheet tab | Admin | P1 |
| Rename folder | Change the folder name at any time | Admin | P1 |
| Delete folder | Delete a folder and all its leads (with confirmation warning) | Admin | P1 |
| Folder list view | See all folders with lead count, date created, and last modified | All | P1 |
| Folder-level field schema | Each folder can have its own column definitions, OR inherit a global schema | Admin | P1 |
| Duplicate folder structure | Copy a folder's column setup to a new empty folder (no leads copied) | Admin | P2 |

**Key Behaviours:**
- Deleting a folder requires typing the folder name to confirm — this is irreversible
- A folder with leads in the pipeline cannot be deleted until those leads are removed from or archived in the pipeline
- Each folder shows a status summary: Total Leads / Enriched / In Pipeline

**Connections to Other Modules:**
- Folders feed into the Enrichment module (pick a folder, create batches)
- Leads in folders can be promoted to the Pipeline module

---

### 3.2 Field Schema Builder

**Purpose:** Let the user define what columns (fields) exist in a lead folder — like setting up a spreadsheet with typed columns — so the CRM adapts to whatever lead data you have rather than forcing a fixed form.

**User Stories:**
- As an Admin, I can define a column called "Company Revenue" as a number type so I can sort leads by size
- As an Admin, I can add a dropdown column called "Industry" with preset options so data stays clean and filterable
- As an Admin, I can reorder columns so the most important ones appear first
- As a Sales Rep, I can see the columns the Admin defined and fill in or filter by them

**Features:**

| Feature | Description | Who Can Use It | Priority |
|---------|-------------|----------------|----------|
| Add column | Create a new column with a name and type | Admin | P1 |
| Column types | Supported types: Text, Number, Email, Phone, URL, Date, Dropdown (with defined options), Checkbox, Multi-select | Admin | P1 |
| Reorder columns | Drag to reorder which column appears where | Admin | P1 |
| Hide/show columns | Toggle columns visible or hidden in the list view without deleting them | Admin + Rep | P1 |
| Rename column | Change a column's display name | Admin | P1 |
| Delete column | Remove a column and all data in it (with confirmation) | Admin | P1 |
| Required fields | Mark a column as required so leads can't be saved without it | Admin | P2 |
| Global schema template | Define a default schema that applies to all new folders unless overridden | Admin | P2 |
| Column-level notes | Add a short description to a column explaining what it's for | Admin | P2 |

**Key Behaviours:**
- Column types enforce data validation — if a column is "Number", you can't type letters in it
- Dropdown columns require the Admin to pre-define the list of options (e.g. Industry: Agency / E-commerce / SaaS / Property)
- If a column is deleted, that data is gone from all leads in the folder — user must confirm
- When a new CSV is uploaded, the system maps CSV headers to defined columns (see Module 3.3)

**Connections to Other Modules:**
- The schema defines what fields appear in the CSV upload mapper
- The schema defines what fields appear in the Enrichment form
- Column types determine what filter and sort options are available in the Lead List View

---

### 3.3 CSV Lead Upload

**Purpose:** Import a bulk list of leads from a CSV file (the kind you'd export from Apollo, LinkedIn Sales Navigator, a scrape, or your own spreadsheet) directly into a lead folder.

**User Stories:**
- As an Admin, I can upload a CSV of 5,000 leads and have them appear in a folder ready to work with
- As a Sales Rep, I can upload a CSV and map the CSV columns to the folder's defined fields so data lands in the right place
- As an Admin, I can see how many rows were imported successfully and how many had errors

**Features:**

| Feature | Description | Who Can Use It | Priority |
|---------|-------------|----------------|----------|
| Upload CSV | Drag-and-drop or file picker for .csv files | Admin + Rep | P1 |
| Column mapping | After upload, system shows CSV headers side-by-side with folder columns — user maps them manually | Admin + Rep | P1 |
| Auto-map | System attempts to automatically match CSV headers to column names where names are similar | System | P1 |
| Skip unmapped columns | Columns in the CSV that don't map to anything are ignored — data isn't lost, it's just not imported | Admin + Rep | P1 |
| Import preview | Before confirming, show a table preview of the first 10 rows as they will appear after mapping | Admin + Rep | P1 |
| Import validation | After import, show a report: X rows imported successfully, Y rows skipped (with reason — e.g. missing required field) | System | P1 |
| Duplicate detection | If a lead with the same email already exists in the folder, flag it and ask: Skip / Overwrite / Import anyway | Admin + Rep | P1 |
| Large file handling | Support imports up to 50,000 rows; files above 10,000 rows process in the background with a notification when done | System | P1 |
| Import history | Log of every CSV upload — filename, date, user, row count, success/fail count | Admin | P2 |
| Re-upload with update | Upload a new CSV to the same folder — any existing leads matched by email are updated rather than duplicated | Admin + Rep | P2 |

**Key Behaviours:**
- CSV files must have a header row
- System accepts comma-separated and semicolon-separated files
- Files are not stored permanently after import — only the lead data is kept
- After import, leads appear in the Lead List View immediately (or within seconds for large files)

**Connections to Other Modules:**
- Imported leads land in the Lead List View of the chosen folder
- The column mapping step references the folder's Field Schema
- Duplicate detection cross-references existing leads in the folder

---

### 3.4 Lead List View

**Purpose:** The main working surface inside a folder — a smart, sortable, filterable table of all leads in that folder, like a live spreadsheet.

**User Stories:**
- As an Admin, I can sort my 2,000 leads by Company Revenue descending so I go after bigger targets first
- As a Sales Rep, I can filter leads by Industry = "Agency" and Status = "Not Contacted" so I know exactly who to call today
- As an Admin, I can click into any lead and see all their information and history

**Features:**

| Feature | Description | Who Can Use It | Priority |
|---------|-------------|----------------|----------|
| Column sort | Click any column header to sort ascending or descending | All | P1 |
| Column filter | Each column header has a filter option appropriate to its type (text search, number range, date range, dropdown select) | All | P1 |
| Multi-filter | Apply multiple filters at once — e.g. Industry = Agency AND Revenue > 500k | All | P1 |
| Saved filters | Save a filter combination as a named view — e.g. "UK Agencies Under 50 Staff" | Admin + Rep | P1 |
| Column resize | Drag column edges to make columns wider or narrower | All | P1 |
| Column show/hide | Toggle columns on or off without deleting them | Admin + Rep | P1 |
| Inline edit | Click a cell to edit it directly in the table without opening the full lead record | Admin + Rep | P1 |
| Lead detail panel | Click a lead row to open a side panel or full page with all fields, enrichment data, notes, and activity history | All | P1 |
| Bulk select | Checkbox on each row to select multiple leads for bulk actions | Admin + Rep | P1 |
| Bulk actions | With leads selected: Move to Pipeline, Add Tag, Delete, Export, Assign to Batch | Admin + Rep | P1 |
| Tags | Add freeform tags to a lead for quick grouping — e.g. "Priority", "Referral", "Re-contact" | Admin + Rep | P1 |
| Lead status | A system-level status column on every lead: Raw / Enriched / In Pipeline / Archived | System | P1 |
| Pagination / infinite scroll | Handle thousands of rows without the page grinding to a halt | System | P1 |
| Export visible leads | Export the current filtered view to CSV | Admin | P2 |
| Search | Full-text search across all fields in the folder | All | P2 |
| Lead notes | A notes field on each lead record for freeform comments — separate from pipeline activity logs | Admin + Rep | P2 |

**Key Behaviours:**
- Filters and sorts are retained while you're in the folder but reset when you leave (unless saved as a named view)
- The Lead Status column is automatically updated by the system — it's not manually edited
- A lead marked as "In Pipeline" shows a link to their pipeline record from the lead detail panel

**Connections to Other Modules:**
- Leads are promoted to the Pipeline via bulk action or from the lead detail panel
- Leads are added to Enrichment Batches from here
- The column structure comes from the Field Schema Builder

---

### 3.5 Enrichment Module

**Purpose:** Take a folder of raw leads and systematically fill in the gaps through manual research — organised into batches so the work is structured, trackable, and not overwhelming.

**User Stories:**
- As an Admin, I can take my 1,000 UK agency leads and split them into batches of 50 for my team to research
- As a Sales Rep, I can open my batch, see each lead, research them online, and fill in a standard enrichment form without leaving the CRM
- As an Admin, I can see at a glance how many leads across all batches have been enriched and how many are still raw

**Features:**

| Feature | Description | Who Can Use It | Priority |
|---------|-------------|----------------|----------|
| Create batch | Select leads from a folder and group them into a named batch | Admin | P1 |
| Batch by number | Automatically divide a folder into batches of X leads (e.g. batches of 100) | Admin | P1 |
| Batch by criteria | Divide leads into batches based on column values — e.g. one batch per Industry | Admin | P1 |
| Assign batch | Assign a batch to a specific team member | Admin | P1 |
| Enrichment form | A configurable form that appears for each lead during enrichment — separate from the main field schema | Admin | P1 |
| Form builder | Admin defines what fields appear on the enrichment form — same field types as the Schema Builder | Admin | P1 |
| One form for all | The enrichment form is the same for all leads in the folder — you fill it in per lead | Admin + Rep | P1 |
| Enrichment queue | Inside a batch, leads appear one at a time (or as a scrollable list) — when you complete one you move to the next | Admin + Rep | P1 |
| Mark as enriched | Button to mark a lead as fully enriched and move to the next | Admin + Rep | P1 |
| Skip lead | Skip a lead within a batch and come back to it later | Admin + Rep | P1 |
| Flag lead | Flag a lead during enrichment — e.g. "can't find info", "company seems closed", "send to pipeline now" | Admin + Rep | P1 |
| Batch progress tracker | See % complete for each batch and for the whole folder | Admin + Rep | P1 |
| Batch status | Batch statuses: Not Started / In Progress / Complete | System | P1 |
| Re-batch | Move unenriched leads from a completed batch into a new batch | Admin | P2 |
| Enrichment notes | Freeform notes field per lead during enrichment | Admin + Rep | P2 |
| Enrich from lead detail | Can also open any individual lead record and fill in the enrichment form without being inside a formal batch | Admin + Rep | P2 |

**Key Behaviours:**
- Enrichment form fields write data back to the lead's record in the main folder — they are not separate data
- Enrichment form can include any fields already defined in the folder schema, plus enrichment-specific fields (these get added to the schema automatically)
- A lead counts as "Enriched" when the user clicks "Mark as Enriched" — not automatically based on field completeness
- Batches can overlap — the same lead cannot be in two active batches simultaneously

**Connections to Other Modules:**
- Enrichment form references and writes to the Field Schema
- Enriched leads can be flagged directly into the Pipeline from the enrichment queue
- Batch assignments connect to the User Roles module

---

### 3.6 Sales Pipeline

**Purpose:** Track real sales conversations from first contact to closed deal — every lead you decide to pursue moves into the pipeline where you manage stages, log calls, track emails, set follow-ups, and keep notes.

**User Stories:**
- As a Sales Rep, I can see all my active deals in a pipeline view and know exactly what stage each one is at
- As an Admin, I can add a lead to the pipeline from a folder or manually, and start working them straight away
- As a Sales Rep, I can log a call I just had with a prospect so there's a permanent record of what was said
- As an Admin, I can see which stage deals are falling out of the pipeline so I can fix the process
- As a Sales Rep, I can set a follow-up reminder on any deal so I don't let it go cold

**Features:**

| Feature | Description | Who Can Use It | Priority |
|---------|-------------|----------------|----------|
| Pipeline stages | Configurable stages — default: New / Contacted / Responded / Meeting Booked / Proposal Sent / Negotiation / Won / Lost | Admin | P1 |
| Add to pipeline from folder | Select leads in the Lead List View and push them to the pipeline in bulk | Admin + Rep | P1 |
| Manual lead add | Add a lead directly into the pipeline without it coming from a folder | Admin + Rep | P1 |
| Kanban board view | Visual columns, one per stage — drag cards between stages | Admin + Rep | P1 |
| List view | Flat table of all pipeline records with columns: Name, Company, Stage, Owner, Last Activity, Follow-up Date | Admin + Rep | P1 |
| Switch views | Toggle between Kanban and List view | Admin + Rep | P1 |
| Pipeline record fields | Each pipeline record has: Contact Name, Company, Email, Phone, LinkedIn URL, Source Folder, Stage, Owner, Notes | System | P1 |
| Move stage | Drag-and-drop in Kanban or dropdown in list/detail view | Admin + Rep | P1 |
| Mark as Won | Move to Won stage — triggers a win log entry | Admin + Rep | P1 |
| Mark as Lost | Move to Lost stage — requires selecting a loss reason from a dropdown | Admin + Rep | P1 |
| Loss reason dropdown | Configurable reasons: No Response / Budget / Wrong Contact / Went with Competitor / Not Interested / Other | Admin | P1 |
| Activity log | Per-deal timeline of all logged activity: calls, emails sent, notes, stage changes | System | P1 |
| Log a call | Record: date, duration, direction (outbound/inbound), outcome, notes | Admin + Rep | P1 |
| Log an email sent | Record: date, subject line (optional), summary, outcome | Admin + Rep | P1 |
| Add a note | Freeform note attached to the deal record — timestamped and attributed | Admin + Rep | P1 |
| Follow-up reminder | Set a date + optional note — appears on dashboard and in notifications | Admin + Rep | P1 |
| Follow-up queue | A dedicated view: all deals with a follow-up due today or overdue, sorted by urgency | Admin + Rep | P1 |
| Stage-change timestamps | System automatically records when a deal moved into each stage | System | P1 |
| Deal owner | Assign a deal to a team member | Admin | P1 |
| Filter pipeline | Filter by: Stage, Owner, Source Folder, Follow-up Date, Date Added | Admin + Rep | P1 |
| Configurable stages | Admin can rename, reorder, add, or archive pipeline stages | Admin | P1 |
| Pipeline search | Search by contact name, company name, or any field | Admin + Rep | P2 |
| Deal value field | Optional field to add a monetary value to each deal — used for pipeline value reporting | Admin + Rep | P2 |
| Email log auto-detection | If integrated with Gmail (Phase 2), emails to/from the contact are automatically pulled into the activity log | System | P3 |
| Multiple pipelines | Create separate pipelines for different service lines or campaigns | Admin | P3 |

**Key Behaviours:**
- A lead can only appear in the pipeline once at a time — if the same email exists in multiple folders and both are pushed to the pipeline, the system warns about the duplicate
- Deals in Won or Lost are removed from the active pipeline view but remain accessible via filter ("Show Closed")
- Stage changes are permanent in the log — you can't pretend a deal didn't go backwards
- Follow-up reminders are visible on the main dashboard and in the notification system
- The pipeline always shows the date of last activity so you can spot deals going cold at a glance

**Connections to Other Modules:**
- Pipeline records link back to the source lead folder and can show enrichment data from that folder
- Follow-up reminders connect to the Notifications system
- Pipeline data feeds the Reporting module

---

### 3.7 Dashboard

**Purpose:** The home screen — give the team an immediate read on what needs attention today and how the overall pipeline is performing.

**User Stories:**
- As a Sales Rep, I open the app and immediately see my follow-ups due today and my pipeline stats
- As an Admin, I can see a summary of all team activity across the whole CRM

**Features:**

| Feature | Description | Who Can Use It | Priority |
|---------|-------------|----------------|----------|
| Today's follow-ups | List of all deals with follow-ups due today or overdue | Admin + Rep (own) | P1 |
| Pipeline summary | Count of deals per stage — e.g. 12 New, 8 Contacted, 4 Responded | Admin + Rep | P1 |
| Recent activity feed | Last 20 activities logged across all deals you own | Admin + Rep | P1 |
| Folder summary | Quick stats for each lead folder: total leads, enriched count, % in pipeline | Admin | P1 |
| Win/Loss summary | This month: X won, Y lost | Admin | P2 |
| Pipeline value | If deal values are set — total value by stage | Admin | P2 |
| Team leaderboard | Activity count per team member this week/month | Admin | P2 |

**Key Behaviours:**
- Admin sees stats for the whole team; Sales Reps see their own stats by default with option to view team
- Dashboard widgets are not configurable in Phase 1 — fixed layout

**Connections to Other Modules:**
- All modules feed data into the Dashboard

---

### 3.8 Notifications

**Purpose:** Make sure no follow-up, no batch assignment, and no important event gets missed.

**Features:**

| Feature | Description | Who Can Use It | Priority |
|---------|-------------|----------------|----------|
| Follow-up due reminder | In-app notification when a follow-up date is reached | Admin + Rep | P1 |
| Overdue follow-up | Escalating reminder for follow-ups past due by 1 day, 3 days, 7 days | System | P1 |
| Batch assigned notification | Notify a rep when they've been assigned an enrichment batch | Admin + Rep | P1 |
| CSV import complete | Notify when a large background import finishes | System | P1 |
| Email notifications | All of the above available as email as well as in-app | All | P2 |
| Notification preferences | Each user can turn off specific notification types | All | P2 |

---

## 4. Cross-Cutting Concerns

### 4.1 Notifications
Covered in Module 3.8. All notifications are in-app in Phase 1; email opt-in in Phase 2.

### 4.2 Search and Filtering
- **Global search** (Phase 2): Search across all folders and pipeline simultaneously
- **Folder-level search**: Full-text search within a folder's lead list
- **Pipeline search**: By contact name, company, email
- **Filters**: Available on every column in Lead List View and on Pipeline views; filter combinations can be saved as named views

### 4.3 File Handling
- **CSV uploads**: Accepted for lead import only; not stored after import
- **File attachments on deals** (Phase 2): Attach files (proposals, contracts) to pipeline records — PDF, DOCX, XLSX up to 10MB per file
- **No image upload** required in Phase 1

### 4.4 Data Import and Export
- **Import**: CSV into lead folders
- **Export**: CSV export of any filtered lead list view; CSV export of pipeline deals (Phase 2)
- **No API integrations in Phase 1** — all data in/out via CSV

### 4.5 Activity History and Audit Trail
- All stage changes in the pipeline are logged with timestamp and user
- All enrichment completions are logged
- All CSV imports are logged
- User-visible activity logs per deal; admin-visible system audit log (Phase 2)
- Retention: all activity history kept indefinitely in Phase 1

### 4.6 Settings and Preferences
- **Admin settings**: Manage users, configure pipeline stages, manage loss reasons, set global field schema defaults
- **User settings**: Change password, notification preferences, timezone (display only — timestamps stored in UTC)
- **Folder settings**: Column schema, enrichment form definition

### 4.7 Onboarding Experience
- Admin account created manually (no public sign-up)
- First-time login shows a setup checklist: Create your first folder → Define your columns → Upload your first CSV
- No sample data — starts blank
- No guided tutorial in Phase 1 — the UI should be self-explanatory

### 4.8 Reporting and Analytics
Phase 1 — basic stats on dashboard only (see Module 3.7)

Phase 2 reporting additions:
- Pipeline conversion rate by stage (what % of deals make it from New to Contacted, etc.)
- Average deal time in each stage
- Activity volume by team member (calls logged, emails logged)
- Win/loss rate over time
- Lead folder completion rates (enrichment progress)
- All reports exportable as CSV

### 4.9 Billing and Subscription
Internal tool — not applicable.

### 4.10 Integrations
Phase 1: None — CSV in/out only.

Phase 2 targets:
- **Gmail integration**: Auto-log emails to/from contacts in the pipeline
- **Google Calendar**: Create calendar events from follow-up reminders

Phase 3 targets:
- **LinkedIn Sales Navigator**: Pull lead data directly into folders
- **Apollo.io / Hunter.io**: Enrich leads with contact data from within the CRM
- **Zapier/Make**: Connect to anything else

### 4.11 Mobile Considerations
Phase 1: Desktop-first, responsive enough to view pipeline on mobile.
Phase 2: Mobile-optimised pipeline view — log a call, move a stage, add a note from your phone.
Full mobile app: Phase 3.

### 4.12 Multi-language and Multi-currency
- Language: English only
- Currency: GBP / USD display for deal values (toggle in settings) — Phase 2

### 4.13 Archiving and Data Retention
- Won/Lost deals are soft-archived — visible via filter, never deleted
- Lead folders can be archived (hidden from main view but not deleted)
- Hard delete of folders is permanent — admin confirmation required
- No legal data retention requirements for an internal sales tool

---

## 5. Edge Cases and Recovery Scenarios

| Scenario | How the System Handles It |
|----------|--------------------------|
| CSV has 50,000 rows — browser freezes | Files over 10k rows process server-side in background; user gets notification when done |
| CSV column headers don't match any defined fields | System presents them for manual mapping; unmapped columns can be skipped — no data lost |
| Two reps enrich the same lead simultaneously | Last save wins; no conflict resolution in Phase 1 — schedule batches to avoid overlap |
| Admin deletes a folder that has leads in the pipeline | System blocks deletion with a warning: "X leads in this folder are active in the pipeline. Remove them first." |
| A lead is uploaded twice (same email) | Duplicate detection flags it: Skip / Overwrite / Import as new |
| A pipeline stage is deleted | Deals in that stage must be manually moved first; stage can't be deleted while active deals are in it |
| Admin accidentally deletes leads in bulk | No undo in Phase 1 — warn clearly before any bulk delete action. Phase 2: 30-day soft delete with restore option |
| Team member leaves | Admin deactivates account; their leads and pipeline records remain, ownership can be reassigned |
| Import file is malformed (wrong separator, missing headers) | System detects and rejects with a plain-English error message before attempting to process |
| Follow-up reminder set for weekend | Reminder fires on the set date — no weekday-only logic in Phase 1 |
| User loses internet mid-enrichment | Form data in current session may be lost — implement auto-save every 30 seconds in Phase 1 |

---

## 6. Market Context

### 6.1 Competitor Overview

| Competitor | What It Does Well | What It Does Badly (for this use case) |
|------------|-------------------|----------------------------------------|
| Zoho CRM | Mature pipeline, lots of integrations | Overcomplicated, rigid field structure, bloated |
| HubSpot | Slick UI, great email tracking | Free tier is limiting; expensive for what Akino needs |
| Apollo.io | Built-in prospecting + CRM | Not designed for custom field structures or enrichment batching |
| Pipedrive | Clean pipeline UI | Weak lead management before pipeline; no custom schemas |
| Notion/Airtable | Fully flexible schemas | No pipeline logic, no enrichment workflow |

### 6.2 Standard Features (Market Baseline)
Things users expect because every CRM has them:
- Contact fields: name, email, phone, company, LinkedIn
- Pipeline stage tracking
- Activity logging (calls, emails, notes)
- Follow-up reminders
- CSV import/export
- Search and filter on lead lists
- Basic dashboard with pipeline counts

### 6.3 Differentiators
What makes Akino CRM different:
- **Fully custom column schemas per folder** — no fixed field structure
- **Enrichment batching workflow** — structured, assignable research batches that no mainstream CRM offers
- **Folder-based lead organisation** — multiple independent lead databases, not one flat contact list
- **Built for volume** — designed from day one for 1,000–50,000 lead imports, not just a few hundred contacts
- **Zero bloat** — no marketing automation, no scoring algorithms, no social media scheduling — just outbound sales

---

## 7. Release Phases

### Phase 1 — Launch (MVP)
The minimum set to run Akino's full outbound workflow end to end.

- Lead Folders (create, rename, delete, archive)
- Field Schema Builder (all column types, reorder, hide/show)
- CSV Upload + column mapping + duplicate detection
- Lead List View (sort, filter, multi-filter, inline edit, bulk select, bulk actions)
- Lead status tracking (Raw / Enriched / In Pipeline / Archived)
- Enrichment Module (create batches by number or criteria, enrichment form builder, enrichment queue, flag + skip)
- Sales Pipeline (configurable stages, Kanban + List view, add from folder or manual, move stages, won/lost with loss reason)
- Activity logging (calls, emails, notes)
- Follow-up reminders + follow-up queue
- Pipeline record detail with full activity timeline
- Dashboard (follow-ups today, pipeline summary by stage, folder stats)
- In-app notifications (follow-up due, batch assigned, import complete)
- User roles (Admin, Sales Rep, Viewer) with invite by email
- Tags on leads

### Phase 2 — Growth
Features that make it competitive and keep the team in the tool.

- Saved filter views per folder
- Re-upload CSV to update existing leads
- Import history log
- Soft delete + 30-day restore for bulk-deleted leads
- Pipeline export to CSV
- Mobile-optimised pipeline view
- Email notifications (all triggers)
- Notification preferences per user
- File attachments on pipeline deals
- Reporting: conversion rates, stage velocity, activity by team member, win/loss over time
- Global search across all folders and pipeline
- Deal value field + pipeline value reporting
- Gmail integration (auto-log emails to pipeline records)
- GBP/USD currency toggle

### Phase 3 — Scale
Features for when Akino is running full-tilt outbound with a full team.

- Multiple pipelines (per service line or campaign)
- Apollo.io / Hunter.io enrichment integration (auto-fill contact data)
- LinkedIn Sales Navigator integration
- Google Calendar sync for follow-ups
- Zapier/Make integration
- Full mobile app
- Advanced reporting (custom date ranges, exportable charts)
- Bulk re-assign deals between team members
- Pipeline stage time limits + alerts (e.g. "this deal has been in Contacted for 14 days")

---

## 8. Open Questions

| # | Question | Why It Matters |
|---|----------|----------------|
| 1 | Should each lead folder have its own independent enrichment form, or is there one global enrichment form for the whole CRM? | Determines how the enrichment form builder is architected |
| 2 | Can a lead exist in multiple folders? Or is each lead unique per folder? | Affects duplicate handling across folders |
| 3 | Is there a limit on the number of users in Phase 1? | Helps scope the user management module |
| 4 | Should the pipeline support deal value tracking from day one, or defer to Phase 2? | Affects dashboard reporting design |
| 5 | When a lead is pushed to the pipeline from a folder, should all their enriched field data come with them and be visible on the pipeline record? Or is the pipeline record separate? | Core architecture decision for the data model |
| 6 | What is the primary device this will be used on day-to-day — desktop at a desk, or on the go? | Affects Phase 1 design and mobile priority |
| 7 | Are enrichment batches strictly sequential (finish batch 1 before starting batch 2) or can multiple batches run in parallel? | Affects batch status logic |

---

## 9. Glossary

| Term | Plain English Meaning |
|------|-----------------------|
| Lead Folder | A named container for a batch of raw lead data — like a spreadsheet file |
| Field Schema | The set of column definitions for a folder — what columns exist, what type of data each holds |
| Column Type | The kind of data a column holds — text, number, dropdown, date, etc. |
| CSV | A simple file format for data tables — you can export it from Excel, Google Sheets, Apollo, LinkedIn, etc. |
| Enrichment | The process of researching raw leads to fill in missing information — finding the right contact name, their email, their job title, etc. |
| Enrichment Batch | A subset of leads from a folder, grouped together for a focused research session |
| Pipeline | The module where you track active sales conversations from first contact to closed deal |
| Pipeline Stage | A step in the sales process — e.g. Contacted, Responded, Meeting Booked |
| Activity Log | A timeline of everything that's happened on a deal — calls logged, emails noted, stage changes |
| Follow-up Reminder | A flag you set on a deal with a date — the system reminds you when it's time to reach back out |
| Kanban View | A visual board where each column is a pipeline stage and each deal is a draggable card |
| Soft Delete | Deleting something but keeping it in the system for 30 days in case you need to restore it |
| Duplicate Detection | The system checking if a lead with the same email already exists before importing |