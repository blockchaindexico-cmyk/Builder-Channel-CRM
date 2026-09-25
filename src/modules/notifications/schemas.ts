import { z } from "zod";

const channel = z.enum(["IN_APP", "EMAIL"]);

export const notificationSettingsSchema = z.object({
  /** Organization overrides per type: switched off, or other default channels. */
  types: z
    .record(z.string(), z.object({ enabled: z.boolean(), channels: z.array(channel).max(2) }))
    .default({}),
  /** Default for "remind me … before" (used by follow-ups and visits). */
  reminderLeadMinutes: z.number().int().min(0).max(1440).default(15),
  digestEnabled: z.boolean().default(true),
  /** Local time (organization time zone) of the daily summary, "HH:mm". */
  digestTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:mm, e.g. 08:30")
    .default("08:30"),
});
export type NotificationSettings = z.output<typeof notificationSettingsSchema>;

export const preferenceSchema = z.object({
  type: z.string().min(1).max(80),
  channel,
  enabled: z.boolean(),
});

const optionalDate = z
  .union([z.literal(""), z.iso.datetime({ offset: true })])
  .nullable()
  .optional()
  .transform((value) => (value ? new Date(value) : null));

export const announcementSchema = z
  .object({
    title: z.string().trim().min(3, "Give it a title").max(120),
    body: z.string().trim().min(3, "Write the announcement").max(4000),
    audience: z.enum(["ALL", "ROLES", "TEAM"]).default("ALL"),
    roleIds: z.array(z.uuid()).max(20).default([]),
    teamOfId: z
      .union([z.literal(""), z.uuid()])
      .nullable()
      .optional()
      .transform((value) => value || null),
    /** Empty = keep as a draft. */
    publishedAt: optionalDate,
    expiresAt: optionalDate,
  })
  .superRefine((value, ctx) => {
    if (value.audience === "ROLES" && value.roleIds.length === 0) {
      ctx.addIssue({ code: "custom", path: ["roleIds"], message: "Choose at least one role" });
    }
    if (value.audience === "TEAM" && !value.teamOfId) {
      ctx.addIssue({ code: "custom", path: ["teamOfId"], message: "Choose whose team" });
    }
    if (value.publishedAt && value.expiresAt && value.expiresAt <= value.publishedAt) {
      ctx.addIssue({
        code: "custom",
        path: ["expiresAt"],
        message: "The end must be after the start",
      });
    }
  });
export type AnnouncementInput = z.input<typeof announcementSchema>;
