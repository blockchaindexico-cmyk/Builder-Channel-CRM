"use client";

import { Mail, Pencil, Phone, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Button } from "@/components/ui/button";
import { actionErrorMessage } from "@/lib/action-result";

import { deleteLeadAction } from "../actions";
import type { LeadStatusRow } from "../server/masters";
import { StatusDialog, type StatusPermissions } from "./status-dialog";

/** Quick actions on the lead page (M04-07). */
export function LeadHeaderActions({
  lead,
  statuses,
  canChangeStatus,
  canUpdate,
  canDelete,
  statusPermissions,
}: {
  lead: {
    id: string;
    number: string;
    mobile: string | null;
    email: string | null;
    status: { id: string; isTerminal: boolean; label: string; color: string };
  };
  statuses: LeadStatusRow[];
  canChangeStatus: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  statusPermissions: StatusPermissions;
}) {
  const router = useRouter();
  return (
    <>
      {lead.mobile ? (
        <Button asChild variant="outline" size="icon" aria-label={`Call ${lead.mobile}`}>
          <a href={`tel:${lead.mobile}`}>
            <Phone />
          </a>
        </Button>
      ) : null}
      {lead.email ? (
        <Button asChild variant="outline" size="icon" aria-label={`E-mail ${lead.email}`}>
          <a href={`mailto:${lead.email}`}>
            <Mail />
          </a>
        </Button>
      ) : null}
      {canUpdate ? (
        <Button asChild variant="outline">
          <Link href={`/leads/${lead.id}/edit`}>
            <Pencil /> Edit
          </Link>
        </Button>
      ) : null}
      {canChangeStatus ? (
        <StatusDialog
          statuses={statuses}
          current={lead.status}
          leadIds={[lead.id]}
          permissions={statusPermissions}
        />
      ) : null}
      {canDelete ? (
        <ConfirmDialog
          trigger={
            <Button
              variant="ghost"
              size="icon"
              aria-label="Delete lead"
              className="text-destructive hover:text-destructive"
            >
              <Trash2 />
            </Button>
          }
          title={`Delete ${lead.number}?`}
          description="Use this for junk or test leads only. The lead disappears from every list; its history stays in the audit log."
          confirmLabel="Delete lead"
          destructive
          onConfirm={async () => {
            const error = actionErrorMessage(await deleteLeadAction({ leadId: lead.id }));
            if (error) {
              toast.error(error);
              return false;
            }
            toast.success(`${lead.number} deleted`);
            router.push("/leads");
          }}
        />
      ) : null}
    </>
  );
}
