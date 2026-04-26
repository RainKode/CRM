"use client";

import { useState, useTransition } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogBody,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { RoleBadge } from "@/components/ui/role-badge";
import {
  setMemberRole,
  type CompanyMemberWithProfile,
} from "../companies/actions";

export function ManageMembersModal({
  open,
  onOpenChange,
  companyId,
  members,
  onChanged,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  companyId: string;
  members: CompanyMemberWithProfile[];
  onChanged: () => void;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const managerCount = members.filter((m) => m.role === "manager").length;

  async function toggleRole(member: CompanyMemberWithProfile) {
    setBusyId(member.user_id);
    setError(null);
    const next = member.role === "manager" ? "executive" : "manager";
    try {
      await setMemberRole(companyId, member.user_id, next);
      startTransition(() => onChanged());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update role.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Manage members</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <p className="text-sm text-(--color-fg-muted) mb-3">
            Promote executives to managers or step a manager down. Every
            company must keep at least one manager.
          </p>
          {error && (
            <div className="mb-3 rounded-md border border-(--color-danger)/40 bg-(--color-danger)/10 p-2 text-xs text-(--color-danger)">
              {error}
            </div>
          )}
          <ul className="space-y-2">
            {members.map((m) => {
              const isLastManager =
                m.role === "manager" && managerCount === 1;
              return (
                <li
                  key={m.user_id}
                  className="flex items-center gap-3 rounded-md border border-(--color-border) bg-(--color-surface-2) p-2.5"
                >
                  <Avatar
                    size="md"
                    userId={m.user_id}
                    name={m.full_name}
                    email={m.email}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <div className="font-semibold truncate">
                        {m.full_name ?? m.email ?? "Member"}
                      </div>
                      <RoleBadge role={m.role} />
                    </div>
                    <div className="text-xs text-(--color-fg-muted) truncate">
                      {m.email}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant={m.role === "manager" ? "outline" : "secondary"}
                    disabled={busyId === m.user_id || isLastManager}
                    onClick={() => toggleRole(m)}
                    title={
                      isLastManager
                        ? "At least one manager is required."
                        : undefined
                    }
                  >
                    {busyId === m.user_id
                      ? "Saving…"
                      : m.role === "manager"
                      ? "Demote"
                      : "Promote to manager"}
                  </Button>
                </li>
              );
            })}
            {members.length === 0 && (
              <li className="text-sm text-(--color-fg-muted)">
                No members in this company.
              </li>
            )}
          </ul>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
