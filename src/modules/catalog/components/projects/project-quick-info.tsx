"use client";

import { Download, ExternalLink, MapPin } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { useFormatters } from "@/components/shared/regional-settings";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { actionErrorMessage } from "@/lib/action-result";
import { formatMonthYear } from "@/lib/format";

import { getDocumentUrlAction, getProjectQuickInfoAction } from "../../actions";
import { DOCUMENT_CATEGORIES } from "../../schemas";
import type { ProjectQuickInfo } from "../../server/projects";
import { AreaRange, PriceRange } from "../shared/price-range";
import { InactiveBadge, ProjectStatusBadge } from "../shared/project-status-badge";

/**
 * Project quick-info drawer (M03-09): everything an executive needs to answer a caller — configurations,
 * prices, possession, amenities, highlights and shareable documents. Reused on the lead page (M04).
 */
export function ProjectQuickInfoSheet({
  projectId,
  onOpenChange,
}: {
  projectId: string | null;
  onOpenChange: (open: boolean) => void;
}) {
  const format = useFormatters();
  const [info, setInfo] = useState<{ id: string; data: ProjectQuickInfo } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!projectId || info?.id === projectId) return;
    let cancelled = false;
    void getProjectQuickInfoAction({ projectId }).then((result) => {
      if (cancelled) return;
      const message = actionErrorMessage(result);
      if (message || !result?.data) setError(message ?? "The project could not be loaded.");
      else {
        setError(null);
        setInfo({ id: projectId, data: result.data });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [projectId, info?.id]);

  const project = info && info.id === projectId ? info.data : null;

  async function download(documentId: string) {
    const result = await getDocumentUrlAction({
      owner: "project",
      documentId,
      disposition: "attachment",
    });
    const message = actionErrorMessage(result);
    if (message || !result?.data)
      return void toast.error(message ?? "The document could not be opened.");
    window.open(result.data.url, "_blank", "noopener,noreferrer");
  }

  return (
    <Sheet open={projectId !== null} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        {project ? (
          <>
            <SheetHeader>
              <SheetTitle className="flex flex-wrap items-center gap-2">
                {project.name} <ProjectStatusBadge status={project.status} />
                {!project.isActive ? <InactiveBadge /> : null}
              </SheetTitle>
              <SheetDescription>
                {project.builder.name} · {project.code}
                {project.reraNumber ? ` · RERA ${project.reraNumber}` : ""}
              </SheetDescription>
            </SheetHeader>
            <div className="space-y-6 px-4 pb-6 text-sm">
              <dl className="grid grid-cols-2 gap-4">
                <div>
                  <dt className="text-muted-foreground">Price</dt>
                  <dd className="font-medium">
                    <PriceRange min={project.priceMin} max={project.priceMax} />
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Possession</dt>
                  <dd className="font-medium">
                    {formatMonthYear(project.possessionDate)}
                    {project.possessionNote ? (
                      <span className="block text-xs font-normal text-muted-foreground">
                        {project.possessionNote}
                      </span>
                    ) : null}
                  </dd>
                </div>
                <div className="col-span-2">
                  <dt className="text-muted-foreground">Location</dt>
                  <dd className="flex items-start gap-1">
                    <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                    <span>
                      {[project.addressLine, project.locality, project.city]
                        .filter(Boolean)
                        .join(", ") || "—"}
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
                  </dd>
                </div>
              </dl>

              {project.configurations.length > 0 ? (
                <section className="space-y-2">
                  <h3 className="font-medium">Configurations</h3>
                  <ul className="divide-y rounded-md border">
                    {project.configurations.map((configuration) => (
                      <li
                        key={configuration.id}
                        className="flex items-center justify-between gap-3 px-3 py-2"
                      >
                        <span>
                          <span className="font-medium">{configuration.name}</span>
                          {configuration.notes ? (
                            <span className="text-muted-foreground"> · {configuration.notes}</span>
                          ) : null}
                          <span className="block text-xs text-muted-foreground">
                            <AreaRange
                              min={configuration.carpetAreaMin}
                              max={configuration.carpetAreaMax}
                            />
                          </span>
                        </span>
                        <PriceRange min={configuration.priceMin} max={configuration.priceMax} />
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}

              {project.highlights.length > 0 ? (
                <section className="space-y-2">
                  <h3 className="font-medium">Highlights</h3>
                  <ul className="list-disc space-y-1 pl-5">
                    {project.highlights.map((highlight) => (
                      <li key={highlight}>{highlight}</li>
                    ))}
                  </ul>
                </section>
              ) : null}

              {project.amenities.length > 0 ? (
                <section className="space-y-2">
                  <h3 className="font-medium">Amenities</h3>
                  <div className="flex flex-wrap gap-1.5">
                    {project.amenities.map((amenity) => (
                      <Badge key={amenity.id} variant="secondary">
                        {amenity.name}
                      </Badge>
                    ))}
                  </div>
                </section>
              ) : null}

              {project.documents.length > 0 ? (
                <section className="space-y-2">
                  <h3 className="font-medium">Documents to share</h3>
                  <ul className="space-y-1">
                    {project.documents.map((document) => (
                      <li key={document.id} className="flex items-center justify-between gap-2">
                        <span>
                          {document.title}{" "}
                          <span className="text-xs text-muted-foreground">
                            {
                              DOCUMENT_CATEGORIES.find(
                                (category) => category.value === document.category,
                              )?.label
                            }
                          </span>
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => void download(document.id)}
                        >
                          <Download /> Download
                        </Button>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}

              <p className="text-xs text-muted-foreground">
                Updated {format.date(project.updatedAt)} ·{" "}
                <Link href={`/projects/${project.id}`} className="text-primary hover:underline">
                  Open full project
                </Link>
              </p>
            </div>
          </>
        ) : (
          <div className="space-y-4 p-4">
            <SheetHeader className="p-0">
              <SheetTitle>{error ? "Could not load the project" : "Loading project…"}</SheetTitle>
              <SheetDescription>{error ?? "Fetching the latest details."}</SheetDescription>
            </SheetHeader>
            {!error ? (
              <>
                <Skeleton className="h-6 w-2/3" />
                <Skeleton className="h-24 w-full" />
                <Skeleton className="h-24 w-full" />
              </>
            ) : null}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
