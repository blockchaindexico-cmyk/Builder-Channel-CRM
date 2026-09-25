"use client";

import { Calculator, Lock, LockOpen, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Button } from "@/components/ui/button";
import { actionErrorMessage } from "@/lib/action-result";

import {
  confirmDealAction,
  ensureDealsAction,
  recalculateDealAction,
  unlockDealAction,
} from "../actions";
import { ReasonDialog } from "./reason-dialog";

/** Creates financials for closed bookings that have none (closed before billing was set up). */
export function EnsureDealsButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        const result = await ensureDealsAction();
        setBusy(false);
        const error = actionErrorMessage(result);
        if (error) return void toast.error(error);
        toast.success(`Created financials for ${result?.data?.created ?? 0} deal(s)`);
        router.refresh();
      }}
    >
      <RefreshCw /> {busy ? "Working…" : "Create them now"}
    </Button>
  );
}

/** Confirm / unlock / recalculate a deal's financials (M09-06). */
export function DealStatusActions({
  dealId,
  status,
  billed,
}: {
  dealId: string;
  status: "DRAFT" | "CONFIRMED" | "CANCELLED";
  billed: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  if (status === "CANCELLED") return null;
  if (status === "CONFIRMED") {
    return (
      <ReasonDialog
        trigger={
          <Button
            variant="outline"
            disabled={billed}
            title={billed ? "Billed on an issued invoice" : undefined}
          >
            <LockOpen /> Unlock
          </Button>
        }
        title="Unlock these financials?"
        description="They become editable again and follow booking changes. The reason is kept in the history."
        confirmLabel="Unlock"
        onConfirm={async (reason) => {
          const error = actionErrorMessage(await unlockDealAction({ dealId, reason }));
          if (error) {
            toast.error(error);
            return false;
          }
          toast.success("Financials unlocked");
          router.refresh();
          return true;
        }}
      />
    );
  }
  return (
    <div className="flex flex-wrap gap-2">
      <Button
        variant="outline"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          const result = await recalculateDealAction({ dealId });
          setBusy(false);
          const error = actionErrorMessage(result);
          if (error) return void toast.error(error);
          toast.success(
            result?.data?.changed ? "Recalculated from the rate cards" : "Nothing changed",
          );
          router.refresh();
        }}
      >
        <Calculator /> Recalculate
      </Button>
      <ConfirmDialog
        trigger={
          <Button>
            <Lock /> Confirm
          </Button>
        }
        title="Confirm these financials?"
        description="They are locked: booking changes no longer alter them, and unlocking needs a reason."
        confirmLabel="Confirm"
        onConfirm={async () => {
          const error = actionErrorMessage(await confirmDealAction({ dealId }));
          if (error) {
            toast.error(error);
            return false;
          }
          toast.success("Financials confirmed");
          router.refresh();
        }}
      />
    </div>
  );
}
