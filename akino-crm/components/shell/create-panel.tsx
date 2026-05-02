"use client";

import { useState, useEffect, useTransition, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  X,
  UserPlus,
  Contact,
  ChevronDown,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import type { Folder, FieldDefinition, PipelineStage } from "@/lib/types";
import { getFolders } from "@/app/(authenticated)/folders/actions";
import { getFieldDefinitions, createLead } from "@/app/(authenticated)/folders/[folderId]/actions";
import {
  getStages,
  createDeal,
  createStage,
  updateStage,
  deleteStage,
} from "@/app/(authenticated)/pipeline/actions";

type Tab = "lead" | "customer";

// ─── Stage Manager (inline) ──────────────────────────────────────────

function StageManager({
  stages,
  onRefresh,
}: {
  stages: PipelineStage[];
  onRefresh: () => void;
}) {
  const [newStageName, setNewStageName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleCreate() {
    if (!newStageName.trim()) return;
    setError(null);
    startTransition(async () => {
      try {
        await createStage(newStageName.trim());
        setNewStageName("");
        onRefresh();
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Failed to create stage");
      }
    });
  }

  function handleUpdate(id: string) {
    if (!editName.trim()) return;
    startTransition(async () => {
      await updateStage(id, { name: editName.trim() });
      setEditingId(null);
      onRefresh();
    });
  }

  function handleDelete(id: string) {
    setError(null);
    startTransition(async () => {
      try {
        await deleteStage(id);
        onRefresh();
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Failed to delete stage");
      }
    });
  }

  const normalStages = stages.filter((s) => !s.is_won && !s.is_lost);
  const terminalStages = stages.filter((s) => s.is_won || s.is_lost);

  return (
    <div className="space-y-3">
      <h4 className="text-xs font-bold uppercase tracking-wider text-(--color-fg-subtle)">
        Pipeline Stages
      </h4>

      <div className="space-y-1.5">
        {normalStages.map((s) => (
          <div
            key={s.id}
            className="flex items-center gap-2 rounded-xl bg-(--color-surface-2) px-3 py-2 text-sm"
          >
            {editingId === s.id ? (
              <>
                <Input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="flex-1 h-8 text-sm"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleUpdate(s.id);
                    if (e.key === "Escape") setEditingId(null);
                  }}
                />
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => handleUpdate(s.id)}
                  disabled={isPending}
                  className="h-7 px-2 text-xs"
                >
                  Save
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setEditingId(null)}
                  className="h-7 px-2 text-xs"
                >
                  ✕
                </Button>
              </>
            ) : (
              <>
                <span className="flex-1 font-medium text-(--color-fg)">
                  {s.name}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setEditingId(s.id);
                    setEditName(s.name);
                  }}
                  className="text-[11px] text-(--color-fg-muted) hover:text-(--color-blue) transition-colors"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(s.id)}
                  disabled={isPending}
                  className="text-[11px] text-(--color-fg-muted) hover:text-(--color-danger) transition-colors"
                >
                  Delete
                </button>
              </>
            )}
          </div>
        ))}

        {/* Terminal stages (won/lost) — not editable or deletable */}
        {terminalStages.map((s) => (
          <div
            key={s.id}
            className="flex items-center gap-2 rounded-xl bg-(--color-surface-2) px-3 py-2 text-sm opacity-60"
          >
            <span className="flex-1 font-medium text-(--color-fg)">
              {s.name}
            </span>
            <span className="text-[10px] text-(--color-fg-subtle) uppercase tracking-wider">
              {s.is_won ? "Won" : "Lost"}
            </span>
          </div>
        ))}
      </div>

      {/* Add new stage */}
      <div className="flex gap-2">
        <Input
          placeholder="New stage name…"
          value={newStageName}
          onChange={(e) => setNewStageName(e.target.value)}
          className="flex-1 h-9 text-sm"
          onKeyDown={(e) => {
            if (e.key === "Enter") handleCreate();
          }}
        />
        <Button
          size="sm"
          onClick={handleCreate}
          disabled={isPending || !newStageName.trim()}
        >
          {isPending ? "…" : "Add"}
        </Button>
      </div>

      {error && (
        <p className="text-xs text-(--color-danger) bg-(--color-danger)/10 rounded-lg px-3 py-2">
          {error}
        </p>
      )}
    </div>
  );
}

