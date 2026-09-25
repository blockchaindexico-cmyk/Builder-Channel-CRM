/** Permissions of calls, follow-ups & callbacks (M07-18). */
export const ACTIVITY_PERMISSIONS = {
  /** See calls (scope: whose calls — OWN = the member's own). */
  callsView: "calls.view",
  /** Log calls on leads (scope: which leads, by owner). */
  callsLog: "calls.log",
  /** Play call recordings; every playback is audited (PRD §8, §27). */
  recordingsListen: "calls.recordings.listen",
  /** See follow-ups and callbacks (scope: whose). */
  followUpsView: "followups.view",
  /** Schedule, complete, reschedule and cancel follow-ups on leads (scope: which leads, by owner). */
  followUpsManage: "followups.manage",
  /** The team follow-up board (scope: the reporting tree or everyone). */
  teamFollowUpsView: "team.followups.view",
  mastersManage: "activity_masters.manage",
} as const;
