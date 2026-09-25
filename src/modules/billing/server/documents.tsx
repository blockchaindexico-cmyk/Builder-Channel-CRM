import { formatCalendarDate, formatMoney } from "@/lib/format";
import { getRegionalSettings } from "@/modules/organization";
import { recordAudit } from "@/platform/audit";
import { queueEmail } from "@/platform/email";
import { ConflictError } from "@/platform/errors";
import { getStorage } from "@/platform/storage";
import { storeServerFile } from "@/platform/storage/files";
import type { ServiceContext } from "@/platform/tenant/context";
import { parseInput } from "@/platform/validation";

import { INVOICE_PDF_PURPOSE } from "../constants";
import { InvoiceEmail } from "../emails/invoice-email";
import { renderInvoicePdf } from "../pdf/invoice-pdf";
import { BILLING_PERMISSIONS } from "../permissions";
import { sendInvoiceSchema } from "../schemas";
import { getInvoice } from "./invoices";
import { getBillingSettings } from "./settings";

/**
 * Invoice PDFs and e-mail (M09-08). An issued invoice's PDF is rendered once and kept in file storage (its content
 * never changes); drafts and cancelled invoices are rendered on request with a watermark and not stored.
 */
export interface InvoicePdf {
  fileName: string;
  body: Uint8Array;
}

const fileNameOf = (number: string | null) =>
  `${(number ?? "draft-invoice").replace(/[^A-Za-z0-9-]+/g, "-")}.pdf`;

export async function getInvoicePdf(
  ctx: ServiceContext,
  invoiceId: string,
  today: string,
): Promise<InvoicePdf> {
  const invoice = await getInvoice(ctx, invoiceId, today);
  const fileName = fileNameOf(invoice.number);
  const record = await ctx.db.invoice.findFirstOrThrow({
    where: { id: invoiceId },
    select: { pdfFileId: true, pdfFile: { select: { key: true } } },
  });
  const stored = invoice.status !== "DRAFT" && invoice.status !== "CANCELLED";
  if (stored && record.pdfFile) {
    const body = await getStorage().getObject(record.pdfFile.key);
    if (body) return { fileName, body };
  }
  const [regional, settings] = await Promise.all([
    getRegionalSettings(ctx),
    getBillingSettings(ctx.db, ctx),
  ]);
  const body = await renderInvoicePdf({ invoice, regional, terms: settings.terms });
  if (stored) {
    const file = await storeServerFile(ctx, {
      purpose: INVOICE_PDF_PURPOSE,
      fileName,
      contentType: "application/pdf",
      body,
    });
    await ctx.db.invoice.update({ where: { id: invoiceId }, data: { pdfFileId: file.id } });
  }
  return { fileName, body };
}

/** E-mails an issued invoice with its PDF to the builder (queued, retried by the worker). */
export async function sendInvoice(
  ctx: ServiceContext,
  input: { invoiceId: string; to: string; message?: string | null },
  today: string,
): Promise<void> {
  ctx.permissions.assert(BILLING_PERMISSIONS.billingManage);
  const values = parseInput(sendInvoiceSchema, input);
  const invoice = await getInvoice(ctx, values.invoiceId, today);
  if (invoice.status === "DRAFT" || invoice.status === "CANCELLED" || !invoice.number) {
    throw new ConflictError("Only issued invoices can be sent.");
  }
  const pdf = await getInvoicePdf(ctx, invoice.id, today);
  const regional = await getRegionalSettings(ctx);
  const organizationName = invoice.seller?.name ?? "";
  await ctx.db.$transaction(async (tx) => {
    await tx.invoice.update({
      where: { id: invoice.id },
      data: { sentAt: new Date(), sentTo: values.to },
    });
    await recordAudit(tx, ctx, {
      action: "billing.invoice.send",
      entityType: "Invoice",
      entityId: invoice.id,
      summary: `Sent invoice ${invoice.number} to ${values.to}`,
    });
    await queueEmail(
      {
        to: values.to,
        subject: `Invoice ${invoice.number} from ${organizationName}`,
        react: (
          <InvoiceEmail
            organizationName={organizationName}
            invoiceNumber={invoice.number!}
            total={formatMoney(invoice.total, regional)}
            dueDate={invoice.dueDate ? formatCalendarDate(invoice.dueDate, regional) : null}
            message={values.message ?? null}
            senderName={ctx.actor.name}
          />
        ),
        replyTo: invoice.seller?.email || undefined,
        attachments: [
          {
            filename: pdf.fileName,
            contentType: "application/pdf",
            contentBase64: Buffer.from(pdf.body).toString("base64"),
          },
        ],
      },
      { tx },
    );
  });
}
