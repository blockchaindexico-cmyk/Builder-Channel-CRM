"use client";

import { Pencil, Power, PowerOff, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { actionErrorMessage } from "@/lib/action-result";

import {
  deleteProjectAction,
  getProjectUsageAction,
  setProjectActiveAction,
  setProjectStatusAction,
} from "../../actions";
import { PROJECT_STATUSES, type ProjectStatusValue } from "../../schemas";

/** Edit, lifecycle status, activation and deletion of a project (M03-05, M03-11). */
export function ProjectActions({
  projectId,
  name,
  status,
  isActive,
  builderActive,
}: {
  projectId: string;
  name: string;
  status: ProjectStatusValue;
  isActive: boolean;
  builderActive: boolean;
}) {
  const router = useRouter();
  const [usage, setUsage] = useState<{ label: string; count: number }[] | null>(null);

  async function changeStatus(next: string) {
    const error = actionErrorMessage(
      await setProjectStatusAction({ projectId, status: next as ProjectStatusValue }),
    );
    if (error) return void toast.error(error);
    toast.success(
      `Status changed to ${PROJECT_STATUSES.find((entry) => entry.value === next)?.label}`,
    );
    router.refresh();
  }

  async function setActive(active: boolean) {
    const error = actionErrorMessage(await setProjectActiveAction({ projectId, active }));
    if (error) {
      toast.error(error);
      return false;
    }
    toast.success(active ? `${name} is active again` : `${name} deactivated`);
    router.refresh();
  }

  async function loadUsage() {
    const result = await getProjectUsageAction({ projectId });
    setUsage(result?.data ?? []);
  }

  async function remove() {
    const error = actionErrorMessage(await deleteProjectAction({ projectId }));
    if (error) {
      toast.error(error);
      return false;
    }
    toast.success(`${name} deleted`);
    router.push("/projects");
  }

  const usageText =
    usage && usage.length > 0
      ? usage.map((entry) => `${entry.count} ${entry.label}`).join(", ")
      : null;

  return (
    <>
      <Select value={status} onValueChange={(value) => void changeStatus(value)}>
        <SelectTrigger className="w-48" aria-label="Project status">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {PROJECT_STATUSES.map((entry) => (
            <SelectItem key={entry.value} value={entry.value}>
              {entry.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button asChild variant="outline">
        <Link href={`/projects/${projectId}/edit`}>
          <Pencil /> Edit
        </Link>
      </Button>
      {isActive ? (
        <ConfirmDialog
          trigger={
            <Button variant="outline">
              <PowerOff /> Deactivate
            </Button>
          }
          title={`Deactivate ${name}?`}
          description={
            <>
              It is hidden from new leads and from the default project list. Leads, history and
              reports keep it.
              {usageText ? (
                <span className="mt-2 block font-medium">Linked records: {usageText}.</span>
              ) : null}
            </>
          }
          confirmLabel="Deactivate"
          destructive
          onOpen={() => void loadUsage()}
          onConfirm={() => setActive(false)}
        />
      ) : (
        <ConfirmDialog
          trigger={
            <Button
              variant="outline"
              disabled={!builderActive}
              title={builderActive ? undefined : "Reactivate the builder first"}
            >
              <Power /> Reactivate
            </Button>
          }
          title={`Reactivate ${name}?`}
          description="The project becomes available for new leads again."
          confirmLabel="Reactivate"
          onConfirm={() => setActive(true)}
        />
      )}
      <ConfirmDialog
        trigger={
          <Button variant="ghost" className="text-destructive hover:text-destructive">
            <Trash2 /> Delete
          </Button>
        }
        title={`Delete ${name}?`}
        description={
          usageText
            ? `It has ${usageText} and cannot be deleted — deactivate it instead.`
            : "Use this only for projects added by mistake. Its documents are removed too."
        }
        confirmLabel="Delete project"
        destructive
        onOpen={() => void loadUsage()}
        onConfirm={remove}
      />
    </>
  );
}
