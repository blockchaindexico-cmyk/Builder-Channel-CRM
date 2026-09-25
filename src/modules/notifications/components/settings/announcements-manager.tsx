"use client";

import { Ban, Megaphone, Pencil, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { useFormatters, useRegionalSettings } from "@/components/shared/regional-settings";
import { StatusBadge, type StatusTone } from "@/components/shared/status-badge";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { actionErrorMessage, type ClientActionError } from "@/lib/action-result";
import { fromZonedInputValue, toZonedInputValue } from "@/lib/date-range";

import {
  deleteAnnouncementAction,
  endAnnouncementAction,
  saveAnnouncementAction,
} from "../../actions";
import { AUDIENCE_OPTIONS } from "../../constants";
import type { AnnouncementRow, AnnouncementState } from "../../server/announcements";

interface Option {
  id: string;
  name: string;
}

type When = "now" | "schedule" | "draft" | "keep";

interface Draft {
  id: string | null;
  state: AnnouncementState | null;
  title: string;
  body: string;
  audience: "ALL" | "ROLES" | "TEAM";
  roleIds: string[];
  teamOfId: string;
  when: When;
  publishAt: string;
  endAt: string;
  publishedAt: string | null;
}

const STATES: Record<AnnouncementState, { label: string; tone: StatusTone }> = {
  DRAFT: { label: "Draft", tone: "muted" },
  SCHEDULED: { label: "Scheduled", tone: "info" },
  LIVE: { label: "Live", tone: "success" },
  EXPIRED: { label: "Ended", tone: "secondary" },
};

/** Settings → Announcements (M06-09): write, schedule, end and delete announcements; see who read them. */
export function AnnouncementsManager({
  announcements,
  roles,
  managers,
}: {
  announcements: AnnouncementRow[];
  roles: Option[];
  managers: Option[];
}) {
  const router = useRouter();
  const format = useFormatters();
  const { timezone } = useRegionalSettings();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const audienceLabel = (row: AnnouncementRow) => {
    if (row.audience === "ROLES") {
      const names = row.roleIds.map((id) => roles.find((role) => role.id === id)?.name ?? "?");
      return `Roles: ${names.join(", ")}`;
    }
    if (row.audience === "TEAM") {
      const manager = managers.find((entry) => entry.id === row.teamOfId);
      return manager ? `${manager.name}'s team` : "A manager's team";
    }
    return "Everyone";
  };

  function openNew() {
    setErrors({});
    setDraft({
      id: null,
      state: null,
      title: "",
      body: "",
      audience: "ALL",
      roleIds: [],
      teamOfId: "",
      when: "now",
      publishAt: "",
      endAt: "",
      publishedAt: null,
    });
  }

  function openEdit(row: AnnouncementRow) {
    setErrors({});
    setDraft({
      id: row.id,
      state: row.state,
      title: row.title,
      body: row.body,
      audience: row.audience,
      roleIds: row.roleIds,
      teamOfId: row.teamOfId ?? "",
      when:
        row.state === "LIVE" || row.state === "EXPIRED"
          ? "keep"
          : row.state === "SCHEDULED"
            ? "schedule"
            : "draft",
      publishAt: toZonedInputValue(row.publishedAt, timezone),
      endAt: toZonedInputValue(row.expiresAt, timezone),
      publishedAt: row.publishedAt,
    });
  }

  async function save() {
    if (!draft) return;
    const publishedAt =
      draft.when === "now"
        ? new Date().toISOString()
        : draft.when === "schedule"
          ? fromZonedInputValue(draft.publishAt, timezone)
          : draft.when === "keep"
            ? draft.publishedAt
            : null;
    if (draft.when === "schedule" && !publishedAt) {
      setErrors({ publishedAt: "Choose when to publish" });
      return;
    }
    setBusy(true);
    const result = await saveAnnouncementAction({
      id: draft.id,
      values: {
        title: draft.title,
        body: draft.body,
        audience: draft.audience,
        roleIds: draft.audience === "ROLES" ? draft.roleIds : [],
        teamOfId: draft.audience === "TEAM" ? draft.teamOfId : null,
        publishedAt,
        expiresAt: draft.endAt ? fromZonedInputValue(draft.endAt, timezone) : null,
      },
    });
    setBusy(false);
    const error = actionErrorMessage(result);
    if (error) {
      const fieldErrors = (result?.serverError as ClientActionError | undefined)?.fieldErrors ?? {};
      setErrors(
        Object.fromEntries(
          Object.entries(fieldErrors).map(([field, messages]) => [field, messages[0] ?? ""]),
        ),
      );
      toast.error(error);
      return;
    }
    const state = result?.data?.state;
    toast.success(
      state === "LIVE"
        ? draft.id
          ? `"${draft.title}" updated`
          : `"${draft.title}" is live — its audience has been notified`
        : state === "SCHEDULED"
          ? `"${draft.title}" is scheduled`
          : `"${draft.title}" saved`,
    );
    setDraft(null);
    router.refresh();
  }

  async function end(row: AnnouncementRow) {
    const result = await endAnnouncementAction({ id: row.id });
    const error = actionErrorMessage(result);
    if (error) {
      toast.error(error);
      return false;
    }
    toast.success(`"${row.title}" ended`);
    router.refresh();
  }

  async function remove(row: AnnouncementRow) {
    const result = await deleteAnnouncementAction({ id: row.id });
    const error = actionErrorMessage(result);
    if (error) {
      toast.error(error);
      return false;
    }
    toast.success(`"${row.title}" deleted`);
    router.refresh();
  }

  const field = (key: keyof Draft, value: Draft[keyof Draft]) =>
    setDraft((current) => (current ? { ...current, [key]: value } : current));

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={openNew}>
          <Plus />
          New announcement
        </Button>
      </div>
      {announcements.length === 0 ? (
        <EmptyState
          icon={Megaphone}
          title="No announcements yet"
          description="Share news with everyone, some roles or a manager's team. It shows as a banner and a notification."
        />
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Announcement</TableHead>
                <TableHead>Audience</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Publish / end</TableHead>
                <TableHead className="text-right">Read by</TableHead>
                <TableHead className="w-32">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {announcements.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="max-w-sm">
                    <p className="font-medium">{row.title}</p>
                    <p className="line-clamp-1 text-sm whitespace-normal text-muted-foreground">
                      {row.body}
                    </p>
                  </TableCell>
                  <TableCell className="text-sm">{audienceLabel(row)}</TableCell>
                  <TableCell>
                    <StatusBadge label={STATES[row.state].label} tone={STATES[row.state].tone} />
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    <div>{row.publishedAt ? format.dateTime(row.publishedAt) : "—"}</div>
                    <div>{row.expiresAt ? `until ${format.dateTime(row.expiresAt)}` : null}</div>
                  </TableCell>
                  <TableCell className="text-right text-sm tabular-nums">
                    {row.state === "DRAFT" || row.state === "SCHEDULED"
                      ? "—"
                      : `${row.reads} of ${row.audienceSize}`}
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8"
                        aria-label={`Edit ${row.title}`}
                        onClick={() => openEdit(row)}
                      >
                        <Pencil />
                      </Button>
                      {row.state === "LIVE" ? (
                        <ConfirmDialog
                          trigger={
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-8"
                              aria-label={`End ${row.title}`}
                            >
                              <Ban />
                            </Button>
                          }
                          title={`End "${row.title}"?`}
                          description="The banner disappears for everyone. It stays in this list as ended."
                          confirmLabel="End now"
                          onConfirm={() => end(row)}
                        />
                      ) : null}
                      <ConfirmDialog
                        trigger={
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8"
                            aria-label={`Delete ${row.title}`}
                          >
                            <Trash2 />
                          </Button>
                        }
                        title={`Delete "${row.title}"?`}
                        description="It is removed for everyone, together with who read it."
                        confirmLabel="Delete"
                        destructive
                        onConfirm={() => remove(row)}
                      />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={draft !== null} onOpenChange={(open) => (!open ? setDraft(null) : undefined)}>
        <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{draft?.id ? "Edit announcement" : "New announcement"}</DialogTitle>
            <DialogDescription>
              Times are in the organization&apos;s time zone ({timezone}).
            </DialogDescription>
          </DialogHeader>
          {draft ? (
            <form
              id="announcement-form"
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                void save();
              }}
            >
              <div className="grid gap-2">
                <Label htmlFor="announcement-title">Title</Label>
                <Input
                  id="announcement-title"
                  value={draft.title}
                  maxLength={120}
                  onChange={(event) => field("title", event.target.value)}
                  aria-invalid={Boolean(errors.title)}
                />
                {errors.title ? <p className="text-sm text-destructive">{errors.title}</p> : null}
              </div>
              <div className="grid gap-2">
                <Label htmlFor="announcement-body">Message</Label>
                <Textarea
                  id="announcement-body"
                  rows={5}
                  value={draft.body}
                  maxLength={4000}
                  onChange={(event) => field("body", event.target.value)}
                  aria-invalid={Boolean(errors.body)}
                />
                {errors.body ? <p className="text-sm text-destructive">{errors.body}</p> : null}
              </div>
              <div className="grid gap-2">
                <Label htmlFor="announcement-audience">Who sees it</Label>
                <Select
                  value={draft.audience}
                  onValueChange={(value) => field("audience", value as Draft["audience"])}
                >
                  <SelectTrigger id="announcement-audience" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {AUDIENCE_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {draft.audience === "ROLES" ? (
                <fieldset className="grid gap-2">
                  <legend className="mb-1 text-sm font-medium">Roles</legend>
                  {roles.map((role) => (
                    <label key={role.id} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={draft.roleIds.includes(role.id)}
                        onCheckedChange={(checked) =>
                          field(
                            "roleIds",
                            checked === true
                              ? [...draft.roleIds, role.id]
                              : draft.roleIds.filter((id) => id !== role.id),
                          )
                        }
                      />
                      {role.name}
                    </label>
                  ))}
                  {errors.roleIds ? (
                    <p className="text-sm text-destructive">{errors.roleIds}</p>
                  ) : null}
                </fieldset>
              ) : null}
              {draft.audience === "TEAM" ? (
                <div className="grid gap-2">
                  <Label htmlFor="announcement-team">
                    Manager (with everyone reporting to them)
                  </Label>
                  <Select
                    value={draft.teamOfId}
                    onValueChange={(value) => field("teamOfId", value)}
                  >
                    <SelectTrigger id="announcement-team" className="w-full">
                      <SelectValue placeholder="Choose a manager" />
                    </SelectTrigger>
                    <SelectContent>
                      {managers.map((manager) => (
                        <SelectItem key={manager.id} value={manager.id}>
                          {manager.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.teamOfId ? (
                    <p className="text-sm text-destructive">{errors.teamOfId}</p>
                  ) : null}
                </div>
              ) : null}
              <div className="grid gap-2">
                <Label htmlFor="announcement-when">Publish</Label>
                <Select value={draft.when} onValueChange={(value) => field("when", value as When)}>
                  <SelectTrigger id="announcement-when" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {draft.state === "LIVE" || draft.state === "EXPIRED" ? (
                      <SelectItem value="keep">Keep as published</SelectItem>
                    ) : null}
                    {draft.state !== "LIVE" && draft.state !== "EXPIRED" ? (
                      <SelectItem value="now">Now — notify its audience</SelectItem>
                    ) : null}
                    <SelectItem value="schedule">At a later time</SelectItem>
                    <SelectItem value="draft">Not yet — keep as a draft</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {draft.when === "schedule" ? (
                <div className="grid gap-2">
                  <Label htmlFor="announcement-publish-at">Publish at</Label>
                  <Input
                    id="announcement-publish-at"
                    type="datetime-local"
                    value={draft.publishAt}
                    onChange={(event) => field("publishAt", event.target.value)}
                    aria-invalid={Boolean(errors.publishedAt)}
                  />
                  {errors.publishedAt ? (
                    <p className="text-sm text-destructive">{errors.publishedAt}</p>
                  ) : null}
                </div>
              ) : null}
              <div className="grid gap-2">
                <Label htmlFor="announcement-end-at">End at (optional)</Label>
                <Input
                  id="announcement-end-at"
                  type="datetime-local"
                  value={draft.endAt}
                  onChange={(event) => field("endAt", event.target.value)}
                  aria-invalid={Boolean(errors.expiresAt)}
                />
                {errors.expiresAt ? (
                  <p className="text-sm text-destructive">{errors.expiresAt}</p>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    The banner disappears then. Leave empty to keep it until people dismiss it.
                  </p>
                )}
              </div>
            </form>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDraft(null)}>
              Cancel
            </Button>
            <Button type="submit" form="announcement-form" disabled={busy}>
              {busy
                ? "Saving…"
                : draft?.when === "now"
                  ? "Publish"
                  : draft?.when === "schedule"
                    ? "Schedule"
                    : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
