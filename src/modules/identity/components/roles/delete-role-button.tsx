"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Button } from "@/components/ui/button";
import { actionErrorMessage } from "@/lib/action-result";

import { deleteRoleAction } from "../../actions";

export function DeleteRoleButton({
  roleId,
  name,
  memberCount,
}: {
  roleId: string;
  name: string;
  memberCount: number;
}) {
  const router = useRouter();
  return (
    <ConfirmDialog
      trigger={
        <Button variant="outline" className="text-destructive hover:text-destructive">
          <Trash2 /> Delete role
        </Button>
      }
      title={`Delete the role "${name}"?`}
      description={
        memberCount > 0
          ? `${memberCount} user(s) still have this role. Move them to another role first.`
          : "This cannot be undone."
      }
      confirmLabel="Delete"
      destructive
      onConfirm={async () => {
        const error = actionErrorMessage(await deleteRoleAction({ roleId }));
        if (error) {
          toast.error(error);
          return false;
        }
        toast.success(`Role "${name}" deleted`);
        router.push("/settings/roles");
        return true;
      }}
    />
  );
}
