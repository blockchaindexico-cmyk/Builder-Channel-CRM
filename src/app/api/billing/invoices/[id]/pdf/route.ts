import { TZDate } from "@date-fns/tz";
import { format } from "date-fns";

import { getInvoicePdf } from "@/modules/billing/server/documents";
import { getRegionalSettings } from "@/modules/organization";
import { isAppError } from "@/platform/errors";
import { logger } from "@/platform/logger";
import { getRequestContext } from "@/platform/tenant/request-context";

/** Invoice PDF (M09-08): shown in the browser, or downloaded with `?download=1`. */
export async function GET(
  request: Request,
  { params }: RouteContext<"/api/billing/invoices/[id]/pdf">,
) {
  const ctx = await getRequestContext();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return Response.json({ error: "Not found." }, { status: 404 });
  try {
    const regional = await getRegionalSettings(ctx);
    const today = format(new TZDate(new Date(), regional.timezone), "yyyy-MM-dd");
    const pdf = await getInvoicePdf(ctx, id, today);
    const download = new URL(request.url).searchParams.get("download") === "1";
    return new Response(new Uint8Array(pdf.body).buffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${pdf.fileName}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    if (isAppError(error)) {
      return Response.json({ error: error.message }, { status: error.httpStatus });
    }
    logger.error({ err: error, requestId: ctx.requestId }, "invoice PDF failed");
    return Response.json({ error: "The PDF could not be created." }, { status: 500 });
  }
}
