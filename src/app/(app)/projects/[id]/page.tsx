import { ExternalLink, Sparkles } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/shared/page-header";
import { UrlTabs } from "@/components/shared/url-tabs";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCalendarDate, formatMonthYear } from "@/lib/format";
import { CATALOG_PERMISSIONS } from "@/modules/catalog";
import { MediaGallery } from "@/modules/catalog/components/projects/media-gallery";
import { ProjectActions } from "@/modules/catalog/components/projects/project-actions";
import { DocumentsPanel } from "@/modules/catalog/components/shared/documents-panel";
import { AreaRange, PriceRange } from "@/modules/catalog/components/shared/price-range";
import {
  InactiveBadge,
  ProjectStatusBadge,
} from "@/modules/catalog/components/shared/project-status-badge";
import { listDocuments, listProjectImages } from "@/modules/catalog/server/documents";
import { getProject } from "@/modules/catalog/server/projects";
import { getRegionalSettings } from "@/modules/organization";
import { loadOrNotFound, routeId } from "@/platform/pages";
import { requirePermission } from "@/platform/rbac/guard";
import { getRequestContext } from "@/platform/tenant/request-context";

export const metadata: Metadata = { title: "Project" };

/** Project detail (M03-08): overview, configurations & pricing, gallery and documents. */
export default async function ProjectDetailPage({ params }: PageProps<"/projects/[id]">) {
  const ctx = await getRequestContext();
  requirePermission(ctx, CATALOG_PERMISSIONS.projectsView);
  const project = await loadOrNotFound(getProject(ctx, routeId((await params).id)));
  const canManage = ctx.permissions.has(CATALOG_PERMISSIONS.projectsManage);
  const canManageFiles = ctx.permissions.has(CATALOG_PERMISSIONS.projectFilesManage);
  const canViewBuilders = ctx.permissions.has(CATALOG_PERMISSIONS.buildersView);
  const [documents, images, regional] = await Promise.all([
    listDocuments(ctx, "project", project.id),
    listProjectImages(ctx, project.id),
    getRegionalSettings(ctx),
  ]);
  const files = documents.filter((document) => document.category !== "IMAGE");
  const location = [
    project.addressLine,
    project.locality,
    project.city,
    project.state,
    project.postalCode,
  ]
    .filter(Boolean)
    .join(", ");

  const facts: [string, React.ReactNode][] = [
    [
      "Builder",
      canViewBuilders ? (
        <Link
          key="b"
          href={`/builders/${project.builder.id}`}
          className="text-primary hover:underline"
        >
          {project.builder.name}
        </Link>
      ) : (
        project.builder.name
      ),
    ],
    ["Price", <PriceRange key="p" min={project.priceMin} max={project.priceMax} compact={false} />],
    [
      "Possession",
      project.possessionDate ? (
        <span key="pos">
          {formatMonthYear(project.possessionDate)}
          {project.possessionNote ? (
            <span className="block text-xs text-muted-foreground">{project.possessionNote}</span>
          ) : null}
        </span>
      ) : (
        project.possessionNote
      ),
    ],
    ["Launch", project.launchDate ? formatCalendarDate(project.launchDate, regional) : null],
    ["RERA number", project.reraNumber],
    ["Property types", project.propertyTypes.map((type) => type.name).join(", ") || null],
    ["Towers", project.totalTowers],
    ["Units", project.totalUnits],
    ["Land area", project.projectArea],
    [
      "Location",
      location ? (
        <span key="loc">
          {location}
          {project.mapUrl ? (
            <a
              href={project.mapUrl}
              target="_blank"
              rel="noreferrer"
              className="ml-2 inline-flex items-center gap-1 text-primary hover:underline"
            >
              Map <ExternalLink className="size-3" />
            </a>
          ) : null}
        </span>
      ) : null,
    ],
  ];

  return (
    <>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-3">
            {project.name} <ProjectStatusBadge status={project.status} />
            {!project.isActive ? <InactiveBadge /> : null}
          </span>
        }
        description={`${project.builder.name} · ${project.code}${project.city ? ` · ${[project.locality, project.city].filter(Boolean).join(", ")}` : ""}`}
        breadcrumbs={[{ label: "Projects", href: "/projects" }, { label: project.name }]}
        actions={
          canManage ? (
            <ProjectActions
              projectId={project.id}
              name={project.name}
              status={project.status}
              isActive={project.isActive}
              builderActive={project.builder.isActive}
            />
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
                    <CardTitle>Key facts</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-[auto_1fr]">
                      {facts.map(([label, value]) => (
                        <div key={label} className="contents">
                          <dt className="text-muted-foreground">{label}</dt>
                          <dd>{value ?? <span className="text-muted-foreground">—</span>}</dd>
                        </div>
                      ))}
                    </dl>
                    {project.description ? (
                      <p className="border-t pt-4 text-sm whitespace-pre-line">
                        {project.description}
                      </p>
                    ) : null}
                  </CardContent>
                </Card>
                <div className="space-y-6">
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Sparkles className="size-4 text-primary" /> Highlights
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="text-sm">
                      {project.highlights.length > 0 ? (
                        <ul className="list-disc space-y-1 pl-5">
                          {project.highlights.map((highlight) => (
                            <li key={highlight}>{highlight}</li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-muted-foreground">No highlights yet.</p>
                      )}
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader>
                      <CardTitle>Amenities</CardTitle>
                    </CardHeader>
                    <CardContent>
                      {project.amenities.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5">
                          {project.amenities.map((amenity) => (
                            <Badge key={amenity.id} variant="secondary">
                              {amenity.name}
                            </Badge>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground">No amenities listed.</p>
                      )}
                    </CardContent>
                  </Card>
                </div>
              </div>
            ),
          },
          {
            value: "pricing",
            label: `Configurations & pricing (${project.configurations.length})`,
            content:
              project.configurations.length > 0 ? (
                <div className="overflow-hidden rounded-lg border">
                  <Table>
                    <TableHeader className="bg-muted/40">
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="px-3">Configuration</TableHead>
                        <TableHead className="px-3">Carpet area</TableHead>
                        <TableHead className="px-3">Price</TableHead>
                        <TableHead className="px-3">Note</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {project.configurations.map((configuration) => (
                        <TableRow key={configuration.id}>
                          <TableCell className="px-3 py-2.5 font-medium">
                            {configuration.name}
                          </TableCell>
                          <TableCell className="px-3">
                            <AreaRange
                              min={configuration.carpetAreaMin}
                              max={configuration.carpetAreaMax}
                            />
                          </TableCell>
                          <TableCell className="px-3">
                            <PriceRange
                              min={configuration.priceMin}
                              max={configuration.priceMax}
                              compact={false}
                            />
                          </TableCell>
                          <TableCell className="px-3 text-muted-foreground">
                            {configuration.notes ?? "—"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <p className="rounded-lg border border-dashed px-6 py-12 text-center text-sm text-muted-foreground">
                  No configurations yet{canManage ? " — add them from Edit." : "."}
                </p>
              ),
          },
          {
            value: "gallery",
            label: `Gallery (${images.length})`,
            content: (
              <MediaGallery
                projectId={project.id}
                images={images.map((image) => ({
                  id: image.id,
                  title: image.title,
                  url: image.url,
                }))}
                canManage={canManageFiles}
              />
            ),
          },
          {
            value: "documents",
            label: `Documents (${files.length})`,
            content: (
              <DocumentsPanel
                owner="project"
                ownerId={project.id}
                documents={files}
                canManage={canManageFiles}
                categories={[
                  "BROCHURE",
                  "FLOOR_PLAN",
                  "PRICE_SHEET",
                  "LEGAL",
                  "AGREEMENT",
                  "OTHER",
                ]}
              />
            ),
          },
        ]}
      />
    </>
  );
}
