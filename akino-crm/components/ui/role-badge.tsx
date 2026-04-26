import { Badge } from "@/components/ui/badge";
import type { CompanyMemberRole } from "@/lib/types";

export function RoleBadge({ role }: { role: CompanyMemberRole | null | undefined }) {
  if (!role) return null;
  if (role === "manager") {
    return <Badge tone="accent">Manager</Badge>;
  }
  return <Badge tone="neutral">Executive</Badge>;
}
