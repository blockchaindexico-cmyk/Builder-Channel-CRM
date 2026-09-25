"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { actionErrorMessage } from "@/lib/action-result";
import { cn } from "@/lib/utils";

import { saveLeadSettingsAction } from "../../actions";
import { DUPLICATE_POLICIES, type DuplicatePolicy } from "../../constants";

/** Duplicate policy (M04-16): how new leads with a known mobile/e-mail are handled. */
export function DuplicatePolicyForm({ value }: { value: DuplicatePolicy }) {
  const router = useRouter();
  const [policy, setPolicy] = useState<DuplicatePolicy>(value);
  const [busy, setBusy] = useState(false);

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle>Duplicate policy</CardTitle>
        <CardDescription>
          A lead is a duplicate when its mobile (or alternate mobile) or e-mail matches an existing
          lead, in any format. Applies to leads entered by hand, imported and received through the
          API.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div role="radiogroup" aria-label="Duplicate policy" className="space-y-2">
          {DUPLICATE_POLICIES.map((option) => (
            <label
              key={option.value}
              className={cn(
                "flex cursor-pointer items-start gap-3 rounded-lg border p-3",
                policy === option.value && "border-primary bg-primary/5",
              )}
            >
              <input
                type="radio"
                name="duplicate-policy"
                value={option.value}
                checked={policy === option.value}
                onChange={() => setPolicy(option.value)}
                className="mt-1 accent-[var(--color-primary)]"
              />
              <span>
                <span className="block text-sm font-medium">
                  {option.label}
                  {option.value === "FLAG" ? (
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      (recommended)
                    </span>
                  ) : null}
                </span>
                <span className="block text-sm text-muted-foreground">{option.description}</span>
              </span>
            </label>
          ))}
        </div>
        <div className="flex justify-end">
          <Button
            disabled={busy || policy === value}
            onClick={async () => {
              setBusy(true);
              const error = actionErrorMessage(
                await saveLeadSettingsAction({ duplicatePolicy: policy }),
              );
              setBusy(false);
              if (error) return void toast.error(error);
              toast.success("Duplicate policy saved");
              router.refresh();
            }}
          >
            Save
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
