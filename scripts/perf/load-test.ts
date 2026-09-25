/**
 * Load test of dashboards and reports (M10-19). Creates (or reuses) an organization "Load Test Realty" with
 * ~60 members, 200,000 leads and ~2,000,000 activities spread over the last year, fills the daily statistics, then
 * times the metric queries dashboards and reports run, for an organization-wide and a team scope.
 *
 *   pnpm perf:load            # seed if missing, then measure
 *   pnpm perf:load --drop     # delete the load-test organization
 *
 * Data is inserted with SQL (generate_series), not through the services — it measures reading, not writing.
 */
import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";

import { seedActivityMasters } from "@/modules/activities/server/masters";
import { refreshDailyStats } from "@/modules/analytics/server/aggregates";
import {
  getAgendaToday,
  getFunnel,
  getProjectPerformance,
  getSourcePerformance,
} from "@/modules/analytics/server/insights";
import {
  getMemberMetrics,
  getMetricSeries,
  getMetricSummary,
  getPipeline,
  resolveReportScope,
} from "@/modules/analytics/server/metrics";
import { resolveReportParams } from "@/modules/analytics/server/report-params";
import { bookingsReport, lostReport } from "@/modules/analytics/server/reports/deals";
import { leadReportRows } from "@/modules/analytics/server/reports/leads";
import { seedAssignmentMasters } from "@/modules/assignment/server/reasons";
import { seedCatalogMasters } from "@/modules/catalog/server/masters";
import { seedDealMasters } from "@/modules/deals/server/masters";
import { syncSystemRoles } from "@/modules/identity/server/roles";
import { seedLeadMasters } from "@/modules/leads/server/masters";
import { prisma } from "@/platform/db/client";
import { createTenantDb } from "@/platform/db/tenant-scope";
import { stopBoss } from "@/platform/jobs/boss";
import { createMemberContext } from "@/platform/tenant/member-context";

const SLUG = "load-test-realty";
const LEADS = Number(process.env.LOAD_LEADS ?? 200_000);
const CALLS = Number(process.env.LOAD_CALLS ?? 1_400_000);
const FOLLOW_UPS = Number(process.env.LOAD_FOLLOW_UPS ?? 500_000);
const VISITS = Number(process.env.LOAD_VISITS ?? 80_000);
const BOOKINGS = Number(process.env.LOAD_BOOKINGS ?? 12_000);
const MANAGERS = 6;
const EXECUTIVES = 54;

async function drop() {
  const organization = await prisma.organization.findUnique({ where: { slug: SLUG } });
  if (!organization) return console.log("Nothing to drop.");
  await prisma.organization.delete({ where: { id: organization.id } });
  console.log("Load-test organization deleted.");
}

