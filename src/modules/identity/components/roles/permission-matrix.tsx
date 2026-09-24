"use client";

import { Lock } from "lucide-react";
import { useAction } from "next-safe-action/hooks";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { actionErrorMessage } from "@/lib/action-result";
import { cn } from "@/lib/utils";

import { setRolePermissionsAction } from "../../actions";
import { SCOPE_OPTIONS, type ScopeValue } from "./scope-labels";

export interface PermissionOption {
  key: string;
  label: string;
  description?: string;
  group: string;
  scoped: boolean;
}

type Grants = Record<string, ScopeValue | null>;

function toGrants(grants: { permission: string; scope: ScopeValue | null }[]): Grants {
  return Object.fromEntries(grants.map((grant) => [grant.permission, grant.scope]));
}

/**
 * Permission matrix for one role (M02-09): tick what the role may do and, for record-level permissions,
 * whose records (Own / Team / Everyone). The Admin role is shown read-only.
 */
export function PermissionMatrix({
  roleId,
  permissions,
  initialGrants,
  locked,
}: {
  roleId: string;
  permissions: PermissionOption[];
  initialGrants: { permission: string; scope: ScopeValue | null }[];
  locked: boolean;
}) {
  const [saved, setSaved] = useState<Grants>(() => toGrants(initialGrants));
  const [grants, setGrants] = useState<Grants>(saved);
  const { executeAsync, isPending } = useAction(setRolePermissionsAction);

  const groups = useMemo(() => {
    const map = new Map<string, PermissionOption[]>();
    for (const permission of permissions) {
      map.set(permission.group, [...(map.get(permission.group) ?? []), permission]);
    }
    return [...map.entries()];
  }, [permissions]);

  const dirty =
    JSON.stringify(Object.entries(grants).sort()) !== JSON.stringify(Object.entries(saved).sort());

  const toggle = (permission: PermissionOption, checked: boolean) =>
    setGrants((current) => {
      const next = { ...current };
      if (checked) next[permission.key] = permission.scoped ? "OWN" : null;
      else delete next[permission.key];
      return next;
    });

  const save = async () => {
    const result = await executeAsync({
      roleId,
      grants: Object.entries(grants).map(([permission, scope]) => ({ permission, scope })),
    });
    const error = actionErrorMessage(result);
    if (error) return void toast.error(error);
    setSaved(grants);
    toast.success(
      result?.data?.changed ? `Saved ${result.data.changed} change(s)` : "No changes to save",
    );
  };

  return (
    <div className="space-y-4">
      {locked ? (
        <div className="flex items-start gap-3 rounded-lg border bg-muted/40 p-4 text-sm">
          <Lock className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <p>
            The Admin role always has every permission on all records, so an organization can never
            lock itself out. Create a custom role for restricted administrators.
          </p>
        </div>
      ) : null}
      <p className="text-sm text-muted-foreground">
        For record-level permissions, choose whose records the role can reach:{" "}
        {SCOPE_OPTIONS.map((option, index) => (
          <span key={option.value}>
            <strong className="font-medium text-foreground">{option.label}</strong> —{" "}
            {option.description}
            {index < SCOPE_OPTIONS.length - 1 ? "; " : "."}
          </span>
        ))}
      </p>
      {groups.map(([group, items]) => (
        <Card key={group} className="gap-0 py-0">
          <CardHeader className="border-b py-4">
            <CardTitle className="text-base">{group}</CardTitle>
            <CardDescription>
              {items.filter((item) => locked || item.key in grants).length} of {items.length}{" "}
              granted
            </CardDescription>
          </CardHeader>
          <CardContent className="divide-y px-0">
            {items.map((permission) => {
              const granted = locked || permission.key in grants;
              const scope = locked ? "ALL" : grants[permission.key];
              const id = `perm-${permission.key}`;
              return (
                <div
                  key={permission.key}
                  className={cn(
                    "flex flex-col gap-3 px-6 py-3 sm:flex-row sm:items-center sm:justify-between",
                    !granted && "text-muted-foreground",
                  )}
                >
                  <label htmlFor={id} className="flex min-w-0 cursor-pointer items-start gap-3">
                    <Checkbox
                      id={id}
                      className="mt-0.5"
                      checked={granted}
                      disabled={locked}
                      onCheckedChange={(checked) => toggle(permission, checked === true)}
                    />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-foreground">
                        {permission.label}
                      </span>
                      {permission.description ? (
                        <span className="block text-xs text-muted-foreground">
                          {permission.description}
                        </span>
                      ) : null}
                      <span className="block font-mono text-[11px] text-muted-foreground/80">
                        {permission.key}
                      </span>
                    </span>
                  </label>
                  {permission.scoped ? (
                    <Select
                      value={scope ?? "OWN"}
                      disabled={locked || !granted}
                      onValueChange={(value) =>
                        setGrants((current) => ({
                          ...current,
                          [permission.key]: value as ScopeValue,
                        }))
                      }
                    >
                      <SelectTrigger
                        size="sm"
                        className="w-40 shrink-0 sm:ml-4"
                        aria-label={`${permission.label}: records`}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent align="end">
                        {SCOPE_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : granted ? (
                    <Badge variant="muted" className="shrink-0 sm:ml-4">
                      Allowed
                    </Badge>
                  ) : null}
                </div>
              );
            })}
          </CardContent>
        </Card>
      ))}
      {!locked ? (
        <div className="sticky bottom-0 -mx-1 flex items-center justify-end gap-2 border-t bg-background/95 px-1 py-3 backdrop-blur">
          {dirty ? (
            <span className="mr-auto text-sm text-muted-foreground">You have unsaved changes</span>
          ) : null}
          <Button variant="ghost" disabled={!dirty || isPending} onClick={() => setGrants(saved)}>
            Discard
          </Button>
          <Button disabled={!dirty || isPending} onClick={() => void save()}>
            Save permissions
          </Button>
        </div>
      ) : null}
    </div>
  );
}
