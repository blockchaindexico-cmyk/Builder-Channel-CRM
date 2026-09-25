import { createElement, type ReactElement } from "react";

import { env } from "@/config/env";
import type { Notification } from "@/generated/prisma/client";
import { findMembers } from "@/modules/identity";
import { getOrganizationBranding } from "@/modules/organization";
import { sendEmail } from "@/platform/email";
import { ActionEmail } from "@/platform/email/templates/action-email";
import type { Logger } from "@/platform/logger";
import { createSystemContext, type ServiceContext } from "@/platform/tenant/context";

import { DigestEmail } from "../emails/digest-email";
import type { DigestBlock } from "../extensions";
import { getNotificationType } from "./registry";

interface RenderedEmail {
  subject: string;
  react: ReactElement;
}

/** Renders the e-mail of a notification: the daily summary has its own template, the rest share one. */
export function renderNotificationEmail(
  notification: Pick<Notification, "type" | "title" | "body" | "link" | "data">,
  options: { organizationName?: string; recipientName: string },
): RenderedEmail {
  if (notification.type === "digest.daily" && notification.data) {
    const data = notification.data as unknown as { dateLabel: string; sections: DigestBlock[] };
    return {
      subject: notification.title,
      react: createElement(DigestEmail, {
        organizationName: options.organizationName,
        recipientName: options.recipientName,
        dateLabel: data.dateLabel,
        sections: data.sections,
        appUrl: env.APP_URL,
      }),
    };
  }
  const type = getNotificationType(notification.type);
  return {
    subject: notification.title,
    react: createElement(ActionEmail, {
      preview: notification.body?.split("\n")[0] ?? notification.title,
      organizationName: options.organizationName,
      heading: notification.title,
      paragraphs: (notification.body ?? "")
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean),
      actionLabel: type?.emailAction ?? "Open in the CRM",
      actionUrl: new URL(notification.link ?? "/notifications", env.APP_URL).toString(),
      footnote:
        "You get this e-mail because of your notification settings. You can change them in My profile → Notifications.",
    }),
  };
}

async function organizationName(ctx: ServiceContext): Promise<string | undefined> {
  try {
    return (await getOrganizationBranding(ctx)).name;
  } catch {
    return undefined;
  }
}

/**
 * Sends the e-mail of one notification (M06-04). Retried by the job with backoff; every attempt is counted and the
 * last error kept, so Settings can show what went wrong. Already-sent deliveries are skipped (safe to retry).
 */
export async function deliverNotificationEmail(
  organizationId: string,
  deliveryId: string,
  logger?: Logger,
): Promise<void> {
  const ctx = createSystemContext(organizationId, { name: "Notifications" });
  const delivery = await ctx.db.notificationDelivery.findFirst({
    where: { id: deliveryId },
    include: { notification: true },
  });
  if (!delivery || delivery.status === "SENT") return;

  const [recipient] = await findMembers(ctx.db, { ids: [delivery.notification.recipientId] });
  if (!recipient || recipient.status !== "ACTIVE") {
    await ctx.db.notificationDelivery.update({
      where: { id: delivery.id },
      data: { status: "FAILED", lastError: "The person is no longer active." },
    });
    return;
  }

  const email = renderNotificationEmail(delivery.notification, {
    organizationName: await organizationName(ctx),
    recipientName: recipient.name,
  });
  await ctx.db.notificationDelivery.update({
    where: { id: delivery.id },
    data: { attempts: { increment: 1 } },
  });
  try {
    await sendEmail({ to: recipient.email, subject: email.subject, react: email.react });
  } catch (error) {
    await ctx.db.notificationDelivery.update({
      where: { id: delivery.id },
      data: {
        status: "FAILED",
        lastError: (error instanceof Error ? error.message : String(error)).slice(0, 500),
      },
    });
    throw error;
  }
  await ctx.db.notificationDelivery.update({
    where: { id: delivery.id },
    data: { status: "SENT", sentAt: new Date(), lastError: null },
  });
  logger?.info({ deliveryId, type: delivery.notification.type }, "notification e-mail sent");
}
