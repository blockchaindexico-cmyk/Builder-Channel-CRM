import { render } from "@react-email/components";
import type { PrismaTransactionLike } from "pg-boss";
import type { ReactElement } from "react";

import { enqueueJob } from "@/platform/jobs/enqueue";

import { type EmailMessage, getEmailTransport } from "./transport";

export {
  type EmailMessage,
  type EmailTransport,
  MemoryTransport,
  setEmailTransportForTesting,
} from "./transport";

export const EMAIL_SEND_JOB = "platform.email.send";

export interface ComposeEmailInput {
  to: string | string[];
  subject: string;
  /** React Email element; rendered to HTML and plain text. */
  react: ReactElement;
  replyTo?: string;
  cc?: string[];
  bcc?: string[];
}

export async function renderEmail(element: ReactElement): Promise<{ html: string; text: string }> {
  const [html, text] = await Promise.all([render(element), render(element, { plainText: true })]);
  return { html, text };
}

async function compose(input: ComposeEmailInput): Promise<EmailMessage> {
  const { html, text } = await renderEmail(input.react);
  return {
    to: input.to,
    subject: input.subject,
    html,
    text,
    replyTo: input.replyTo,
    cc: input.cc,
    bcc: input.bcc,
  };
}

/** Sends immediately (use in jobs, or when the caller must know the result). */
export async function sendEmail(input: ComposeEmailInput) {
  return getEmailTransport().send(await compose(input));
}

/**
 * Renders the e-mail now and delivers it from the worker with retries (M01-15). Pass `tx` to enqueue only if
 * the surrounding transaction commits.
 */
export async function queueEmail(
  input: ComposeEmailInput,
  options: { tx?: PrismaTransactionLike } = {},
) {
  const message = await compose(input);
  return enqueueJob(EMAIL_SEND_JOB, message, { tx: options.tx });
}
