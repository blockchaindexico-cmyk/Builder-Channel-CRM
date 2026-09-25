import { Prisma } from "@/generated/prisma/client";

import type { DimensionFilters } from "./member-daily";
import type { ReportScope } from "./metrics";

/**
 * SQL fragments for lead-based figures (pipeline, funnel, sources): leads owned by the scope's members — plus
 * unassigned leads for team and organization views without a person filter — and the dimension filters.
 * The lead table must be aliased `l`.
 */
export function leadOwnerSql(
  scope: ReportScope,
  filters: { managerId?: string | null; executiveId?: string | null },
): { sql: Prisma.Sql; includesUnassigned: boolean } {
  const includesUnassigned = scope.scope !== "OWN" && !filters.executiveId && !filters.managerId;
  const members = scope.memberIds;
  if (!members) return { sql: Prisma.sql`TRUE`, includesUnassigned };
  return {
    sql: includesUnassigned
      ? Prisma.sql`(l."owner_id" = ANY(${members}::uuid[]) OR l."owner_id" IS NULL)`
      : Prisma.sql`l."owner_id" = ANY(${members}::uuid[])`,
    includesUnassigned,
  };
}

export function leadDimensionSql(dimensions: DimensionFilters): Prisma.Sql {
  const parts: Prisma.Sql[] = [];
  if (dimensions.sourceId) parts.push(Prisma.sql`AND l."source_id" = ${dimensions.sourceId}::uuid`);
  if (dimensions.statusId) parts.push(Prisma.sql`AND l."status_id" = ${dimensions.statusId}::uuid`);
  if (dimensions.projectId) {
    parts.push(Prisma.sql`AND EXISTS (SELECT 1 FROM "lead_project_interests" i WHERE i."organization_id" = l."organization_id"
      AND i."lead_id" = l."id" AND i."project_id" = ${dimensions.projectId}::uuid)`);
  }
  if (dimensions.builderId) {
    parts.push(Prisma.sql`AND EXISTS (SELECT 1 FROM "lead_project_interests" i JOIN "projects" p
      ON p."organization_id" = i."organization_id" AND p."id" = i."project_id"
      WHERE i."organization_id" = l."organization_id" AND i."lead_id" = l."id" AND p."builder_id" = ${dimensions.builderId}::uuid)`);
  }
  return parts.length ? Prisma.join(parts, " ") : Prisma.empty;
}

/** Local-day range bounds in the organization's zone. */
export function rangeSql(range: { from: string; to: string }, timezone: string) {
  return {
    start: Prisma.sql`(${range.from}::date::timestamp AT TIME ZONE ${timezone})`,
    end: Prisma.sql`((${range.to}::date + 1)::timestamp AT TIME ZONE ${timezone})`,
  };
}
