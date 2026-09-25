"use client";

import { Power, PowerOff, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { actionErrorMessage } from "@/lib/action-result";

import {
  deleteBuilderAction,
  getBuilderDeactivationImpactAction,
  setBuilderActiveAction,
} from "../../actions";

/** Activate / deactivate / delete a builder (M03-02, M03-11). */
export function BuilderStatusActions({
  builderId,
  name,
  isActive,
  activeProjects,
  totalProjects,
}: {
  builderId: string;
  name: string;
  isActive: boolean;
  activeProjects: number;
  totalProjects: number;
}) {
  const router = useRouter();
  const [includeProjects, setIncludeProjects] = useState(true);
  const [impact, setImpact] = useState<string | null>(null);

  async function loadImpact() {
    const result = await getBuilderDeactivationImpactAction({ builderId });
    const references = result?.data?.references ?? [];
    setImpact(references.map((entry) => `${entry.count} ${entry.label}`).join(", ") || null);
  }

  async function setActive(active: boolean) {
    const result = await setBuilderActiveAction({
      builderId,
      active,
      includeProjects: !active && includeProjects,
    });
    const error = actionErrorMessage(result);
    if (error) {
      toast.error(error);
      return false;
    }
    const cascaded = result?.data?.projectsDeactivated ?? 0;
    toast.success(
      active
        ? `${name} is active again`
        : `${name} deactivated${cascaded ? ` with ${cascaded} project(s)` : ""}`,
    );
    router.refresh();
  }

  async function remove() {
    const error = actionErrorMessage(await deleteBuilderAction({ builderId }));
    if (error) {
      toast.error(error);
      return false;
    }
    toast.success(`${name} deleted`);
    router.push("/builders");
  }

  return (
    <>
      {isActive ? (
        <ConfirmDialog
          trigger={
            <Button variant="outline">
              <PowerOff /> Deactivate
            </Button>
          }
          title={`Deactivate ${name}?`}
          description={
            <span className="space-y-3">
              <span className="block">
                The builder is hidden when adding projects and leads. Existing records, history and
                reports stay unchanged, and you can reactivate at any time.
              </span>
              {impact ? <span className="block font-medium">Linked records: {impact}.</span> : null}
              {activeProjects > 0 ? (
                <span className="flex items-center gap-2 pt-1">
                  <Checkbox
                    id="deactivate-projects"
                    checked={includeProjects}
                    onCheckedChange={(checked) => setIncludeProjects(checked === true)}
                  />
                  <Label htmlFor="deactivate-projects" className="font-normal">
                    Also deactivate its {activeProjects} active project(s)
                  </Label>
                </span>
              ) : null}
            </span>
          }
          confirmLabel="Deactivate"
          destructive
          onConfirm={() => setActive(false)}
          onOpen={() => void loadImpact()}
        />
      ) : (
        <ConfirmDialog
          trigger={
            <Button variant="outline">
              <Power /> Reactivate
            </Button>
          }
          title={`Reactivate ${name}?`}
          description="The builder becomes available for new projects and leads again. Its projects keep their own status."
          confirmLabel="Reactivate"
          onConfirm={() => setActive(true)}
        />
      )}
      {totalProjects === 0 ? (
        <ConfirmDialog
          trigger={
            <Button variant="ghost" className="text-destructive hover:text-destructive">
              <Trash2 /> Delete
            </Button>
          }
          title={`Delete ${name}?`}
          description="Use this only for builders added by mistake. Builders with projects can only be deactivated."
          confirmLabel="Delete builder"
          destructive
          onConfirm={remove}
        />
      ) : null}
    </>
  );
}
