import { getNotificationSummary } from "@/modules/notifications/server/center";
import { isAppError } from "@/platform/errors";
import { getRequestContext } from "@/platform/tenant/request-context";

/** Unread count and latest notifications for the bell, polled by the browser (M06-06). */
export async function GET() {
  const ctx = await getRequestContext();
  try {
    const summary = await getNotificationSummary(ctx);
    return Response.json(summary, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (isAppError(error)) {
      return Response.json({ error: error.message }, { status: error.httpStatus });
    }
    throw error;
  }
}
