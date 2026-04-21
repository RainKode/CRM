"use client";

import { useState, useTransition, useEffect, useCallback } from "react";
import {
  CheckCircle2,
  Circle,
  Plus,
  Trash2,
  Calendar,
  AlertCircle,
  Clock,
  Inbox,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Task } from "@/lib/types";
import {
  createTask,
  deleteTask,
  getTasks,
  toggleTaskComplete,
  type TaskFilter,
} from "./actions";

const FILTERS: { key: TaskFilter; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { key: "open", label: "All open", icon: Circle },
  { key: "today", label: "Due today", icon: Calendar },
  { key: "overdue", label: "Overdue", icon: AlertCircle },
  { key: "upcoming", label: "This week", icon: Clock },
  { key: "completed", label: "Completed", icon: CheckCircle2 },
];

function formatDue(due: string | null): { text: string; tone: "muted" | "danger" | "warn" } {
  if (!due) return { text: "No due date", tone: "muted" };
  const d = new Date(due);
  const now = new Date();
  const ms = d.getTime() - now.getTime();
  const days = Math.round(ms / 86400000);
  const fmt = d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  if (ms < 0) return { text: `Overdue • ${fmt}`, tone: "danger" };
  if (days === 0) return { text: `Today • ${fmt}`, tone: "warn" };
  if (days === 1) return { text: `Tomorrow • ${fmt}`, tone: "warn" };
  return { text: fmt, tone: "muted" };
}

export function TasksView({ initialTasks }: { initialTasks: Task[] }) {
  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  const [filter, setFilter] = useState<TaskFilter>("open");
  const [newTitle, setNewTitle] = useState("");
  const [newDue, setNewDue] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback((f: TaskFilter) => {
    startTransition(async () => {
      const list = await getTasks(f);
      setTasks(list);
    });
  }, []);

  useEffect(() => {
    refetch(filter);
  }, [filter, refetch]);

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const title = newTitle.trim();
    if (!title) return;
    startTransition(async () => {
      try {
        await createTask({
          title,
          due_at: newDue ? new Date(newDue).toISOString() : null,
        });
        setNewTitle("");
        setNewDue("");
        refetch(filter);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to create task");
      }
    });
  }

  function handleToggle(t: Task) {
    const completing = !t.completed_at;
    // optimistic
    setTasks((prev) =>
      prev.map((x) =>
        x.id === t.id
          ? { ...x, completed_at: completing ? new Date().toISOString() : null }
          : x
      )
    );
    startTransition(async () => {
      try {
        await toggleTaskComplete(t.id, completing);
        // If we're in an "open-only" filter, completed tasks should disappear.
        if (completing && filter !== "all" && filter !== "completed") {
          setTasks((prev) => prev.filter((x) => x.id !== t.id));
        }
      } catch {
        // revert
        setTasks((prev) =>
          prev.map((x) =>
            x.id === t.id ? { ...x, completed_at: t.completed_at } : x
          )
        );
      }
    });
  }

  function handleDelete(id: string) {
    if (!confirm("Delete this task?")) return;
    setTasks((prev) => prev.filter((t) => t.id !== id));
    startTransition(async () => {
      try {
        await deleteTask(id);
      } catch {
        refetch(filter);
      }
    });
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-8 md:px-10 md:py-10 space-y-6">
      <header className="space-y-1">
        <h1 className="text-3xl font-bold tracking-tight text-(--color-fg)">
          Tasks
        </h1>
        <p className="text-sm text-(--color-fg-muted)">
          Standalone to-dos with due dates. Keeps you on top of work that
          isn&apos;t tied to a single deal.
        </p>
      </header>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => {
          const Icon = f.icon;
          const active = filter === f.key;
          return (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={cn(
                "flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors border",
                active
                  ? "bg-(--color-accent) text-(--color-accent-fg) border-(--color-accent)"
                  : "bg-(--color-surface-1) text-(--color-fg-muted) border-(--color-card-border) hover:bg-(--color-surface-2)"
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {f.label}
            </button>
          );
        })}
      </div>

      {/* Composer */}
      <form
        onSubmit={handleCreate}
        className="flex flex-col gap-2 rounded-2xl border-2 border-(--color-card-border) bg-(--color-surface-1) p-4 shadow-(--shadow-card-3d) md:flex-row md:items-end"
      >
        <div className="flex-1 space-y-1">
          <label className="text-[11px] font-bold uppercase tracking-wider text-(--color-fg-subtle)">
            New task
          </label>
          <Input
            placeholder="e.g. Follow up with Acme Corp"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
          />
        </div>
        <div className="space-y-1 md:w-56">
          <label className="text-[11px] font-bold uppercase tracking-wider text-(--color-fg-subtle)">
            Due
          </label>
          <Input
            type="datetime-local"
            value={newDue}
            onChange={(e) => setNewDue(e.target.value)}
          />
        </div>
        <Button type="submit" disabled={isPending || !newTitle.trim()}>
          <Plus className="h-4 w-4" /> Add
        </Button>
      </form>

      {error && (
        <div className="rounded-xl bg-(--color-danger)/10 px-4 py-3 text-xs text-(--color-danger)">
          {error}
        </div>
      )}

      {/* List */}
      {tasks.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-(--color-card-border) bg-(--color-surface-1) py-16 text-center">
          <Inbox className="mx-auto h-8 w-8 text-(--color-fg-subtle)" />
          <div className="mt-3 text-sm font-semibold text-(--color-fg)">
            Nothing here
          </div>
          <div className="mt-1 text-xs text-(--color-fg-muted)">
            {filter === "completed"
              ? "You haven't completed any tasks in this view yet."
              : "Add a task above to get started."}
          </div>
        </div>
      ) : (
        <ul className="space-y-2">
          {tasks.map((t) => {
            const due = formatDue(t.due_at);
            const done = !!t.completed_at;
            return (
              <li
                key={t.id}
                className={cn(
                  "group flex items-start gap-3 rounded-2xl border-2 border-(--color-card-border) bg-(--color-surface-1) px-4 py-3 shadow-(--shadow-card-3d) transition-colors",
                  done && "opacity-60"
                )}
              >
                <button
                  type="button"
                  onClick={() => handleToggle(t)}
                  className="mt-0.5 shrink-0 text-(--color-fg-subtle) hover:text-(--color-accent) transition-colors"
                  aria-label={done ? "Mark incomplete" : "Mark complete"}
                >
                  {done ? (
                    <CheckCircle2 className="h-5 w-5 text-(--color-accent)" />
                  ) : (
                    <Circle className="h-5 w-5" />
                  )}
                </button>
                <div className="flex-1 min-w-0">
                  <div
                    className={cn(
                      "text-sm font-medium text-(--color-fg) wrap-break-word",
                      done && "line-through text-(--color-fg-muted)"
                    )}
                  >
                    {t.title}
                  </div>
                  {t.notes && (
                    <div className="mt-1 text-xs text-(--color-fg-muted) wrap-break-word">
                      {t.notes}
                    </div>
                  )}
                  <div
                    className={cn(
                      "mt-1.5 text-[11px] font-medium",
                      due.tone === "danger" && "text-(--color-danger)",
                      due.tone === "warn" && "text-(--color-accent)",
                      due.tone === "muted" && "text-(--color-fg-subtle)"
                    )}
                  >
                    {due.text}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleDelete(t.id)}
                  className="shrink-0 rounded-lg p-1.5 text-(--color-fg-subtle) opacity-0 group-hover:opacity-100 hover:text-(--color-danger) hover:bg-(--color-danger)/10 transition-all"
                  aria-label="Delete"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