async function seed(): Promise<string> {
  const existing = await prisma.organization.findUnique({ where: { slug: SLUG } });
  if (existing) {
    console.log("Reusing the existing load-test organization.");
    return existing.id;
  }
  const started = performance.now();
  const organization = await prisma.organization.create({
    data: { name: "Load Test Realty", slug: SLUG },
  });
  const orgId = organization.id;
  await prisma.organizationSetting.create({ data: { organizationId: orgId } });
  const db = createTenantDb(orgId);
  await syncSystemRoles(db, orgId);
  await seedCatalogMasters(db, orgId);
  await seedLeadMasters(db, orgId);
  await seedAssignmentMasters(db, orgId);
  await seedActivityMasters(db, orgId);
  await seedDealMasters(db, orgId);
  const roles = await prisma.role.findMany({ where: { organizationId: orgId } });
  const role = (key: string) => roles.find((entry) => entry.key === key)!.id;
  const member = async (name: string, roleId: string, reportsToId: string | null) => {
    const user = await prisma.user.create({
      data: { name, email: `${randomUUID().slice(0, 12)}@load.test` },
    });
    return prisma.membership.create({
      data: {
        organizationId: orgId,
        userId: user.id,
        roleId,
        reportsToId,
        status: "ACTIVE",
        joinedAt: new Date(),
      },
    });
  };
  const admin = await member("Load Admin", role("admin"), null);
  const managers = [];
  for (let index = 0; index < MANAGERS; index += 1) {
    managers.push(await member(`Manager ${index + 1}`, role("manager"), admin.id));
  }
  for (let index = 0; index < EXECUTIVES; index += 1) {
    await member(`Executive ${index + 1}`, role("executive"), managers[index % MANAGERS]!.id);
  }
  for (let builder = 1; builder <= 20; builder += 1) {
    const created = await prisma.builder.create({
      data: { organizationId: orgId, code: `LB-${builder}`, name: `Builder ${builder}` },
    });
    for (let project = 1; project <= 3; project += 1) {
      await prisma.project.create({
        data: {
          organizationId: orgId,
          builderId: created.id,
          code: `LP-${builder}-${project}`,
          name: `Project ${builder}.${project}`,
        },
      });
    }
  }
  console.log("Masters and members ready; inserting activity…");
  const org = orgId;
  const sql = (text: string) => prisma.$executeRawUnsafe(text.replaceAll(":org", `'${org}'::uuid`));
  // Helper arrays as temporary tables.
  await sql(
    `CREATE TEMP TABLE lt_members AS SELECT id, row_number() OVER (ORDER BY id) AS n FROM memberships WHERE organization_id = :org AND role_id IN (SELECT id FROM roles WHERE organization_id = :org AND key = 'executive')`,
  );
  await sql(
    `CREATE TEMP TABLE lt_statuses AS SELECT id, key, row_number() OVER (ORDER BY sort_order) AS n FROM lead_statuses WHERE organization_id = :org`,
  );
  await sql(
    `CREATE TEMP TABLE lt_sources AS SELECT id, row_number() OVER (ORDER BY id) AS n FROM lead_sources WHERE organization_id = :org`,
  );
  await sql(
    `CREATE TEMP TABLE lt_projects AS SELECT id, builder_id, row_number() OVER (ORDER BY id) AS n FROM projects WHERE organization_id = :org`,
  );
  await sql(
    `CREATE TEMP TABLE lt_outcomes AS SELECT id, connected, row_number() OVER (ORDER BY id) AS n FROM call_outcomes WHERE organization_id = :org`,
  );
  const counts = await prisma.$queryRawUnsafe<
    { members: number; statuses: number; sources: number; projects: number; outcomes: number }[]
  >(
    `SELECT (SELECT count(*) FROM lt_members)::int AS members, (SELECT count(*) FROM lt_statuses)::int AS statuses,
            (SELECT count(*) FROM lt_sources)::int AS sources, (SELECT count(*) FROM lt_projects)::int AS projects,
            (SELECT count(*) FROM lt_outcomes)::int AS outcomes`,
  );
  const c = counts[0]!;
  await sql(`
    INSERT INTO leads (id, organization_id, number, name, mobile, status_id, owner_id, owner_assigned_at, source_id,
      created_at, updated_at, status_changed_at, last_activity_at, first_visit_at, booked_at, closed_at, lost_at)
    SELECT gen_random_uuid(), :org, 'LT-' || lpad(g::text, 7, '0'), 'Load Lead ' || g, '98' || lpad(g::text, 8, '0'),
      (SELECT id FROM lt_statuses WHERE n = 1 + (g % ${c.statuses})),
      (SELECT id FROM lt_members WHERE n = 1 + (g % ${c.members})),
      now() - ((g % 365) || ' days')::interval,
      (SELECT id FROM lt_sources WHERE n = 1 + (g % ${c.sources})),
      now() - ((g % 365) || ' days')::interval - ((g % 24) || ' hours')::interval, now(), now(), now() - ((g % 30) || ' days')::interval,
      CASE WHEN g % 5 = 0 THEN now() - ((g % 300) || ' days')::interval END,
      CASE WHEN g % 17 = 0 THEN now() - ((g % 250) || ' days')::interval END,
      CASE WHEN g % 34 = 0 THEN now() - ((g % 200) || ' days')::interval END,
      CASE WHEN g % 9 = 0 THEN now() - ((g % 200) || ' days')::interval END
    FROM generate_series(1, ${LEADS}) g`);
  await sql(
    `CREATE TEMP TABLE lt_leads AS SELECT id, owner_id, row_number() OVER (ORDER BY id) AS n FROM leads WHERE organization_id = :org`,
  );
  await sql(`CREATE INDEX ON lt_leads (n)`);
  await sql(`
    INSERT INTO lead_project_interests (organization_id, lead_id, project_id, level, created_at)
    SELECT :org, l.id, (SELECT id FROM lt_projects WHERE n = 1 + (l.n % ${c.projects})), 'MEDIUM', now() FROM lt_leads l`);
  await sql(`
    INSERT INTO call_logs (id, organization_id, lead_id, caller_id, caller_name, direction, started_at, connected, outcome_id,
      duration_seconds, created_at, updated_at)
    SELECT gen_random_uuid(), :org, l.id, l.owner_id, 'x', 'OUTBOUND', now() - ((g % 365) || ' days')::interval - ((g % 600) || ' minutes')::interval,
      o.connected, o.id, CASE WHEN o.connected THEN 30 + g % 400 ELSE 0 END, now(), now()
    FROM generate_series(1, ${CALLS}) g
    JOIN lt_leads l ON l.n = 1 + (g % ${LEADS})
    JOIN lt_outcomes o ON o.n = 1 + (g % ${c.outcomes})`);
  await sql(`
    INSERT INTO follow_ups (id, organization_id, lead_id, type, status, assigned_to_id, due_at, created_by_name, completed_at,
      completed_by_id, missed_at, created_at, updated_at)
    SELECT gen_random_uuid(), :org, l.id, CASE WHEN g % 4 = 0 THEN 'CALLBACK' ELSE 'FOLLOW_UP' END::"FollowUpType",
      (CASE WHEN g % 10 < 6 THEN 'COMPLETED' WHEN g % 10 < 8 THEN 'MISSED' WHEN g % 10 = 8 THEN 'SCHEDULED' ELSE 'CANCELLED' END)::"FollowUpStatus",
      l.owner_id, now() - ((g % 365 - 5) || ' days')::interval, 'x',
      CASE WHEN g % 10 < 6 THEN now() - ((g % 365 - 5) || ' days')::interval + interval '2 hours' END,
      CASE WHEN g % 10 < 6 THEN l.owner_id END,
      CASE WHEN g % 10 IN (6, 7) THEN now() - ((g % 365 - 5) || ' days')::interval + interval '1 day' END, now(), now()
    FROM generate_series(1, ${FOLLOW_UPS}) g JOIN lt_leads l ON l.n = 1 + (g % ${LEADS})`);
  await sql(`
    INSERT INTO site_visits (id, organization_id, lead_id, project_id, builder_id, number, is_revisit, scheduled_at, status,
      assigned_to_id, completed_at, no_show_at, created_by_name, created_at, updated_at)
    SELECT gen_random_uuid(), :org, l.id, p.id, p.builder_id, 1 + g % 2, g % 3 = 0, now() - ((g % 365) || ' days')::interval,
      (CASE WHEN g % 7 = 0 THEN 'NO_SHOW' ELSE 'COMPLETED' END)::"SiteVisitStatus", l.owner_id,
      CASE WHEN g % 7 <> 0 THEN now() - ((g % 365) || ' days')::interval + interval '1 hour' END,
      CASE WHEN g % 7 = 0 THEN now() - ((g % 365) || ' days')::interval + interval '1 hour' END, 'x', now(), now()
    FROM generate_series(1, ${VISITS}) g
    JOIN lt_leads l ON l.n = 1 + ((g * 7) % ${LEADS})
    JOIN lt_projects p ON p.n = 1 + (g % ${c.projects})`);
  await sql(`
    INSERT INTO bookings (id, organization_id, number, lead_id, project_id, builder_id, executive_id, customer_name, booking_date,
      status, closed_at, cancelled_at, agreement_value, created_by_name, created_at, updated_at)
    SELECT gen_random_uuid(), :org, 'LTB-' || lpad(g::text, 7, '0'), l.id, p.id, p.builder_id, l.owner_id, 'Load Customer ' || g,
      (now() - ((g % 365) || ' days')::interval)::date,
      (CASE WHEN g % 3 = 0 THEN 'CLOSED_WON' WHEN g % 11 = 0 THEN 'CANCELLED' ELSE 'ACTIVE' END)::"BookingStatus",
      CASE WHEN g % 3 = 0 THEN now() - ((g % 365 - 10) || ' days')::interval END,
      CASE WHEN g % 3 <> 0 AND g % 11 = 0 THEN now() - ((g % 365 - 5) || ' days')::interval END,
      5000000 + (g % 100) * 100000, 'x', now(), now()
    FROM generate_series(1, ${BOOKINGS}) g
    JOIN lt_leads l ON l.n = 1 + ((g * 13) % ${LEADS})
    JOIN lt_projects p ON p.n = 1 + (g % ${c.projects})`);
  await sql(`ANALYZE`);
  console.log(
    `Inserted in ${((performance.now() - started) / 1000).toFixed(0)} s; filling daily statistics…`,
  );
  const today = new Date().toISOString().slice(0, 10);
  const yearAgo = new Date(Date.now() - 366 * 86_400_000).toISOString().slice(0, 10);
  const rows = await refreshDailyStats(db, orgId, {
    from: yearAgo,
    to: today,
    timezone: "Asia/Kolkata",
  });
  console.log(
    `${rows} daily statistics rows in ${((performance.now() - started) / 1000).toFixed(0)} s total.`,
  );
  return orgId;
}

