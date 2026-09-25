import { requestReportExport } from "@/modules/analytics/server/exports";
import { REPORT_PARAM_KEYS } from "@/modules/analytics/server/report-params";
import { isAppError } from "@/platform/errors";
import { logger } from "@/platform/logger";
import { getRequestContext } from "@/platform/tenant/request-context";

/**
 * Report export (M10-18): `?report=<key>&format=csv|xlsx` plus the report page's own filters. Summary reports come
 * back as the file; large ones are queued and the browser goes to "My exports". The service checks permissions.
 */
export async function GET(request: Request) {
  const ctx = await getRequestContext();
  const url = new URL(request.url);
  const filters: Record<string, string> = {};
  for (const key of REPORT_PARAM_KEYS) {
    const value = url.searchParams.get(key);
    if (value) filters[key] = value.slice(0, 100);
  }
  try {
    const result = await requestReportExport(ctx, {
      report: url.searchParams.get("report") ?? "",
      format: url.searchParams.get("format") ?? "csv",
      filters: filters as never,
    });
    if (result.kind === "queued") {
      return Response.redirect(new URL(`/reports/exports?queued=${result.exportId}`, url), 303);
    }
    const body = typeof result.body === "string" ? result.body : new Uint8Array(result.body).buffer;
    return new Response(body, {
      headers: {
        "Content-Type": result.contentType,
        "Content-Disposition": `attachment; filename="${result.fileName}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    if (isAppError(error)) {
      return Response.json({ error: error.message }, { status: error.httpStatus });
    }
    logger.error({ err: error, requestId: ctx.requestId }, "report export failed");
    return Response.json({ error: "The export failed. Please try again." }, { status: 500 });
  }
}
