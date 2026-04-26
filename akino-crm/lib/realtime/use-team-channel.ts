"use client";

import { useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";

export type TeamChannelEvent = {
  table: "deals" | "batches" | "company_members";
  eventType: "INSERT" | "UPDATE" | "DELETE";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  new: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  old: any;
};

/**
 * Subscribe to postgres_changes on the tables that drive the team view.
 * The `companyId` is used to filter at the source (server-side) for `deals`
 * and `company_members`. `batches` has no company_id column, so we filter
 * client-side via the provided onEvent handler if needed.
 *
 * The handler is debounced upstream by callers; this hook just plumbs.
 */
export function useTeamChannel(
  companyId: string | null,
  onEvent: (e: TeamChannelEvent) => void
) {
  const handlerRef = useRef(onEvent);
  useEffect(() => {
    handlerRef.current = onEvent;
  }, [onEvent]);

  useEffect(() => {
    if (!companyId) return;
    const sb = createClient();
    const channel = sb
      .channel(`team:${companyId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "deals",
          filter: `company_id=eq.${companyId}`,
        },
        (payload) =>
          handlerRef.current({
            table: "deals",
            eventType: payload.eventType as TeamChannelEvent["eventType"],
            new: payload.new,
            old: payload.old,
          })
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "batches" },
        (payload) =>
          handlerRef.current({
            table: "batches",
            eventType: payload.eventType as TeamChannelEvent["eventType"],
            new: payload.new,
            old: payload.old,
          })
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "company_members",
          filter: `company_id=eq.${companyId}`,
        },
        (payload) =>
          handlerRef.current({
            table: "company_members",
            eventType: payload.eventType as TeamChannelEvent["eventType"],
            new: payload.new,
            old: payload.old,
          })
      )
      .subscribe();

    return () => {
      sb.removeChannel(channel);
    };
  }, [companyId]);
}
