"use client";

import { Copy, GitMerge } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { useFormatters } from "@/components/shared/regional-settings";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { actionErrorMessage } from "@/lib/action-result";
import { formatPhone } from "@/lib/phone";

import { dismissDuplicateAction, markDuplicateAction, mergeLeadsAction } from "../actions";
import type { LeadSummary } from "../server/duplicates";
import { LeadStatusBadge } from "./badges";

function Side({ title, lead }: { title: string; lead: LeadSummary }) {
  const format = useFormatters();
  return (
    <div className="min-w-0 space-y-1 text-sm">
      <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{title}</p>
      <Link href={`/leads/${lead.id}`} className="font-medium hover:underline">
        {lead.name} <span className="font-mono text-xs text-muted-foreground">{lead.number}</span>
      </Link>
      <p>
        {[lead.mobile ? formatPhone(lead.mobile) : null, lead.email].filter(Boolean).join(" · ") ||
          "—"}
      </p>
      <p className="flex flex-wrap items-center gap-2 text-muted-foreground">
        <LeadStatusBadge label={lead.status.label} color={lead.status.color} />
        {lead.ownerName ?? "Unassigned"} · {lead.sourceName ?? "no source"} ·{" "}
        {format.date(lead.createdAt)}
      </p>
    </div>
  );
}

/** Duplicate review queue (M04-17): keep both, close the new one as a duplicate, or merge it into the original. */
export function DuplicatesQueue({
  rows,
}: {
  rows: { lead: LeadSummary; original: LeadSummary | null }[];
}) {
  const router = useRouter();

  async function run(action: Promise<unknown>, message: string) {
    const error = actionErrorMessage((await action) as Parameters<typeof actionErrorMessage>[0]);
    if (error) {
      toast.error(error);
      return false;
    }
    toast.success(message);
    router.refresh();
  }

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={Copy}
        title="No duplicates to review"
        description="Leads flagged as possible duplicates appear here."
      />
    );
  }
  return (
    <div className="space-y-3">
      {rows.map(({ lead, original }) => (
        <Card key={lead.id}>
          <CardContent className="grid gap-4 lg:grid-cols-[1fr_1fr_auto] lg:items-center">
            <Side title="New lead" lead={lead} />
            {original ? (
              <Side title="Existing lead" lead={original} />
            ) : (
              <p className="text-sm text-muted-foreground">Original not found</p>
            )}
            <div className="flex flex-wrap gap-2 lg:flex-col">
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  void run(
                    dismissDuplicateAction({ leadId: lead.id }),
                    `${lead.number} kept as a separate lead`,
                  )
                }
              >
                Not a duplicate
              </Button>
              {original ? (
                <>
                  <ConfirmDialog
                    trigger={
                      <Button variant="outline" size="sm">
                        Mark as duplicate
                      </Button>
                    }
                    title={`Close ${lead.number} as a duplicate of ${original.number}?`}
                    description="The new lead is set to Invalid / Duplicate and linked to the existing one. Its notes stay on it."
                    confirmLabel="Mark as duplicate"
                    onConfirm={() =>
                      run(
                        markDuplicateAction({ leadId: lead.id, originalId: original.id }),
                        `${lead.number} marked as a duplicate`,
                      )
                    }
                  />
                  <ConfirmDialog
                    trigger={
                      <Button size="sm">
                        <GitMerge /> Merge
                      </Button>
                    }
                    title={`Merge ${lead.number} into ${original.number}?`}
                    description="Notes, attachments, projects of interest and timeline entries move to the existing lead; missing contact details are copied over. The new lead is closed as merged."
                    confirmLabel="Merge leads"
                    onConfirm={() =>
                      run(
                        mergeLeadsAction({ primaryId: original.id, duplicateId: lead.id }),
                        `${lead.number} merged into ${original.number}`,
                      )
                    }
                  />
                </>
              ) : null}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
