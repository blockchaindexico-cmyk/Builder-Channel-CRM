import { expect } from "@playwright/test";

const MAILPIT_URL = process.env.MAILPIT_URL ?? "http://localhost:8025";

interface MailpitSummary {
  ID: string;
  Subject: string;
  Created: string;
}

/** Waits for the newest e-mail to `to` received after `since` and returns its text body. */
export async function waitForEmail(
  to: string,
  since: Date,
): Promise<{ subject: string; text: string }> {
  let found: MailpitSummary | undefined;
  await expect
    .poll(
      async () => {
        const response = await fetch(
          `${MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:${to}`)}`,
        );
        const body = (await response.json()) as { messages: MailpitSummary[] };
        found = body.messages.find((message) => new Date(message.Created) >= since);
        return Boolean(found);
      },
      { timeout: 30_000, message: `e-mail to ${to}` },
    )
    .toBe(true);
  const message = (await (await fetch(`${MAILPIT_URL}/api/v1/message/${found!.ID}`)).json()) as {
    Subject: string;
    Text: string;
  };
  return { subject: message.Subject, text: message.Text };
}

/** First link in an e-mail that points to `pathname` (e.g. "/reset-password"). */
export function linkFrom(text: string, pathname: string): string {
  const match = text.match(new RegExp(`https?://[^\\s)\\]]+${pathname}[^\\s)\\]]*`));
  if (!match) throw new Error(`No ${pathname} link in e-mail:\n${text}`);
  const url = new URL(match[0]);
  return `${url.pathname}${url.search}`;
}
