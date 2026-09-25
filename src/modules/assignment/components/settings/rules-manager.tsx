"use client";

import { Pencil, Plus, Shuffle, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { actionErrorMessage } from "@/lib/action-result";

import { deleteAssignmentRuleAction, saveAssignmentRuleAction } from "../../actions";
import { ASSIGNMENT_STRATEGIES, LEAD_CHANNELS } from "../../constants";
import type { RuleRow } from "../../server/rules";
import { CheckList } from "./check-list";

type Option = { id: string; name: string };
type Channel = (typeof LEAD_CHANNELS)[number]["value"];

interface Draft {
  id: string | null;
  name: string;
  isActive: boolean;
  priority: number;
  strategy: "ROUND_ROBIN" | "LEAST_LOADED";
  channels: Channel[];
  sourceIds: string[];
  campaignIds: string[];
  projectIds: string[];
  memberIds: string[];
}

const blank = (priority: number): Draft => ({
  id: null,
  name: "",
  isActive: true,
  priority,
  strategy: "ROUND_ROBIN",
  channels: [],
  sourceIds: [],
  campaignIds: [],
  projectIds: [],
  memberIds: [],
});

function describe(rule: RuleRow): string {
  const parts: string[] = [];
  if (rule.channels.length) {
    parts.push(
      rule.channels
        .map((channel) => LEAD_CHANNELS.find((entry) => entry.value === channel)?.label)
        .join(" or "),
    );
  }
  if (rule.sources.length) parts.push(`source ${rule.sources.map((s) => s.name).join(" or ")}`);
  if (rule.campaigns.length)
    parts.push(`campaign ${rule.campaigns.map((c) => c.name).join(" or ")}`);
  if (rule.projects.length)
    parts.push(`interested in ${rule.projects.map((p) => p.name).join(" or ")}`);
  return parts.length ? `New leads: ${parts.join(", ")}` : "Every new lead nobody assigned";
}

/** Automatic assignment rules (M05-10): first matching active rule wins, lower priority numbers first. */
export function RulesManager({
  rules,
  sources,
  campaigns,
  projects,
  members,
}: {
  rules: RuleRow[];
  sources: Option[];
  campaigns: Option[];
  projects: Option[];
  members: Option[];
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!draft) return;
    setBusy(true);
    const { id, ...values } = draft;
    const result = await saveAssignmentRuleAction({ ruleId: id, ...values });
    setBusy(false);
    const error = actionErrorMessage(result);
    if (error) return void toast.error(error);
    toast.success(`Rule "${draft.name}" saved`);
    setDraft(null);
    router.refresh();
  }

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((current) => (current ? { ...current, [key]: value } : current));
  const nextPriority = (rules.at(-1)?.priority ?? 90) + 10;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm text-muted-foreground">
          New leads that nobody assigned — imports, the intake API, leads entered without an owner —
          go to the first active rule that matches, in priority order. Leads no rule matches wait in
          the unassigned queue.
        </p>
        <Button onClick={() => setDraft(blank(nextPriority))}>
          <Plus /> Add rule
        </Button>
      </div>

      {rules.length === 0 ? (
        <EmptyState
          icon={Shuffle}
          title="No assignment rules"
          description="Without rules, new leads wait in the unassigned queue until a manager assigns them."
        />
      ) : (
        <ul className="divide-y rounded-lg border">
          {rules.map((rule) => (
            <li
              key={rule.id}
              className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0 space-y-1">
                <p className="flex flex-wrap items-center gap-2 font-medium">
                  <span className="text-xs text-muted-foreground tabular-nums">
                    #{rule.priority}
                  </span>
                  {rule.name}
                  {rule.isActive ? (
                    <Badge variant="success">Active</Badge>
                  ) : (
                    <Badge variant="muted">Inactive</Badge>
                  )}
                </p>
                <p className="text-sm text-muted-foreground">{describe(rule)}</p>
                <p className="text-sm">
                  {ASSIGNMENT_STRATEGIES.find((entry) => entry.value === rule.strategy)?.label}{" "}
                  among{" "}
                  {rule.members.map((member) => (
                    <span
                      key={member.id}
                      className={member.active ? "" : "text-destructive line-through"}
                    >
                      {member.name}
                      {member === rule.members.at(-1) ? "" : ", "}
                    </span>
                  ))}{" "}
                  <span className="text-muted-foreground">
                    · {rule.assignedCount} assigned so far
                  </span>
                </p>
              </div>
              <div className="flex shrink-0 gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Edit ${rule.name}`}
                  onClick={() =>
                    setDraft({
                      id: rule.id,
                      name: rule.name,
                      isActive: rule.isActive,
                      priority: rule.priority,
                      strategy: rule.strategy,
                      channels: rule.channels as Channel[],
                      sourceIds: rule.sources.map((entry) => entry.id),
                      campaignIds: rule.campaigns.map((entry) => entry.id),
                      projectIds: rule.projects.map((entry) => entry.id),
                      memberIds: rule.members.filter((m) => m.active).map((entry) => entry.id),
                    })
                  }
                >
                  <Pencil />
                </Button>
                <ConfirmDialog
                  trigger={
                    <Button variant="ghost" size="icon" aria-label={`Delete ${rule.name}`}>
                      <Trash2 />
                    </Button>
                  }
                  title={`Delete "${rule.name}"?`}
                  description="Rules that already assigned leads stay for the history and can only be deactivated."
                  confirmLabel="Delete"
                  destructive
                  onConfirm={async () => {
                    const error = actionErrorMessage(
                      await deleteAssignmentRuleAction({ ruleId: rule.id }),
                    );
                    if (error) {
                      toast.error(error);
                      return false;
                    }
                    toast.success(`Rule "${rule.name}" deleted`);
                    router.refresh();
                  }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={Boolean(draft)} onOpenChange={(open) => !busy && !open && setDraft(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{draft?.id ? "Edit rule" : "New assignment rule"}</DialogTitle>
            <DialogDescription>
              Leave a condition empty to match every lead. All chosen conditions must match.
            </DialogDescription>
          </DialogHeader>
          {draft ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2 sm:col-span-2">
                <Label htmlFor="rule-name">Name</Label>
                <Input
                  id="rule-name"
                  value={draft.name}
                  maxLength={80}
                  placeholder="Portal leads → Pune team"
                  onChange={(event) => set("name", event.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="rule-priority">Priority (lower runs first)</Label>
                <Input
                  id="rule-priority"
                  type="number"
                  min={0}
                  max={1000}
                  value={draft.priority}
                  onChange={(event) => set("priority", Number(event.target.value) || 0)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="rule-strategy">How to share</Label>
                <Select
                  value={draft.strategy}
                  onValueChange={(value) => set("strategy", value as Draft["strategy"])}
                >
                  <SelectTrigger id="rule-strategy" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ASSIGNMENT_STRATEGIES.map((entry) => (
                      <SelectItem key={entry.value} value={entry.value}>
                        {entry.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {
                    ASSIGNMENT_STRATEGIES.find((entry) => entry.value === draft.strategy)
                      ?.description
                  }
                </p>
              </div>
              <fieldset className="grid gap-1.5 sm:col-span-2">
                <legend className="mb-1 text-sm font-medium">Received via</legend>
                <div className="flex flex-wrap gap-4">
                  {LEAD_CHANNELS.map((channel) => (
                    <label key={channel.value} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={draft.channels.includes(channel.value)}
                        onCheckedChange={(checked) =>
                          set(
                            "channels",
                            checked === true
                              ? [...draft.channels, channel.value]
                              : draft.channels.filter((entry) => entry !== channel.value),
                          )
                        }
                      />
                      {channel.label}
                    </label>
                  ))}
                </div>
              </fieldset>
              <CheckList
                label="Sources"
                options={sources.map((entry) => ({ id: entry.id, label: entry.name }))}
                value={draft.sourceIds}
                onChange={(value) => set("sourceIds", value)}
              />
              <CheckList
                label="Campaigns"
                options={campaigns.map((entry) => ({ id: entry.id, label: entry.name }))}
                value={draft.campaignIds}
                onChange={(value) => set("campaignIds", value)}
                emptyLabel="No active campaigns."
              />
              <CheckList
                label="Projects of interest"
                options={projects.map((entry) => ({ id: entry.id, label: entry.name }))}
                value={draft.projectIds}
                onChange={(value) => set("projectIds", value)}
              />
              <CheckList
                label="Members who get the leads"
                options={members.map((entry) => ({ id: entry.id, label: entry.name }))}
                value={draft.memberIds}
                onChange={(value) => set("memberIds", value)}
              />
              <div className="flex items-center gap-2 sm:col-span-2">
                <Switch
                  id="rule-active"
                  checked={draft.isActive}
                  onCheckedChange={(checked) => set("isActive", checked)}
                />
                <Label htmlFor="rule-active">Active</Label>
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="ghost" disabled={busy} onClick={() => setDraft(null)}>
              Cancel
            </Button>
            <Button
              disabled={busy || !draft?.name.trim() || draft.memberIds.length === 0}
              onClick={() => void save()}
            >
              {busy ? "Saving…" : "Save rule"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
