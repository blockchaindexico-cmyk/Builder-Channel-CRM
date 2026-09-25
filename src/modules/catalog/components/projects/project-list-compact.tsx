"use client";

import Link from "next/link";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatMonthYear } from "@/lib/format";

import type { ProjectRow } from "../../server/projects";
import { PriceRange } from "../shared/price-range";
import { InactiveBadge, ProjectStatusBadge } from "../shared/project-status-badge";

/** Small projects table for a builder's page. */
export function ProjectListCompact({ projects }: { projects: ProjectRow[] }) {
  return (
    <div className="overflow-hidden rounded-lg border">
      <Table>
        <TableHeader className="bg-muted/40">
          <TableRow className="hover:bg-transparent">
            <TableHead className="px-3">Project</TableHead>
            <TableHead className="px-3">Status</TableHead>
            <TableHead className="px-3">Location</TableHead>
            <TableHead className="px-3">Configurations</TableHead>
            <TableHead className="px-3">Price</TableHead>
            <TableHead className="px-3">Possession</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {projects.map((project) => (
            <TableRow key={project.id}>
              <TableCell className="px-3 py-2.5">
                <Link href={`/projects/${project.id}`} className="flex flex-col hover:underline">
                  <span className="flex items-center gap-2 font-medium">
                    {project.name} {!project.isActive ? <InactiveBadge /> : null}
                  </span>
                  <span className="font-mono text-xs text-muted-foreground">{project.code}</span>
                </Link>
              </TableCell>
              <TableCell className="px-3">
                <ProjectStatusBadge status={project.status} />
              </TableCell>
              <TableCell className="px-3">
                {[project.locality, project.city].filter(Boolean).join(", ") || (
                  <span className="text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell className="px-3">
                {project.configurations.join(", ") || (
                  <span className="text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell className="px-3">
                <PriceRange min={project.priceMin} max={project.priceMax} />
              </TableCell>
              <TableCell className="px-3">{formatMonthYear(project.possessionDate)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
