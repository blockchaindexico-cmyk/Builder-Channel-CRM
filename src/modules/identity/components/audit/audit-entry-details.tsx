"use client";

import { useFormatters } from "@/components/shared/regional-settings";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

import type { AuditLogRow } from "../../server/audit-log";
import { AuditChanges } from "./audit-changes";

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-3 gap-2 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="col-span-2 break-words">{children}</dd>
    </div>
  );
}

/** Side sheet with everything recorded for one audit entry. */
export function AuditEntryDetails({
  entry,
  onOpenChange,
}: {
  entry: AuditLogRow | null;
  onOpenChange: (open: boolean) => void;
}) {
  const format = useFormatters();
  return (
    <Sheet open={entry !== null} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        {entry ? (
          <>
            <SheetHeader>
              <SheetTitle>{entry.summary ?? entry.action}</SheetTitle>
              <SheetDescription>{format.dateTime(entry.createdAt)}</SheetDescription>
            </SheetHeader>
            <div className="space-y-6 px-4 pb-6">
              <dl className="space-y-2">
                <Detail label="Performed by">
                  {entry.actorName ?? "—"}{" "}
                  <span className="text-muted-foreground">({entry.actorType.toLowerCase()})</span>
                </Detail>
                <Detail label="Action">
                  <Badge variant="secondary" className="font-mono">
                    {entry.action}
                  </Badge>
                </Detail>
                <Detail label="Record">
                  {entry.entityType}
                  {entry.entityId ? (
                    <span className="block font-mono text-xs text-muted-foreground">
                      {entry.entityId}
                    </span>
                  ) : null}
                </Detail>
                <Detail label="IP address">{entry.ipAddress ?? "—"}</Detail>
                <Detail label="Request ID">
                  <span className="font-mono text-xs">{entry.requestId ?? "—"}</span>
                </Detail>
              </dl>
              {entry.changes && Object.keys(entry.changes).length > 0 ? (
                <section className="space-y-2">
                  <h3 className="text-sm font-medium">Changes</h3>
                  <AuditChanges changes={entry.changes} />
                </section>
              ) : null}
              {entry.metadata && Object.keys(entry.metadata).length > 0 ? (
                <section className="space-y-2">
                  <h3 className="text-sm font-medium">Additional details</h3>
                  <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs">
                    {JSON.stringify(entry.metadata, null, 2)}
                  </pre>
                </section>
              ) : null}
            </div>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
