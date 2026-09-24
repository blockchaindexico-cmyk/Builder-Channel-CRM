import { NextResponse } from "next/server";

import { runHealthChecks } from "@/platform/health";

/**
 * Liveness/readiness endpoint (M01-17) for load balancers and uptime monitors.
 * 200 when the database is reachable (storage/worker problems report "degraded"), 503 otherwise.
 */
export async function GET() {
  const report = await runHealthChecks();
  return NextResponse.json(report, {
    status: report.status === "down" ? 503 : 200,
    headers: { "Cache-Control": "no-store" },
  });
}
