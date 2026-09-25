import type { Metadata } from "next";

import { PageHeader } from "@/components/shared/page-header";
import { WorkloadBoard } from "@/modules/assignment/components/workload-board";
import { ASSIGNMENT_PERMISSIONS } from "@/modules/assignment/permissions";
import { getTeamWorkload } from "@/modules/assignment/server/workload";
import { requirePermission } from "@/platform/rbac/guard";
import { getRequestContext } from "@/platform/tenant/request-context";

export const metadata: Metadata = { title: "Team workload" };

/** Team workload board (M05-08). */
export default async function TeamWorkloadPage() {
  const ctx = await getRequestContext();
  requirePermission(ctx, ASSIGNMENT_PERMISSIONS.workloadView);
  const workload = await getTeamWorkload(ctx);
  return (
    <>
      <PageHeader
        title="Team workload"
        description="Open leads per person, what has not been started and what is going stale."
      />
      <WorkloadBoard
        workload={workload}
        canAssign={ctx.permissions.has(ASSIGNMENT_PERMISSIONS.assign)}
      />
    </>
  );
}