async function time(label: string, run: () => Promise<unknown>, repeat = 5) {
  const samples: number[] = [];
  for (let index = 0; index < repeat; index += 1) {
    const started = performance.now();
    await run();
    samples.push(performance.now() - started);
  }
  samples.sort((a, b) => a - b);
  const p50 = samples[Math.floor(samples.length / 2)]!;
  const max = samples.at(-1)!;
  console.log(
    `${label.padEnd(44)} p50 ${p50.toFixed(0).padStart(5)} ms   max ${max.toFixed(0).padStart(5)} ms`,
  );
  return max;
}

async function measure(orgId: string) {
  const admin = await prisma.membership.findFirstOrThrow({
    where: { organizationId: orgId, reportsToId: null },
  });
  const manager = await prisma.membership.findFirstOrThrow({
    where: { organizationId: orgId, reportsToId: admin.id },
  });
  const executive = await prisma.membership.findFirstOrThrow({
    where: { organizationId: orgId, reportsToId: manager.id },
  });
  const today = new Date().toISOString().slice(0, 10);
  const month = {
    from: new Date(Date.now() - 29 * 86_400_000).toISOString().slice(0, 10),
    to: today,
  };
  const counts = await prisma.$queryRawUnsafe<
    { leads: number; calls: number; followups: number }[]
  >(
    `SELECT (SELECT count(*) FROM leads WHERE organization_id = $1::uuid)::int AS leads,
            (SELECT count(*) FROM call_logs WHERE organization_id = $1::uuid)::int AS calls,
            (SELECT count(*) FROM follow_ups WHERE organization_id = $1::uuid)::int AS followups`,
    orgId,
  );
  console.log(`\nData: ${JSON.stringify(counts[0])}; period ${month.from} → ${month.to}\n`);
  let worst = 0;
  for (const [label, membershipId] of [
    ["organization", admin.id],
    ["team", manager.id],
    ["executive", executive.id],
  ] as const) {
    const ctx = (await createMemberContext(orgId, membershipId))!;
    const scope = await resolveReportScope(ctx);
    const filters = { range: month };
    console.log(`— ${label} scope`);
    const dashboard = await time("dashboard (all queries in parallel)", () =>
      Promise.all([
        getMetricSummary(ctx, filters, scope),
        getMetricSeries(ctx, filters, "day", scope),
        getPipeline(ctx, {}, scope),
        getAgendaToday(ctx, scope),
        getMemberMetrics(ctx, filters, scope),
        getFunnel(ctx, filters, scope),
        label === "organization"
          ? getSourcePerformance(ctx, filters, {}, scope)
          : Promise.resolve(null),
        getProjectPerformance(ctx, filters, scope),
      ]),
    );
    worst = Math.max(worst, dashboard);
    await time("  summary + previous period", () => getMetricSummary(ctx, filters, scope));
    await time("  summary filtered by project (live)", async () => {
      const project = await prisma.project.findFirstOrThrow({ where: { organizationId: orgId } });
      return getMetricSummary(ctx, { ...filters, projectId: project.id }, scope);
    });
    await time("  pipeline (leads now)", () => getPipeline(ctx, {}, scope));
    await time("  funnel", () => getFunnel(ctx, filters, scope));
    const report = await resolveReportParams(ctx, { period: "last_30_days", group: "project" });
    await time("  bookings report", () => bookingsReport(ctx, report));
    await time("  lost report", () => lostReport(ctx, report));
    await time("  lead database page", () => leadReportRows(ctx, report, { skip: 0, take: 50 }));
  }
  console.log(`\nWorst dashboard load: ${worst.toFixed(0)} ms (target p95 < 1500 ms).`);
}

async function main() {
  if (process.argv.includes("--drop")) return drop();
  const orgId = await seed();
  await measure(orgId);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await stopBoss().catch(() => undefined);
    await prisma.$disconnect();
  });
