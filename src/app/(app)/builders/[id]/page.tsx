import { ChartColumn, ClipboardList, Globe, Mail, Phone, Plus, Star } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { UrlTabs } from "@/components/shared/url-tabs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatPhone } from "@/lib/phone";
import { toTableQuery } from "@/lib/table-query";
import { CATALOG_PERMISSIONS } from "@/modules/catalog";
import { BuilderFormDialog } from "@/modules/catalog/components/builders/builder-form-dialog";
import { BuilderStatusActions } from "@/modules/catalog/components/builders/builder-status-actions";
import { ContactsPanel } from "@/modules/catalog/components/builders/contacts-panel";
import { ProjectListCompact } from "@/modules/catalog/components/projects/project-list-compact";
import { DocumentsPanel } from "@/modules/catalog/components/shared/documents-panel";
import { InactiveBadge } from "@/modules/catalog/components/shared/project-status-badge";
import { getBuilder } from "@/modules/catalog/server/builders";
import { listDocuments } from "@/modules/catalog/server/documents";
import { listProjects } from "@/modules/catalog/server/projects";
import { loadOrNotFound, routeId } from "@/platform/pages";
import { requirePermission } from "@/platform/rbac/guard";
import { getRequestContext } from "@/platform/tenant/request-context";

export const metadata: Metadata = { title: "Builder" };

const allProjects = toTableQuery(
  { page: 1, pageSize: 100, sort: "name.asc", q: "" },
  { sortable: ["name"] },
);

