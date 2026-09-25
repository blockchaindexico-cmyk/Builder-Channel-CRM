import "server-only";

import { MapPinned } from "lucide-react";

import { EmptyState } from "@/components/shared/empty-state";
import { ACTIVITY_PERMISSIONS } from "@/modules/activities";
import { getRequestContext } from "@/platform/tenant/request-context";

import { DEAL_PERMISSIONS } from "../permissions";
import { getMyVisits } from "../server/visit-lists";
import { VisitList } from "./visit-list";

/** "Site visits" tab of My agenda (M08-06): visits waiting for their outcome, then the next two weeks. */
export async function loadAgendaVisits({ now }: { now: Date }) {
  const ctx = await getRequestContext();
  const { pending, upcoming } = await getMyVisits(ctx, now);
  const abilities = {
    canBook: ctx.permissions.has(DEAL_PERMISSIONS.bookingsManage),
    canMarkLost: ctx.permissions.has(DEAL_PERMISSIONS.markLost),
    canFollowUp: ctx.permissions.has(ACTIVITY_PERMISSIONS.followUpsManage),
  };
  const canManage = ctx.permissions.has(DEAL_PERMISSIONS.visitsManage);
  const count = pending.length + upcoming.length;
  return {
    label: `Site visits (${count})`,
    content:
      count === 0 ? (
        <EmptyState
          icon={MapPinned}
          title="No site visits planned"
          description="Visits you plan from a lead's page show here, with a reminder before each."
        />
      ) : (
        <div className="space-y-4">
          {pending.length ? (
            <section className="space-y-2">
              <h3 className="text-sm font-medium">Waiting for their outcome</h3>
              <VisitList
                rows={pending}
                canManage={canManage}
                abilities={abilities}
                showLead
                showCall
                label="Visits waiting for their outcome"
                now={now.toISOString()}
              />
            </section>
          ) : null}
          {upcoming.length ? (
            <section className="space-y-2">
              <h3 className="text-sm font-medium">Coming up</h3>
              <VisitList
                rows={upcoming}
                canManage={canManage}
                abilities={abilities}
                showLead
                showCall
                label="Upcoming visits"
                now={now.toISOString()}
              />
            </section>
          ) : null}
        </div>
      ),
  };
}
