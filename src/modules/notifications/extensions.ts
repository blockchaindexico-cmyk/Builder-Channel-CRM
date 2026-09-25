import type { NotificationPriority } from "@/generated/prisma/enums";
import type { ServiceContext } from "@/platform/tenant/context";

/**
 * Server-side extension points owned by the notifications module (M06).
 *
 * - `notifications.alert-rule`: scheduled checks that alert people, evaluated hourly during working hours
 *   (M06-11). M07 adds overdue follow-ups, M08 missed site visits.
 * - `notifications.digest-section`: blocks of the daily summary (M06-12).
 */
export interface AlertCandidate {
  recipientId: string;
  /** A registered notification type, e.g. "team.unworked_leads". */
  type: string;
  /** The same key is sent once: include the period, e.g. `unworked:<member>:<local date>`. */
  dedupeKey: string;
  title: string;
  body?: string | null;
  link?: string | null;
  priority?: NotificationPriority;
}

export interface AlertRule {
  key: string;
  label: string;
  /** Returns the alerts due now; the engine de-duplicates them by `dedupeKey`. */
  evaluate(ctx: ServiceContext, now: Date): Promise<AlertCandidate[]>;
}

export interface DigestLine {
  label: string;
  value: number;
  /** Shown instead of `value` when set, e.g. a formatted amount (`value` still decides `attention`). */
  display?: string;
  /** Path in the app that lists what is counted. */
  link?: string | null;
  /** Worth attention when above zero (shown in bold). */
  attention?: boolean;
}

export interface DigestBlock {
  title: string;
  lines: DigestLine[];
}

export interface DigestSection {
  key: string;
  order: number;
  /**
   * `ctx` acts as the recipient (a manager or an admin): their permissions and data scope apply, so the section
   * counts what they are responsible for. Return null to leave the section out.
   */
  build(ctx: ServiceContext, now: Date): Promise<DigestBlock | null>;
}

declare module "@/platform/registry/server" {
  interface ServerExtensionMap {
    "notifications.alert-rule": AlertRule;
    "notifications.digest-section": DigestSection;
  }
}
