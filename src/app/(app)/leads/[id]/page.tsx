import { AlertTriangle, Mail, MapPin, Phone } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/shared/page-header";
import { UrlTabs } from "@/components/shared/url-tabs";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate, formatDateTime, formatMoney } from "@/lib/format";
import { formatPhone } from "@/lib/phone";
import { isLeadInScope, LEAD_PERMISSIONS } from "@/modules/leads";
import { AttachmentsPanel } from "@/modules/leads/components/attachments-panel";
import { LeadStatusBadge, TemperatureBadge } from "@/modules/leads/components/badges";
import { InterestsCard } from "@/modules/leads/components/interests-card";
import { LeadHeaderActions } from "@/modules/leads/components/lead-header-actions";
import { NotesPanel } from "@/modules/leads/components/notes-panel";
import { LeadTimeline } from "@/modules/leads/components/timeline";
import { BUYING_TIMELINES, PURPOSES } from "@/modules/leads/constants";
import { listLeadFiles } from "@/modules/leads/server/files";
import { getLead } from "@/modules/leads/server/leads";
import { listLeadNotes } from "@/modules/leads/server/notes";
import { listLeadStatuses, statusPermissions } from "@/modules/leads/server/page-data";
import { listStatusHistory } from "@/modules/leads/server/status";
import { listLeadTimeline } from "@/modules/leads/server/timeline";
import { getRegionalSettings } from "@/modules/organization";
import { uiRegistry } from "@/modules/registry.ui";
import { loadOrNotFound, routeId } from "@/platform/pages";
import { requirePermission } from "@/platform/rbac/guard";
import { getRequestContext } from "@/platform/tenant/request-context";

export const metadata: Metadata = { title: "Lead" };

