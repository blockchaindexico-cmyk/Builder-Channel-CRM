"use client";

import { KeyRound, Mail, UserCheck, UserX } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Button } from "@/components/ui/button";
import { actionErrorMessage } from "@/lib/action-result";

import {
  deactivateMemberAction,
  reactivateMemberAction,
  resendInvitationAction,
  sendPasswordResetAction,
} from "../actions";

/** Status actions on the user detail page (M02-12, M02-13). */
export function MemberActions({
  membershipId,
  name,
  status,
  isSelf,
}: {
  membershipId: string;
  name: string;
  status: string;
  isSelf: boolean;
}) {
  const router = useRouter();

  async function run(
    action: (input: { membershipId: string }) => Promise<unknown>,
    success: string,
  ): Promise<boolean> {
    const result = (await action({ membershipId })) as Parameters<typeof actionErrorMessage>[0];
    const error = actionErrorMessage(result);
    if (error) {
      toast.error(error);
      return false;
    }
    toast.success(success);
    router.refresh();
    return true;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {status === "INVITED" ? (
        <Button
          variant="outline"
          onClick={() => void run(resendInvitationAction, `Invitation sent to ${name}`)}
        >
          <Mail /> Resend invitation
        </Button>
      ) : null}
      {status === "ACTIVE" ? (
        <ConfirmDialog
          trigger={
            <Button variant="outline">
              <KeyRound /> Send password reset
            </Button>
          }
          title={`Send a password reset link to ${name}?`}
          description="They receive an e-mail with a link to choose a new password. Their current password keeps working until they do."
          confirmLabel="Send link"
          onConfirm={() => run(sendPasswordResetAction, "Password reset link sent")}
        />
      ) : null}
      {status === "INACTIVE" ? (
        <ConfirmDialog
          trigger={
            <Button variant="outline">
              <UserCheck /> Reactivate
            </Button>
          }
          title={`Reactivate ${name}?`}
          description="They can sign in again with their existing password (or receive a new invitation if they never set one)."
          confirmLabel="Reactivate"
          onConfirm={() => run(reactivateMemberAction, `${name} can sign in again`)}
        />
      ) : !isSelf ? (
        <ConfirmDialog
          trigger={
            <Button variant="outline" className="text-destructive hover:text-destructive">
              <UserX /> Deactivate
            </Button>
          }
          title={`Deactivate ${name}?`}
          description="They are signed out immediately and can no longer sign in. Their records and history stay intact, and you can reactivate them later."
          confirmLabel="Deactivate"
          destructive
          onConfirm={() => run(deactivateMemberAction, `${name} has been deactivated`)}
        />
      ) : null}
    </div>
  );
}
