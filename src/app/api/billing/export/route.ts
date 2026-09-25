import { exportBillingRegister } from "@/modules/billing/server/export";
import { isAppError } from "@/platform/errors";
import { logger } from "@/platform/logger";
import { getRequestContext } from "@/platform/tenant/request-context";

/**
 * Billing register downloads (M09-14): `?register=deals|invoices|payments|expenses|profit-loss&format=csv|xlsx`
 * with the filters of the page. Generated on request, never stored; the service checks permissions.
 */
export async function GET(request: Request) {
  const ctx = await getRequestContext();
  const params = Object.fromEntries(new URL(request.url).searchParams);
  try {
    const result = await exportBillingRegister(ctx, {
      register: params.register ?? "",
      format: params.format ?? "csv",
      from: params.from,
      to: params.to,
      status: params.status,
      builderId: params.builderId,
      projectId: params.projectId,
      executiveId: params.executiveId,
      managerId: params.managerId,
      category: params.category,
      dimension: params.dimension,
    });
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
    logger.error({ err: error, requestId: ctx.requestId }, "billing export failed");
    return Response.json({ error: "The export failed. Please try again." }, { status: 500 });
  }
}
