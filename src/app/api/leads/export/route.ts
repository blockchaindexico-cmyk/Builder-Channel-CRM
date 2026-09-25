import { exportLeads } from "@/modules/leads/server/export";
import { isAppError } from "@/platform/errors";
import { logger } from "@/platform/logger";
import { getRequestContext } from "@/platform/tenant/request-context";

/**
 * Lead export download (M04-19). POST `{ format, query }` exports the list as filtered on screen, `{ format, ids }`
 * the selected rows. The file is generated on request and never stored.
 */
export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (origin && new URL(origin).host !== host) {
    return Response.json({ error: "Cross-site request refused." }, { status: 403 });
  }
  const ctx = await getRequestContext();
  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }
  try {
    const result = await exportLeads(ctx, input as Parameters<typeof exportLeads>[1]);
    const body = typeof result.body === "string" ? result.body : new Uint8Array(result.body).buffer;
    return new Response(body, {
      headers: {
        "Content-Type": result.contentType,
        "Content-Disposition": `attachment; filename="${result.fileName}"`,
        "Cache-Control": "no-store",
        "X-Lead-Count": String(result.count),
      },
    });
  } catch (error) {
    if (isAppError(error)) {
      return Response.json({ error: error.message }, { status: error.httpStatus });
    }
    logger.error({ err: error, requestId: ctx.requestId }, "lead export failed");
    return Response.json({ error: "The export failed. Please try again." }, { status: 500 });
  }
}
