import nodemailer, { type Transporter } from "nodemailer";

import { env } from "@/config/env";
import { logger } from "@/platform/logger";

export interface EmailAttachment {
  filename: string;
  contentType: string;
  /** File content, base64-encoded (messages travel through the job queue as JSON). */
  contentBase64: string;
}

export interface EmailMessage {
  to: string | string[];
  subject: string;
  html: string;
  text: string;
  from?: string;
  replyTo?: string;
  cc?: string[];
  bcc?: string[];
  attachments?: EmailAttachment[];
}

export interface EmailTransport {
  readonly name: "smtp" | "console" | "memory";
  send(message: EmailMessage): Promise<{ messageId: string | null }>;
}

class SmtpTransport implements EmailTransport {
  readonly name = "smtp" as const;
  private readonly transporter: Transporter;

  constructor() {
    this.transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } : undefined,
    });
  }

  async send(message: EmailMessage) {
    const info = await this.transporter.sendMail({
      from: message.from ?? env.EMAIL_FROM,
      to: message.to,
      cc: message.cc,
      bcc: message.bcc,
      replyTo: message.replyTo,
      subject: message.subject,
      html: message.html,
      text: message.text,
      attachments: message.attachments?.map((attachment) => ({
        filename: attachment.filename,
        contentType: attachment.contentType,
        content: Buffer.from(attachment.contentBase64, "base64"),
      })),
    });
    return { messageId: info.messageId ?? null };
  }
}

class ConsoleTransport implements EmailTransport {
  readonly name = "console" as const;

  async send(message: EmailMessage) {
    logger.info(
      {
        to: message.to,
        subject: message.subject,
        preview: message.text.slice(0, 500),
        attachments: message.attachments?.map((attachment) => attachment.filename),
      },
      "e-mail (console transport — not delivered)",
    );
    return { messageId: null };
  }
}

/** Captures messages in memory; used by tests. */
export class MemoryTransport implements EmailTransport {
  readonly name = "memory" as const;
  readonly sent: EmailMessage[] = [];

  async send(message: EmailMessage) {
    this.sent.push(message);
    return { messageId: `memory-${this.sent.length}` };
  }
}

const globalForEmail = globalThis as unknown as { __crmEmailTransport?: EmailTransport };

function createTransport(): EmailTransport {
  switch (env.EMAIL_TRANSPORT) {
    case "smtp":
      return new SmtpTransport();
    case "memory":
      return new MemoryTransport();
    default:
      return new ConsoleTransport();
  }
}

export function getEmailTransport(): EmailTransport {
  globalForEmail.__crmEmailTransport ??= createTransport();
  return globalForEmail.__crmEmailTransport;
}

export function setEmailTransportForTesting(transport: EmailTransport | undefined): void {
  globalForEmail.__crmEmailTransport = transport;
}
