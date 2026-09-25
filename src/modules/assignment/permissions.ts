/** Permissions of lead assignment (M05-12). */
export const ASSIGNMENT_PERMISSIONS = {
  /** Give unassigned leads an owner (scope: who may receive them). */
  assign: "leads.assign",
  /** Move owned leads to someone else or back to the queue. */
  reassign: "leads.reassign",
  workloadView: "team.workload.view",
  rulesManage: "assignment_rules.manage",
} as const;