/** Builder detail (M03-04): overview, contacts, projects, documents; leads & performance arrive later. */
export default async function BuilderDetailPage({ params }: PageProps<"/builders/[id]">) {
  const ctx = await getRequestContext();
  requirePermission(ctx, CATALOG_PERMISSIONS.buildersView);
  const builder = await loadOrNotFound(getBuilder(ctx, routeId((await params).id)));
  const canManage = ctx.permissions.has(CATALOG_PERMISSIONS.buildersManage);
  const canViewProjects = ctx.permissions.has(CATALOG_PERMISSIONS.projectsView);
  const canAddProject = ctx.permissions.has(CATALOG_PERMISSIONS.projectsManage) && builder.isActive;
  const [projects, documents] = await Promise.all([
    canViewProjects
      ? listProjects(ctx, allProjects, { builderId: builder.id, includeInactive: true })
      : Promise.resolve({ rows: [], total: 0 }),
    listDocuments(ctx, "builder", builder.id),
  ]);
  const primary = builder.contacts.find((contact) => contact.isPrimary);

  const details: [string, React.ReactNode][] = [
    [
      "Code",
      <span key="code" className="font-mono">
        {builder.code}
      </span>,
    ],
    ["Legal name", builder.legalName],
    ["GSTIN / tax ID", builder.taxId],
    [
      "Website",
      builder.website ? (
        <a
          key="web"
          href={builder.website}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-primary hover:underline"
        >
          <Globe className="size-4" /> {builder.website.replace(/^https?:\/\//, "")}
        </a>
      ) : null,
    ],
    [
      "E-mail",
      builder.email ? (
        <a key="mail" href={`mailto:${builder.email}`} className="hover:underline">
          {builder.email}
        </a>
      ) : null,
    ],
    [
      "Phone",
      builder.phone ? (
        <a key="tel" href={`tel:${builder.phone}`} className="hover:underline">
          {formatPhone(builder.phone)}
        </a>
      ) : null,
    ],
    [
      "Address",
      [builder.addressLine, builder.city, builder.state, builder.postalCode]
        .filter(Boolean)
        .join(", ") || null,
    ],
  ];

  return (
    <>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-3">
            {builder.name} {!builder.isActive ? <InactiveBadge /> : null}
          </span>
        }
        description={`${builder.activeProjects} active project(s)${builder.city ? ` · ${builder.city}` : ""}`}
        breadcrumbs={[{ label: "Builders", href: "/builders" }, { label: builder.name }]}
        actions={
          canManage ? (
            <>
              <BuilderFormDialog builder={builder} />
              <BuilderStatusActions
                builderId={builder.id}
                name={builder.name}
                isActive={builder.isActive}
                activeProjects={builder.activeProjects}
                totalProjects={builder.totalProjects}
              />
            </>
          ) : null
        }
      />
      <UrlTabs
        tabs={[
          {
            value: "overview",
            label: "Overview",
            content: (
              <div className="grid items-start gap-6 xl:grid-cols-3">
                <Card className="xl:col-span-2">
                  <CardHeader>
                    <CardTitle>Details</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-[auto_1fr]">
                      {details.map(([label, value]) => (
                        <div key={label} className="contents">
                          <dt className="text-muted-foreground">{label}</dt>
                          <dd>{value ?? <span className="text-muted-foreground">—</span>}</dd>
                        </div>
                      ))}
                    </dl>
                    {builder.description ? (
                      <p className="border-t pt-4 text-sm whitespace-pre-line">
                        {builder.description}
                      </p>
                    ) : null}
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Star className="size-4 text-primary" /> Primary contact
                    </CardTitle>
                    <CardDescription>{builder.contacts.length} contact(s) in total</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    {primary ? (
                      <>
                        <p className="font-medium">{primary.name}</p>
                        {primary.designation ? (
                          <p className="text-muted-foreground">{primary.designation}</p>
                        ) : null}
                        {primary.phone ? (
                          <a
                            href={`tel:${primary.phone}`}
                            className="flex items-center gap-2 hover:underline"
                          >
                            <Phone className="size-4 text-muted-foreground" />{" "}
                            {formatPhone(primary.phone)}
                          </a>
                        ) : null}
                        {primary.email ? (
                          <a
                            href={`mailto:${primary.email}`}
                            className="flex items-center gap-2 hover:underline"
                          >
                            <Mail className="size-4 text-muted-foreground" /> {primary.email}
                          </a>
                        ) : null}
                      </>
                    ) : (
                      <p className="text-muted-foreground">No contacts yet.</p>
                    )}
                  </CardContent>
                </Card>
              </div>
            ),
          },
          {
            value: "contacts",
            label: `Contacts (${builder.contacts.length})`,
            content: (
              <ContactsPanel
                builderId={builder.id}
                contacts={builder.contacts}
                canManage={canManage}
              />
            ),
          },
          ...(canViewProjects
            ? [
                {
                  value: "projects",
                  label: `Projects (${projects.total})`,
                  content: (
                    <div className="space-y-4">
                      {canAddProject ? (
                        <div className="flex justify-end">
                          <Button asChild variant="outline">
                            <Link href={`/projects/new?builderId=${builder.id}`}>
                              <Plus /> Add project
                            </Link>
                          </Button>
                        </div>
                      ) : null}
                      {projects.rows.length > 0 ? (
                        <ProjectListCompact projects={projects.rows} />
                      ) : (
                        <EmptyState
                          icon={ClipboardList}
                          title="No projects yet"
                          description="Projects of this builder appear here."
                        />
                      )}
                    </div>
                  ),
                },
              ]
            : []),
          {
            value: "documents",
            label: `Documents (${documents.length})`,
            content: (
              <DocumentsPanel
                owner="builder"
                ownerId={builder.id}
                documents={documents}
                canManage={canManage}
                categories={["AGREEMENT", "PRICE_SHEET", "LEGAL", "BROCHURE", "OTHER"]}
                defaultCategory="AGREEMENT"
                defaultInternal
              />
            ),
          },
          {
            value: "leads",
            label: "Leads",
            content: (
              <EmptyState
                icon={ClipboardList}
                title="Builder-wise leads"
                description="Leads for this builder's projects will be listed here, with their status and owner."
              />
            ),
          },
          {
            value: "performance",
            label: "Performance",
            content: (
              <EmptyState
                icon={ChartColumn}
                title="Builder performance"
                description="Leads, site visits, bookings and revenue for this builder will be summarised here."
              />
            ),
          },
        ]}
      />
    </>
  );
}