function Facts({ items }: { items: [string, React.ReactNode][] }) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
      {items.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="min-w-0 break-words">
            {value ?? <span className="text-muted-foreground">—</span>}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** Lead detail (M04-07): header with quick actions, customer & requirement, projects, timeline, notes, files. */
export default async function LeadPage({ params }: PageProps<"/leads/[id]">) {
  const ctx = await getRequestContext();
  requirePermission(ctx, LEAD_PERMISSIONS.view);
  const lead = await loadOrNotFound(getLead(ctx, routeId((await params).id)));
  const owner = { ownerId: lead.owner?.membershipId ?? null };
  const [canUpdate, canChangeStatus, regional, timeline, notes, files, history, statuses] =
    await Promise.all([
      isLeadInScope(ctx, owner, LEAD_PERMISSIONS.update),
      isLeadInScope(ctx, owner, LEAD_PERMISSIONS.changeStatus),
      getRegionalSettings(ctx),
      listLeadTimeline(ctx, lead.id),
      listLeadNotes(ctx, lead.id),
      listLeadFiles(ctx, lead.id),
      listStatusHistory(ctx, lead.id),
      listLeadStatuses(ctx),
    ]);
  const actions = uiRegistry.extensions("lead.detail.action").toSorted((a, b) => a.order - b.order);
  const panels = uiRegistry
    .extensions("lead.detail.panel")
    .filter((panel) => !panel.permission || ctx.permissions.has(panel.permission))
    .sort((a, b) => a.order - b.order);
  const money = (value: string | null) =>
    value ? formatMoney(value, regional, { compact: true }) : null;
  const label = (list: readonly { value: string; label: string }[], value: string | null) =>
    value ? (list.find((entry) => entry.value === value)?.label ?? value) : null;

  return (
    <>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-3">
            {lead.name}
            <LeadStatusBadge label={lead.status.label} color={lead.status.color} />
            <TemperatureBadge value={lead.temperature} />
          </span>
        }
        description={`${lead.number} · ${lead.owner ? `Owner: ${lead.owner.name}` : "Unassigned"}${lead.source ? ` · ${lead.source.name}` : ""}`}
        breadcrumbs={[{ label: "Leads", href: "/leads" }, { label: lead.number }]}
        actions={
          <>
            {await Promise.all(
              actions.map(async (action) => (
                <span key={action.key} className="contents">
                  {await action.render({
                    lead: {
                      id: lead.id,
                      number: lead.number,
                      ownerId: lead.owner?.membershipId ?? null,
                      ownerName: lead.owner?.name ?? null,
                      statusKey: lead.status.key,
                    },
                  })}
                </span>
              )),
            )}
            <LeadHeaderActions
              lead={lead}
              statuses={statuses}
              canUpdate={canUpdate}
              canChangeStatus={canChangeStatus}
              canDelete={ctx.permissions.has(LEAD_PERMISSIONS.delete)}
              statusPermissions={statusPermissions(ctx)}
            />
          </>
        }
      />

      {lead.duplicateStatus !== "NONE" &&
      lead.duplicateStatus !== "DISMISSED" &&
      lead.duplicateOf ? (
        <div
          className="mb-6 flex items-start gap-3 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm"
          role="status"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
          <p>
            {lead.duplicateStatus === "SUSPECTED"
              ? "Possible duplicate of "
              : lead.duplicateStatus === "MERGED"
                ? "Merged into "
                : "Duplicate of "}
            {lead.duplicateOf.visible ? (
              <Link
                href={`/leads/${lead.duplicateOf.id}`}
                className="font-medium text-primary hover:underline"
              >
                {lead.duplicateOf.number} · {lead.duplicateOf.name}
              </Link>
            ) : (
              <span className="font-medium">{lead.duplicateOf.number}</span>
            )}
            {lead.duplicateStatus === "SUSPECTED" && ctx.permissions.has(LEAD_PERMISSIONS.merge) ? (
              <>
                {" "}
                —{" "}
                <Link href="/leads/duplicates" className="text-primary hover:underline">
                  review in the duplicates queue
                </Link>
              </>
            ) : null}
          </p>
        </div>
      ) : null}

      <div className="grid items-start gap-6 xl:grid-cols-3">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Customer</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {lead.mobile ? (
                <a href={`tel:${lead.mobile}`} className="flex items-center gap-2 hover:underline">
                  <Phone className="size-4 text-muted-foreground" />{" "}
                  {formatPhone(lead.mobile, regional.country)}
                </a>
              ) : null}
              {lead.alternateMobile ? (
                <a
                  href={`tel:${lead.alternateMobile}`}
                  className="flex items-center gap-2 hover:underline"
                >
                  <Phone className="size-4 text-muted-foreground" />{" "}
                  {formatPhone(lead.alternateMobile, regional.country)}
                  <span className="text-xs text-muted-foreground">alternate</span>
                </a>
              ) : null}
              {lead.email ? (
                <a
                  href={`mailto:${lead.email}`}
                  className="flex items-center gap-2 break-all hover:underline"
                >
                  <Mail className="size-4 shrink-0 text-muted-foreground" /> {lead.email}
                </a>
              ) : null}
              {lead.city || lead.locality || lead.address ? (
                <p className="flex items-start gap-2">
                  <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  {[lead.address, lead.locality, lead.city].filter(Boolean).join(", ")}
                </p>
              ) : null}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Requirement</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Facts
                items={[
                  [
                    "Budget",
                    lead.budgetMin || lead.budgetMax
                      ? [money(lead.budgetMin), money(lead.budgetMax)].filter(Boolean).join(" – ")
                      : null,
                  ],
                  ["Property type", lead.propertyType?.name ?? null],
                  [
                    "Configurations",
                    lead.configurations.map((entry) => entry.name).join(", ") || null,
                  ],
                  ["Locations", lead.preferredLocations.join(", ") || null],
                  ["Purpose", label(PURPOSES, lead.purpose)],
                  ["Timeline", label(BUYING_TIMELINES, lead.buyingTimeline)],
                ]}
              />
              {lead.tags.length ? (
                <div className="flex flex-wrap gap-1.5">
                  {lead.tags.map((tag) => (
                    <Badge key={tag} variant="secondary">
                      {tag}
                    </Badge>
                  ))}
                </div>
              ) : null}
              {lead.requirementNotes ? (
                <p className="border-t pt-3 text-sm whitespace-pre-line">{lead.requirementNotes}</p>
              ) : null}
            </CardContent>
          </Card>
          <InterestsCard interests={lead.interests} />
          <Card>
            <CardHeader>
              <CardTitle>Record</CardTitle>
            </CardHeader>
            <CardContent>
              <Facts
                items={[
                  ["Source", lead.source?.name ?? null],
                  ["Campaign", lead.campaign?.name ?? null],
                  ["Source detail", lead.subSource],
                  [
                    "Received via",
                    lead.channel === "MANUAL"
                      ? "Entered by hand"
                      : lead.channel === "IMPORT"
                        ? "Import"
                        : "Intake API",
                  ],
                  [
                    "Created by",
                    lead.createdBy?.name ?? (lead.channel === "API" ? "Intake API" : null),
                  ],
                  ["Created", formatDateTime(lead.createdAt, regional)],
                  ["Status since", formatDate(lead.statusChangedAt, regional)],
                  ["Last activity", formatDateTime(lead.lastActivityAt, regional)],
                ]}
              />
            </CardContent>
          </Card>
        </div>
        <div className="min-w-0 xl:col-span-2">
          <UrlTabs
            tabs={[
              {
                value: "timeline",
                label: "Timeline",
                content: <LeadTimeline leadId={lead.id} initial={timeline} />,
              },
              {
                value: "notes",
                label: `Notes (${notes.length})`,
                content: (
                  <NotesPanel
                    leadId={lead.id}
                    notes={notes}
                    canWrite={canUpdate}
                    myMembershipId={ctx.actor.membershipId ?? null}
                    canDeleteAny={ctx.permissions.has(LEAD_PERMISSIONS.delete)}
                  />
                ),
              },
              {
                value: "files",
                label: `Attachments (${files.length})`,
                content: <AttachmentsPanel leadId={lead.id} files={files} canWrite={canUpdate} />,
              },
              {
                value: "status",
                label: "Status history",
                content: (
                  <ul className="divide-y rounded-lg border">
                    {history.map((entry) => (
                      <li
                        key={entry.id}
                        className="flex flex-col gap-1 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between"
                      >
                        <span className="flex flex-wrap items-center gap-2">
                          {entry.from ? (
                            <LeadStatusBadge label={entry.from.label} color={entry.from.color} />
                          ) : (
                            <span className="text-muted-foreground">Created as</span>
                          )}
                          {entry.from ? <span className="text-muted-foreground">→</span> : null}
                          {entry.to ? (
                            <LeadStatusBadge label={entry.to.label} color={entry.to.color} />
                          ) : null}
                          {entry.reason ? (
                            <span className="text-muted-foreground">“{entry.reason}”</span>
                          ) : null}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {entry.changedByName} · {formatDateTime(entry.changedAt, regional)}
                        </span>
                      </li>
                    ))}
                  </ul>
                ),
              },
              ...(await Promise.all(
                panels.map(async (panel) => ({
                  value: panel.key,
                  label: panel.label,
                  content: await panel.render({ leadId: lead.id }),
                })),
              )),
            ]}
          />
        </div>
      </div>
    </>
  );
}
