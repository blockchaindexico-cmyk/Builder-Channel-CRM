import { createElement } from "react";

import { env } from "@/config/env";
import { prisma } from "@/platform/db/client";
import { queueEmail } from "@/platform/email";
import { ActionEmail } from "@/platform/email/templates/action-email";

async function organizationNameFor(userId: string): Promise<string> {
  const membership = await prisma.membership.findFirst({
    where: { userId },
    orderBy: { createdAt: "asc" },
    select: { organization: { select: { name: true } } },
  });
  return membership?.organization.name ?? "Builder Channel CRM";
}

export function passwordSetupUrl(token: string, options: { invite?: boolean } = {}): string {
  const url = new URL("/reset-password", env.APP_URL);
  url.searchParams.set("token", token);
  if (options.invite) url.searchParams.set("invite", "1");
  return url.toString();
}

/** "Reset your password" e-mail (forgot-password flow and admin-triggered resets). */
export async function sendPasswordResetEmail(input: {
  userId: string;
  email: string;
  name: string;
  token: string;
}) {
  const organizationName = await organizationNameFor(input.userId);
  await queueEmail({
    to: input.email,
    subject: `Reset your ${organizationName} password`,
    react: createElement(ActionEmail, {
      preview: "Reset your password",
      organizationName,
      heading: "Reset your password",
      paragraphs: [
        `Hi ${input.name},`,
        "We received a request to reset your password. Use the button below to choose a new one. The link is valid for 1 hour.",
      ],
      actionLabel: "Choose a new password",
      actionUrl: passwordSetupUrl(input.token),
      footnote:
        "If you did not ask for this, you can ignore this e-mail — your password stays the same.",
    }),
  });
}

/** Invitation e-mail for a user created by an administrator (M02-10). */
export async function sendInvitationEmail(input: {
  email: string;
  name: string;
  token: string;
  organizationName: string;
  invitedBy: string;
  validHours: number;
}) {
  await queueEmail({
    to: input.email,
    subject: `You're invited to ${input.organizationName}`,
    react: createElement(ActionEmail, {
      preview: `${input.invitedBy} invited you to ${input.organizationName}`,
      organizationName: input.organizationName,
      heading: `Welcome to ${input.organizationName}`,
      paragraphs: [
        `Hi ${input.name},`,
        `${input.invitedBy} has created an account for you in the ${input.organizationName} CRM. Set your password to get started.`,
        `This link is valid for ${Math.round(input.validHours / 24)} days.`,
      ],
      actionLabel: "Set your password",
      actionUrl: passwordSetupUrl(input.token, { invite: true }),
    }),
  });
}
