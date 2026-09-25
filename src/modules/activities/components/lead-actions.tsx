import "server-only";

import type { LeadActionTarget } from "@/modules/leads";
import { isLeadInScope } from "@/modules/leads";
import { getRequestContext } from "@/platform/tenant/request-context";

import { ACTIVITY_PERMISSIONS } from "../permissions";
import { LogCallDialog } from "./log-call-dialog";
import { ScheduleFollowUpDialog } from "./schedule-follow-up-dialog";

/** "Log call" and "Schedule follow-up" in the lead page header, for people allowed to on this lead (M07-04). */
export async function LeadActivityActions({ lead }: { lead: LeadActionTarget }) {
  const ctx = await getRequestContext();
  const [canLog, canSchedule] = await Promise.all([
    isLeadInScope(ctx, lead, ACTIVITY_PERMISSIONS.callsLog),
    isLeadInScope(ctx, lead, ACTIVITY_PERMISSIONS.followUpsManage),
  ]);
  return (
    <>
      {canLog ? <LogCallDialog leadId={lead.id} /> : null}
      {canSchedule ? <ScheduleFollowUpDialog leadId={lead.id} /> : null}
    </>
  );
}
