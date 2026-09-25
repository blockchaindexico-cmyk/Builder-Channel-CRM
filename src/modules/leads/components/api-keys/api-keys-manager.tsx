"use client";

import { Check, Copy, KeyRound, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { RelativeTime } from "@/components/shared/relative-time";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { actionErrorMessage } from "@/lib/action-result";

import { createApiKeyAction, revokeApiKeyAction } from "../../actions";
import type { ApiKeyRow } from "../../server/api-keys";

const NONE = "__none__";

function CreatedKeyDialog({ created, onClose }: { created: string | null; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <Dialog open={Boolean(created)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Copy your new API key</DialogTitle>
          <DialogDescription>
            This is the only time the key is shown. Store it in the website or portal settings now —
            if it is lost, revoke it and create a new one.
          </DialogDescription>
        </DialogHeader>
        <div className="flex gap-2">
          <Input
            readOnly
            value={created ?? ""}
            aria-label="New API key"
            className="font-mono text-xs"
            onFocus={(event) => event.target.select()}
          />
          <Button
            type="button"
            variant="outline"
            onClick={async () => {
              await navigator.clipboard.writeText(created ?? "");
              setCopied(true);
              toast.success("API key copied");
            }}
          >
            {copied ? <Check /> : <Copy />} {copied ? "Copied" : "Copy"}
          </Button>
        </div>
        <DialogFooter>
          <Button onClick={onClose}>I have stored the key</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** API keys for the lead intake API (M04-20): create (shown once), see usage, revoke. */
export function ApiKeysManager({
  keys,
  sources,
}: {
  keys: ApiKeyRow[];
  sources: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [sourceId, setSourceId] = useState("");
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<string | null>(null);

  async function create() {
    setBusy(true);
    const result = await createApiKeyAction({ name, defaultSourceId: sourceId });
    setBusy(false);
    const error = actionErrorMessage(result);
    if (error || !result?.data) return void toast.error(error ?? "The key could not be created.");
    setCreating(false);
    setName("");
    setSourceId("");
    setCreated(result.data.key);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setCreating(true)}>
          <Plus /> Create API key
        </Button>
      </div>
      {keys.length === 0 ? (
        <EmptyState
          icon={KeyRound}
          title="No API keys yet"
          description="Create a key for each website form or portal that should send leads to the CRM."
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Key</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Last used</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {keys.map((key) => (
                <TableRow key={key.id} className={key.revokedAt ? "text-muted-foreground" : ""}>
                  <TableCell>
                    <div className="font-medium">{key.name}</div>
                    <div className="text-xs text-muted-foreground">
                      Default source: {key.defaultSourceName ?? "API"}
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{key.prefix}_…</TableCell>
                  <TableCell className="whitespace-nowrap">
                    <div>{key.createdByName}</div>
                    <RelativeTime value={key.createdAt} className="text-xs text-muted-foreground" />
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {key.lastUsedAt ? <RelativeTime value={key.lastUsedAt} /> : "Never"}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-between gap-2">
                      {key.revokedAt ? (
                        <Badge variant="muted">Revoked</Badge>
                      ) : (
                        <Badge variant="success">Active</Badge>
                      )}
                      {key.revokedAt ? null : (
                        <ConfirmDialog
                          trigger={
                            <Button variant="ghost" size="sm" aria-label={`Revoke ${key.name}`}>
                              Revoke
                            </Button>
                          }
                          title={`Revoke "${key.name}"?`}
                          description="Requests with this key are refused immediately. This cannot be undone."
                          confirmLabel="Revoke key"
                          destructive
                          onConfirm={async () => {
                            const error = actionErrorMessage(
                              await revokeApiKeyAction({ keyId: key.id }),
                            );
                            if (error) {
                              toast.error(error);
                              return false;
                            }
                            toast.success(`"${key.name}" revoked`);
                            router.refresh();
                          }}
                        />
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={creating} onOpenChange={(open) => !busy && setCreating(open)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create API key</DialogTitle>
            <DialogDescription>
              One key per website or portal makes it easy to see where leads come from and to revoke
              a single integration.
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              void create();
            }}
          >
            <div className="grid gap-2">
              <Label htmlFor="api-key-name">Name</Label>
              <Input
                id="api-key-name"
                value={name}
                maxLength={60}
                placeholder="Website enquiry form"
                onChange={(event) => setName(event.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="api-key-source">Source for leads that do not name one</Label>
              <Select
                value={sourceId || NONE}
                onValueChange={(value) => setSourceId(value === NONE ? "" : value)}
              >
                <SelectTrigger id="api-key-source" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>The &quot;API&quot; source</SelectItem>
                  {sources.map((source) => (
                    <SelectItem key={source.id} value={source.id}>
                      {source.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                disabled={busy}
                onClick={() => setCreating(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={busy || name.trim().length < 2}>
                {busy ? "Creating…" : "Create key"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <CreatedKeyDialog created={created} onClose={() => setCreated(null)} />
    </div>
  );
}
