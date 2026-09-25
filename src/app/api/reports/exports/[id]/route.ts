import { readExportFile } from "@/modules/analytics/server/exports";
import { isAppError } from "@/platform/errors";
import { getRequestContext } from "@/platform/tenant/request-context";

/** Downloads one of the member's own report exports (M10-18). */
export async function GET(
  _request: Request,
  { params }: RouteContext<"/api/reports/exports/[id]">,
) {
  const ctx = await getRequestContext();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return Response.json({ error: "Not found." }, { status: 404 });
  try {
    const file = await readExportFile(ctx, id);
    return new Response(new Uint8Array(file.body).buffer, {
      headers: {
        "Content-Type": file.contentType,
        "Content-Disposition": `attachment; filename="${file.fileName}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    if (isAppError(error))
      return Response.json({ error: error.message }, { status: error.httpStatus });
    throw error;
  }
}
