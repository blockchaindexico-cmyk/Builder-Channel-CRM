import "server-only";

import { CalendarClock, PhoneCall } from "lucide-react";

import { EmptyState } from "@/components/shared/empty-state";
import { findVisibleLead, isLeadInScope } from "@/modules/leads";
import { getRequestContext } from "@/platform/tenant/request-context";

import { ACTIVITY_PERMISSIONS } from "../permissions";
import { listLeadCalls } from "../server/calls";
import { listLeadFollowUps } from "../server/follow-ups";
import { canListenToCall } from "../server/recordings";
import { CallList } from "./call-list";
import { FollowUpList } from "./follow-up-list";
import { LogCallDialog } from "./log-call-dialog";
import { ScheduleFollowUpDialog } from "./schedule-follow-up-dialog";

/** "Calls" tab of the lead page (M07-06): the complete calling history. */
export async function LeadCallsPanel({ leadId }: { leadId: string }) {
  const ctx = await getRequestContext();
  const lead = await findVisibleLead(ctx, leadId);
  const [calls, canLog, canListen] = await Promise.all([
    listLeadCalls(ctx, leadId),
    isLeadInScope(ctx, lead, ACTIVITY_PERMISSIONS.callsLog),
    canListenToCall(ctx, { leadId }),
  ]);
  if (calls.length === 0) {
    return (
      <EmptyState
        icon={PhoneCall}
        title="No calls yet"
        description="Every call with this customer, its outcome and notes will be listed here."
        action={canLog ? <LogCallDialog leadId={leadId} /> : undefined}
      />
    );
  }
  return <CallList calls={calls} leadId={leadId} canListen={canListen} canUpload={canLog} />;
}

/** "Follow-ups" tab of the lead page (M07-10, M07-11): open items first, then the history. */
export async function LeadFollowUpsPanel({ leadId }: { leadId: string }) {
  const ctx = await getRequestContext();
  const lead = await findVisibleLead(ctx, leadId);
  const [rows, canManage] = await Promise.all([
    listLeadFollowUps(ctx, leadId),
    isLeadInScope(ctx, lead, ACTIVITY_PERMISSIONS.followUpsManage),
  ]);
  if (rows.length === 0) {
    return (
      <EmptyState
        icon={CalendarClock}
        title="Nothing planned"
        description="Schedule a follow-up or a callback so this lead is not forgotten."
        action={canManage ? <ScheduleFollowUpDialog leadId={leadId} /> : undefined}
      />
    );
  }
  return (
    <FollowUpList
      rows={rows}
      canManage={canManage}
      label="Follow-ups and callbacks"
      now={new Date().toISOString()}
    />
  );
}
