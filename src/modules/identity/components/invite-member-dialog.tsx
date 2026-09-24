"use client";

import { UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

import { type ManagerOption, MemberForm, type RoleOption } from "./member-form";

export function InviteMemberDialog({
  roles,
  managers,
}: {
  roles: RoleOption[];
  managers: ManagerOption[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <UserPlus /> Invite user
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Invite a user</DialogTitle>
          <DialogDescription>
            They receive an e-mail with a link to set their password. The link is valid for 3 days.
          </DialogDescription>
        </DialogHeader>
        <MemberForm
          roles={roles}
          managers={managers}
          onCancel={() => setOpen(false)}
          onDone={({ membershipId }) => {
            setOpen(false);
            router.push(`/settings/users/${membershipId}`);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