// ─── Create Lead Form ────────────────────────────────────────────────

function CreateLeadForm({ onSuccess }: { onSuccess: () => void }) {
  const router = useRouter();
  const [folders, setFolders] = useState<Folder[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState("");
  const [fields, setFields] = useState<FieldDefinition[]>([]);
  const [loadingFolders, setLoadingFolders] = useState(true);
  const [loadingFields, setLoadingFields] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  // Load folders on mount
  useEffect(() => {
    getFolders().then((f) => {
      setFolders(f);
      setLoadingFolders(false);
    });
  }, []);

  // Load fields when folder changes
  const loadFields = useCallback(async (folderId: string) => {
    if (!folderId) {
      setFields([]);
      return;
    }
    setLoadingFields(true);
    const defs = await getFieldDefinitions(folderId);
    setFields(defs);
    setFormData({});
    setLoadingFields(false);
  }, []);

  useEffect(() => {
    if (selectedFolderId) loadFields(selectedFolderId);
  }, [selectedFolderId, loadFields]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    // Validate: must have email or phone in data
    const hasEmail =
      formData["email"]?.trim() ||
      fields.some(
        (f) =>
          (f.type === "email" || f.key.includes("email")) &&
          formData[f.key]?.trim()
      );
    const hasPhone =
      fields.some(
        (f) =>
          (f.type === "phone" || f.key.includes("phone")) &&
          formData[f.key]?.trim()
      );

    if (!hasEmail && !hasPhone) {
      setError("Either an email or phone number is required.");
      return;
    }

    // Validate required fields
    for (const field of fields) {
      if (field.is_required && !formData[field.key]?.trim()) {
        setError(`"${field.label}" is required.`);
        return;
      }
    }

    // Build data object from custom fields
    const data: Record<string, unknown> = {};
    for (const field of fields) {
      const val = formData[field.key]?.trim();
      if (val) {
        data[field.key] = field.type === "number" ? Number(val) : val;
      }
    }

    // Extract top-level lead fields
    const nameVal = formData["_name"]?.trim() || undefined;
    const emailVal = formData["email"]?.trim() || formData["_email"]?.trim() || undefined;
    const companyVal = formData["_company"]?.trim() || undefined;

    startTransition(async () => {
      try {
        await createLead(selectedFolderId, {
          name: nameVal,
          email: emailVal,
          company: companyVal,
          data,
        });
        router.refresh();
        onSuccess();
      } catch (err: unknown) {
        setError(
          err instanceof Error ? err.message : "Failed to create lead"
        );
      }
    });
  }

  if (loadingFolders) {
    return (
      <div className="flex items-center justify-center py-12 text-(--color-fg-muted) text-sm">
        <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading folders…
      </div>
    );
  }

  if (folders.length === 0) {
    return (
      <div className="text-center py-12 text-(--color-fg-muted) text-sm">
        <p>No folders yet. Create a Data Batch first.</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Folder Selector */}
      <div className="space-y-2">
        <Label>Select Folder</Label>
        <div className="relative">
          <select
            value={selectedFolderId}
            onChange={(e) => setSelectedFolderId(e.target.value)}
            className="h-10 w-full rounded-xl border-0 bg-(--color-surface-2) px-4 pr-10 text-sm text-(--color-fg) focus:ring-1 focus:ring-(--color-blue) focus:outline-none appearance-none cursor-pointer"
          >
            <option value="">Choose a folder…</option>
            {folders.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-(--color-fg-subtle) pointer-events-none" />
        </div>
      </div>

      {/* Dynamic Fields */}
      {selectedFolderId && !loadingFields && (
        <>
          {/* Core fields */}
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input
                placeholder="Lead name"
                value={formData["_name"] ?? ""}
                onChange={(e) =>
                  setFormData((p) => ({ ...p, _name: e.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input
                type="email"
                placeholder="lead@example.com"
                value={formData["_email"] ?? ""}
                onChange={(e) =>
                  setFormData((p) => ({ ...p, _email: e.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Company</Label>
              <Input
                placeholder="Company name"
                value={formData["_company"] ?? ""}
                onChange={(e) =>
                  setFormData((p) => ({ ...p, _company: e.target.value }))
                }
              />
            </div>
          </div>

          {/* Custom fields from field definitions */}
          {fields.length > 0 && (
            <div className="space-y-3 border-t border-(--color-border) pt-4">
              <h4 className="text-xs font-bold uppercase tracking-wider text-(--color-fg-subtle)">
                Folder Fields
              </h4>
              {fields.map((field) => (
                <div key={field.id} className="space-y-2">
                  <Label>
                    {field.label}
                    {field.is_required && (
                      <span className="text-(--color-blue) ml-1">*</span>
                    )}
                  </Label>
                  {field.type === "dropdown" && field.options ? (
                    <div className="relative">
                      <select
                        value={formData[field.key] ?? ""}
                        onChange={(e) =>
                          setFormData((p) => ({
                            ...p,
                            [field.key]: e.target.value,
                          }))
                        }
                        className="h-10 w-full rounded-xl border-0 bg-(--color-surface-2) px-4 pr-10 text-sm text-(--color-fg) focus:ring-1 focus:ring-(--color-blue) focus:outline-none appearance-none cursor-pointer"
                      >
                        <option value="">Select…</option>
                        {field.options.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-(--color-fg-subtle) pointer-events-none" />
                    </div>
                  ) : field.type === "checkbox" ? (
                    <label className="flex items-center gap-2 text-sm text-(--color-fg-muted) cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData[field.key] === "true"}
                        onChange={(e) =>
                          setFormData((p) => ({
                            ...p,
                            [field.key]: e.target.checked ? "true" : "false",
                          }))
                        }
                        className="accent-(--color-accent)"
                      />
                      {field.label}
                    </label>
                  ) : (
                    <Input
                      type={
                        field.type === "number"
                          ? "number"
                          : field.type === "email"
                          ? "email"
                          : field.type === "phone"
                          ? "tel"
                          : field.type === "url"
                          ? "url"
                          : field.type === "date"
                          ? "date"
                          : "text"
                      }
                      placeholder={field.description || field.label}
                      value={formData[field.key] ?? ""}
                      onChange={(e) =>
                        setFormData((p) => ({
                          ...p,
                          [field.key]: e.target.value,
                        }))
                      }
                    />
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {loadingFields && (
        <div className="flex items-center justify-center py-8 text-(--color-fg-muted) text-sm">
          <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading fields…
        </div>
      )}

      {error && (
        <p className="text-xs text-(--color-danger) bg-(--color-danger)/10 rounded-xl px-4 py-3">
          {error}
        </p>
      )}

      <Button
        type="submit"
        className="w-full"
        disabled={isPending || !selectedFolderId}
      >
        {isPending ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" /> Creating…
          </>
        ) : (
          <>
            <UserPlus className="h-4 w-4" /> Create Lead
          </>
        )}
      </Button>
    </form>
  );
}

// ─── Create Customer/Deal Form ───────────────────────────────────────

function CreateCustomerForm({ onSuccess }: { onSuccess: () => void }) {
  const router = useRouter();
  const [stages, setStages] = useState<PipelineStage[]>([]);
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();
  const [showStageManager, setShowStageManager] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [company, setCompany] = useState("");
  const [stageId, setStageId] = useState("");

  const loadStages = useCallback(async () => {
    const s = await getStages();
    setStages(s);
    if (!stageId && s.length > 0) {
      const first = s.find((st) => !st.is_won && !st.is_lost);
      if (first) setStageId(first.id);
    }
    setLoading(false);
  }, [stageId]);

  useEffect(() => {
    loadStages();
  }, [loadStages]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError("Contact name is required.");
      return;
    }
    if (!email.trim() && !phone.trim()) {
      setError("Both email and phone are required for customers.");
      return;
    }
    if (!email.trim()) {
      setError("Email is required.");
      return;
    }
    if (!phone.trim()) {
      setError("Phone number is required.");
      return;
    }

    startTransition(async () => {
      try {
        await createDeal({
          contact_name: name.trim(),
          company: company.trim() || undefined,
          email: email.trim(),
          phone: phone.trim(),
          stage_id: stageId,
        });
        router.refresh();
        onSuccess();
      } catch (err: unknown) {
        setError(
          err instanceof Error ? err.message : "Failed to create customer"
        );
      }
    });
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-(--color-fg-muted) text-sm">
        <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading…
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label>
            Contact Name <span className="text-(--color-blue)">*</span>
          </Label>
          <Input
            placeholder="Full name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        </div>
        <div className="space-y-2">
          <Label>
            Email <span className="text-(--color-blue)">*</span>
          </Label>
          <Input
            type="email"
            placeholder="customer@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label>
            Phone <span className="text-(--color-blue)">*</span>
          </Label>
          <Input
            type="tel"
            placeholder="+44 7700 900000"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label>Company</Label>
          <Input
            placeholder="Company name"
            value={company}
            onChange={(e) => setCompany(e.target.value)}
          />
        </div>

        {/* Stage selector */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Stage</Label>
            <button
              type="button"
              onClick={() => setShowStageManager(!showStageManager)}
              className="text-[11px] text-(--color-blue) hover:underline"
            >
              {showStageManager ? "Hide" : "Manage Stages"}
            </button>
          </div>
          <div className="relative">
            <select
              value={stageId}
              onChange={(e) => setStageId(e.target.value)}
              className="h-10 w-full rounded-xl border-0 bg-(--color-surface-2) px-4 pr-10 text-sm text-(--color-fg) focus:ring-1 focus:ring-(--color-blue) focus:outline-none appearance-none cursor-pointer"
            >
              {stages
                .filter((s) => !s.is_won && !s.is_lost)
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-(--color-fg-subtle) pointer-events-none" />
          </div>
        </div>

        {error && (
          <p className="text-xs text-(--color-danger) bg-(--color-danger)/10 rounded-xl px-4 py-3">
            {error}
          </p>
        )}

        <Button
          type="submit"
          className="w-full"
          disabled={isPending || !name.trim()}
        >
          {isPending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Creating…
            </>
          ) : (
            <>
              <Contact className="h-4 w-4" /> Create Customer
            </>
          )}
        </Button>
      </form>

      {/* Stage Manager */}
      {showStageManager && (
        <div className="border-t border-(--color-border) pt-4">
          <StageManager stages={stages} onRefresh={loadStages} />
        </div>
      )}
    </div>
  );
}

// ─── Main Create Panel ───────────────────────────────────────────────

export function CreatePanel({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<Tab>("lead");

  // Reset tab when reopened
  useEffect(() => {
    if (open) setTab("lead");
  }, [open]);

  return (
    <>
      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[2px]"
          onClick={onClose}
        />
      )}

      {/* Panel */}
      <div
        className={cn(
          "fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-(--color-border) bg-(--color-bg) transition-transform duration-300 ease-out",
          open ? "translate-x-0" : "translate-x-full"
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-(--color-border)">
          <h2 className="text-xl font-bold text-(--color-fg) tracking-tight">
            Create New
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full h-8 w-8 flex items-center justify-center text-(--color-fg-muted) hover:bg-(--color-surface-3) transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 px-6 py-4">
          {(
            [
              { key: "lead", label: "Lead", Icon: UserPlus },
              { key: "customer", label: "Customer", Icon: Contact },
            ] as const
          ).map(({ key, label, Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={cn(
                "flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-bold transition-colors duration-200",
                tab === key
                  ? "bg-(--color-fg) text-white"
                  : "bg-(--color-surface-2) text-(--color-fg-muted) hover:bg-(--color-surface-3)"
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 pb-6">
          {tab === "lead" ? (
            <CreateLeadForm onSuccess={onClose} />
          ) : (
            <CreateCustomerForm onSuccess={onClose} />
          )}
        </div>
      </div>
    </>
  );
}
