// ==========================================================
// Akino CRM — Shared TypeScript types (mirrors schema.sql)
// ==========================================================

// ----- Enums (match Postgres enums) -----
export type UserRole = "admin" | "sales_rep" | "viewer";
export type FieldType =
  | "text"
  | "number"
  | "email"
  | "phone"
  | "url"
  | "date"
  | "dropdown"
  | "checkbox"
  | "multiselect";
export type LeadStatus = "raw" | "enriched" | "in_pipeline" | "archived";
export type BatchStatus = "not_started" | "in_progress" | "complete";
export type ActivityType =
  | "call"
  | "email"
  | "note"
  | "stage_change"
  | "follow_up_set"
  | "won"
  | "lost";
export type CallDirection = "inbound" | "outbound";
export type NotificationType =
  | "follow_up_due"
  | "follow_up_overdue"
  | "batch_assigned"
  | "import_complete"
  | "import_failed";

// ----- Row types -----
export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  role: UserRole;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Folder {
  id: string;
  name: string;
  description: string | null;
  is_archived: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface FolderWithCounts extends Folder {
  lead_count: number;
  enriched_count: number;
  pipeline_count: number;
}

export interface FieldDefinition {
  id: string;
  folder_id: string;
  key: string;
  label: string;
  type: FieldType;
  options: string[] | null;
  is_required: boolean;
  is_hidden: boolean;
  is_enrichment: boolean;
  description: string | null;
  position: number;
  created_at: string;
}

export interface Lead {
  id: string;
  folder_id: string;
  email: string | null;
  name: string | null;
  company: string | null;
  data: Record<string, unknown>;
  status: LeadStatus;
  tags: string[];
  notes: string | null;
  enriched_at: string | null;
  quality_rating: number | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface Batch {
  id: string;
  folder_id: string;
  name: string;
  description: string | null;
  assignee_id: string | null;
  status: BatchStatus;
  created_by: string | null;
  created_at: string;
  completed_at: string | null;
}

export interface BatchLead {
  batch_id: string;
  lead_id: string;
  is_completed: boolean;
  is_skipped: boolean;
  is_flagged: boolean;
  is_disqualified: boolean;
  flag_reason: string | null;
  completed_at: string | null;
  completed_by: string | null;
  added_at: string;
}

export interface PipelineStage {
  id: string;
  name: string;
  pipeline_id: string;
  position: number;
  is_won: boolean;
  is_lost: boolean;
  is_archived: boolean;
  created_at: string;
}

export interface Pipeline {
  id: string;
  name: string;
  description: string | null;
  is_default: boolean;
  is_archived: boolean;
  folder_id: string | null;
  batch_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface LossReason {
  id: string;
  label: string;
  position: number;
  is_archived: boolean;
}

export interface Deal {
  id: string;
  lead_id: string | null;
  source_folder_id: string | null;
  stage_id: string;
  owner_id: string | null;
  contact_name: string;
  company: string | null;
  email: string | null;
  phone: string | null;
  linkedin_url: string | null;
  website: string | null;
  decision_maker: string | null;
  deal_value: number | null;
  currency: string;
  notes: string | null;
  follow_up_at: string | null;
  follow_up_note: string | null;
  last_activity_at: string | null;
  won_at: string | null;
  lost_at: string | null;
  loss_reason_id: string | null;
  stage_entered_at: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface Activity {
  id: string;
  deal_id: string;
  type: ActivityType;
  summary: string | null;
  notes: string | null;
  call_direction: CallDirection | null;
  call_duration_seconds: number | null;
  call_outcome: string | null;
  email_subject: string | null;
  stage_from: string | null;
  stage_to: string | null;
  occurred_at: string;
  created_by: string | null;
  created_at: string;
}

export interface ImportHistory {
  id: string;
  folder_id: string;
  filename: string;
  total_rows: number;
  imported_rows: number;
  skipped_rows: number;
  error_rows: number;
  error_report: unknown | null;
  status: "processing" | "complete" | "failed";
  created_by: string | null;
  created_at: string;
  completed_at: string | null;
}

export interface Notification {
  id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  body: string | null;
  link: string | null;
  is_read: boolean;
  created_at: string;
}
