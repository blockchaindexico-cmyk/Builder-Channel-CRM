"use client";

import { Pencil, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { useFormatters } from "@/components/shared/regional-settings";
import { StatusBadge } from "@/components/shared/status-badge";
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
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { actionErrorMessage } from "@/lib/action-result";
import { formatCalendarDate } from "@/lib/format";

import { deleteCampaignAction, saveCampaignAction } from "../../actions";

export interface CampaignRow {
  id: string;
  name: string;
  code: string;
  source: { id: string; name: string } | null;
  startDate: string | null;
  endDate: string | null;
  cost: string | null;
  notes: string | null;
  isActive: boolean;
  leadCount: number;
}

interface Draft {
  id?: string;
  name: string;
  code: string;
  sourceId: string;
  startDate: string;
  endDate: string;
  cost: string;
  notes: string;
  isActive: boolean;
}

const NONE = "__none__";
const slug = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);

/** Campaigns (M04-03) with dates and cost, for campaign-wise lead and ROI reports (M10). */
export function CampaignsTable({
  campaigns,
  sources,
}: {
  campaigns: CampaignRow[];
  sources: { id: string; name: string }[];
}) {
  const router = useRouter();
  const format = useFormatters();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!draft) return;
    setBusy(true);
    setError(null);
    const { id, sourceId, ...values } = draft;
    const result = await saveCampaignAction({
      campaignId: id ?? null,
      values: { ...values, sourceId: sourceId === NONE ? "" : sourceId },
    });
    setBusy(false);
    const message = actionErrorMessage(result);
    if (message) {
      const fieldErrors = (
        result?.serverError as { fieldErrors?: Record<string, string[]> } | undefined
      )?.fieldErrors;
      return setError(Object.values(fieldErrors ?? {})[0]?.[0] ?? message);
    }
    toast.success(`${draft.name} saved`);
    setDraft(null);
    router.refresh();
  }

  const dateText = (value: string | null) =>
    value ? formatCalendarDate(value, { dateFormat: "dd MMM yyyy" }) : "…";

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button
          onClick={() =>
            setDraft({
              name: "",
              code: "",
              sourceId: NONE,
              startDate: "",
              endDate: "",
              cost: "",
              notes: "",
              isActive: true,
            })
          }
        >
          <Plus /> Add campaign
        </Button>
      </div>
      <div className="overflow-hidden rounded-lg border">
        <Table>
          <TableHeader className="bg-muted/40">
            <TableRow className="hover:bg-transparent">
              <TableHead className="px-3">Campaign</TableHead>
              <TableHead className="px-3">Source</TableHead>
              <TableHead className="px-3">Dates</TableHead>
              <TableHead className="px-3">Cost</TableHead>
              <TableHead className="px-3">Leads</TableHead>
              <TableHead className="px-3">Active</TableHead>
              <TableHead className="w-24 px-3">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {campaigns.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={7} className="py-10 text-center text-sm text-muted-foreground">
                  No campaigns yet.
                </TableCell>
              </TableRow>
            ) : (
              campaigns.map((campaign) => (
                <TableRow key={campaign.id}>
                  <TableCell className="px-3 py-2">
                    <span className="font-medium">{campaign.name}</span>
                    <span className="block font-mono text-xs text-muted-foreground">
                      {campaign.code}
                    </span>
                  </TableCell>
                  <TableCell className="px-3">{campaign.source?.name ?? "—"}</TableCell>
                  <TableCell className="px-3 whitespace-nowrap">
                    {campaign.startDate || campaign.endDate
                      ? `${dateText(campaign.startDate)} – ${dateText(campaign.endDate)}`
                      : "—"}
                  </TableCell>
                  <TableCell className="px-3">
                    {campaign.cost ? format.money(campaign.cost) : "—"}
                  </TableCell>
                  <TableCell className="px-3">{campaign.leadCount}</TableCell>
                  <TableCell className="px-3">
                    {campaign.isActive ? (
                      <StatusBadge label="Active" tone="success" />
                    ) : (
                      <StatusBadge label="Inactive" tone="muted" />
                    )}
                  </TableCell>
                  <TableCell className="px-3">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Edit ${campaign.name}`}
                        onClick={() => {
                          setError(null);
                          setDraft({
                            id: campaign.id,
                            name: campaign.name,
                            code: campaign.code,
                            sourceId: campaign.source?.id ?? NONE,
                            startDate: campaign.startDate ?? "",
                            endDate: campaign.endDate ?? "",
                            cost: campaign.cost ?? "",
                            notes: campaign.notes ?? "",
                            isActive: campaign.isActive,
                          });
                        }}
                      >
                        <Pencil />
                      </Button>
                      <ConfirmDialog
                        trigger={
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`Delete ${campaign.name}`}
                          >
                            <Trash2 />
                          </Button>
                        }
                        title={`Delete ${campaign.name}?`}
                        description="Campaigns with leads can only be deactivated."
                        confirmLabel="Delete"
                        destructive
                        onConfirm={async () => {
                          const message = actionErrorMessage(
                            await deleteCampaignAction({ campaignId: campaign.id }),
                          );
                          if (message) {
                            toast.error(message);
                            return false;
                          }
                          toast.success(`${campaign.name} deleted`);
                          router.refresh();
                        }}
                      />
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      <Dialog open={draft !== null} onOpenChange={(open) => !open && !busy && setDraft(null)}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{draft?.id ? `Edit ${draft.name}` : "Add campaign"}</DialogTitle>
            <DialogDescription>
              Leads can be tagged with a campaign to measure what each one brings in.
            </DialogDescription>
          </DialogHeader>
          {draft ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="campaign-name">Name</Label>
                <Input
                  id="campaign-name"
                  value={draft.name}
                  maxLength={80}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      name: event.target.value,
                      code: draft.id ? draft.code : slug(event.target.value),
                    })
                  }
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="campaign-code">Code</Label>
                <Input
                  id="campaign-code"
                  className="font-mono"
                  value={draft.code}
                  maxLength={40}
                  onChange={(event) => setDraft({ ...draft, code: event.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="campaign-source">Source</Label>
                <Select
                  value={draft.sourceId}
                  onValueChange={(value) => setDraft({ ...draft, sourceId: value })}
                >
                  <SelectTrigger id="campaign-source" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Any source</SelectItem>
                    {sources.map((source) => (
                      <SelectItem key={source.id} value={source.id}>
                        {source.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="campaign-cost">Cost</Label>
                <Input
                  id="campaign-cost"
                  value={draft.cost}
                  placeholder="e.g. 2.5 L"
                  onChange={(event) => setDraft({ ...draft, cost: event.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="campaign-start">Start</Label>
                <Input
                  id="campaign-start"
                  type="date"
                  value={draft.startDate}
                  onChange={(event) => setDraft({ ...draft, startDate: event.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="campaign-end">End</Label>
                <Input
                  id="campaign-end"
                  type="date"
                  value={draft.endDate}
                  onChange={(event) => setDraft({ ...draft, endDate: event.target.value })}
                />
              </div>
              <div className="grid gap-2 sm:col-span-2">
                <Label htmlFor="campaign-notes">Notes</Label>
                <Textarea
                  id="campaign-notes"
                  rows={2}
                  value={draft.notes}
                  onChange={(event) => setDraft({ ...draft, notes: event.target.value })}
                />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <Switch
                  checked={draft.isActive}
                  onCheckedChange={(checked) => setDraft({ ...draft, isActive: checked })}
                />
                Active
              </label>
              {error ? <p className="text-sm text-destructive sm:col-span-2">{error}</p> : null}
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="ghost" disabled={busy} onClick={() => setDraft(null)}>
              Cancel
            </Button>
            <Button
              disabled={busy || !draft?.name.trim() || !draft?.code.trim()}
              onClick={() => void save()}
            >
              {busy ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
