import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { toTableQuery } from "@/lib/table-query";
import { seedActivityMasters } from "@/modules/activities/server/masters";
import { seedAssignmentMasters } from "@/modules/assignment/server/reasons";
import {
  deleteBusinessExpense,
  listBusinessExpenses,
  saveBusinessExpense,
} from "@/modules/billing/server/expenses";
import { exportBillingRegister } from "@/modules/billing/server/export";
import {
  confirmDealFinancial,
  countBookingsWithoutFinancials,
  getDealFinancial,
  listDealFinancials,
  unlockDealFinancial,
  updateDealFinancial,
} from "@/modules/billing/server/financials";
import { billingDigestSection, overdueInvoicesRule } from "@/modules/billing/server/insights";
import {
  cancelInvoice,
  createInvoiceDraft,
  deleteInvoiceDraft,
  getInvoice,
  issueInvoice,
  listBillableDeals,
  listInvoices,
  recordPayment,
  voidPayment,
} from "@/modules/billing/server/invoices";
import {
  getBillingDashboard,
  getCostPerLead,
  getLostOpportunities,
  getProfitAndLoss,
  listPayments,
} from "@/modules/billing/server/reports";
import {
  getBillingSettings,
  seedBillingMasters,
  updateBillingSettings,
} from "@/modules/billing/server/settings";
import { deleteCommissionTerm, saveCommissionTerm } from "@/modules/billing/server/terms";
import { seedCatalogMasters } from "@/modules/catalog/server/masters";
import {
  cancelBooking,
  closeBooking,
  createBooking,
  updateBooking,
} from "@/modules/deals/server/bookings";
import { markLeadLost } from "@/modules/deals/server/closure";
import { seedDealMasters } from "@/modules/deals/server/masters";
import { createLead } from "@/modules/leads/server/leads";
import { seedLeadMasters } from "@/modules/leads/server/masters";
import { getServerRegistry } from "@/modules/registry.server";
import { prisma } from "@/platform/db/client";
import { createTenantDb } from "@/platform/db/tenant-scope";
import { ConflictError, ForbiddenError, ValidationError } from "@/platform/errors";
import { eventHandlerQueueName } from "@/platform/events/define";
import type { DomainEvent } from "@/platform/events/types";
import { stopBoss } from "@/platform/jobs/boss";
import { createSystemContext } from "@/platform/tenant/context";

import { contextFor, createMember, createOrganizationWithRoles } from "../support/identity";

const everything = toTableQuery({ page: 1, pageSize: 100, sort: "", q: "" }, { sortable: [] });
const today = () => new Date().toISOString().slice(0, 10);
const ALL_TIME = { from: "2000-01-01", to: "2099-12-31" };

async function setup() {
  const org = await createOrganizationWithRoles();
  const orgId = org.organization.id;
  const db = createTenantDb(orgId);
  await seedCatalogMasters(db, orgId);
  await seedLeadMasters(db, orgId);
  await seedAssignmentMasters(db, orgId);
  await seedActivityMasters(db, orgId);
  await seedDealMasters(db, orgId);
  await seedBillingMasters(db, orgId);
  await seedBillingMasters(db, orgId);
  const roles = await prisma.role.findMany({ where: { organizationId: orgId } });
  const role = (key: string) => roles.find((entry) => entry.key === key)!;
  const admin = await createMember(orgId, role("admin").id, { name: "Asha Admin" });
  const accounts = await createMember(orgId, role("accounts").id, { name: "Anil Accounts" });
  const manager = await createMember(orgId, role("manager").id, {
    name: "Meera Manager",
    reportsToId: admin.membership.id,
  });
  const exec = await createMember(orgId, role("executive").id, {
    name: "Esha Exec",
    reportsToId: manager.membership.id,
  });
  const m = {
    admin: admin.membership.id,
    accounts: accounts.membership.id,
    manager: manager.membership.id,
    exec: exec.membership.id,
  };
  const ctx = {
    admin: await contextFor(m.admin),
    accounts: await contextFor(m.accounts),
    manager: await contextFor(m.manager),
    exec: await contextFor(m.exec),
  };
  const builder = await prisma.builder.create({
    data: {
      organizationId: orgId,
      code: "BLD-BILL",
      name: "Skyline Developers",
      legalName: "Skyline Developers Pvt Ltd",
      state: "Maharashtra",
      email: "accounts@skyline.test",
    },
  });
  const otherBuilder = await prisma.builder.create({
    data: { organizationId: orgId, code: "BLD-OTH", name: "Orbit Homes", state: "Karnataka" },
  });
  const project = await prisma.project.create({
    data: { organizationId: orgId, builderId: builder.id, code: "PRJ-HILL", name: "Hill View" },
  });
  const premium = await prisma.project.create({
    data: { organizationId: orgId, builderId: builder.id, code: "PRJ-TOP", name: "Sky Towers" },
  });
  const otherProject = await prisma.project.create({
    data: { organizationId: orgId, builderId: otherBuilder.id, code: "PRJ-ORB", name: "Orbit One" },
  });
  const reasons = await prisma.lossReason.findMany({ where: { organizationId: orgId } });
  const reason = (key: string) => reasons.find((entry) => entry.key === key)!.id;
  return { orgId, m, ctx, builder, otherBuilder, project, premium, otherProject, reason, role };
}

let phone = 9850000000;
const nextMobile = () => String((phone += 1));

/** Runs the queued event handlers of one module for an organization (what the worker does). */
async function runHandlers(organizationId: string, prefix: string): Promise<number> {
  const handlers = new Map(
    getServerRegistry()
      .eventHandlers.filter((handler) => handler.name.startsWith(prefix))
      .map((handler) => [eventHandlerQueueName(handler.name), handler]),
  );
  const jobs = await prisma.$queryRawUnsafe<
    { id: string; name: string; data: { event: DomainEvent } }[]
  >(
    `SELECT id, name, data FROM pgboss.job
     WHERE name = ANY($1) AND state = 'created' AND data->'event'->>'organizationId' = $2
     ORDER BY created_on, id`,
    [...handlers.keys()],
    organizationId,
  );
  for (const job of jobs) {
    await handlers.get(job.name)!.handle(job.data.event, createSystemContext(organizationId));
    await prisma.$executeRawUnsafe(`DELETE FROM pgboss.job WHERE id = $1::uuid`, job.id);
  }
  return jobs.length;
}

describe("billing, commission & profit/loss (M09)", () => {
  let env: Awaited<ReturnType<typeof setup>>;

  beforeAll(async () => {
    env = await setup();
  });

  afterAll(async () => {
    await stopBoss();
  });

  /** A lead with a booking of the given value, closed as won; returns the deal financials. */
  async function closedDeal(
    name: string,
    agreementValue: string,
    projectId = env.project.id,
  ): Promise<{ bookingId: string; dealId: string; leadId: string }> {
    const lead = await createLead(env.ctx.exec, { name, mobile: nextMobile() });
    const booking = await createBooking(env.ctx.admin, {
      leadId: lead.id,
      projectId,
      customerName: name,
      unitNumber: "1203",
      tower: "B",
      bookingDate: today(),
      agreementValue,
      executiveId: env.m.exec,
    });
    await closeBooking(env.ctx.admin, { bookingId: booking.id });
    await runHandlers(env.orgId, "billing.");
    const deal = await prisma.dealFinancial.findUniqueOrThrow({
      where: { organizationId_bookingId: { organizationId: env.orgId, bookingId: booking.id } },
    });
    return { bookingId: booking.id, dealId: deal.id, leadId: lead.id };
  }

  it("offers the Accounts role once, with billing permissions and booking values", async () => {
    const accounts = await prisma.role.findMany({
      where: { organizationId: env.orgId, key: "accounts" },
      include: { permissions: true },
    });
    expect(accounts).toHaveLength(1);
    expect(accounts[0]!.permissions.map((grant) => grant.permission).sort()).toEqual([
      "billing.manage",
      "billing.view",
      "bookings.view",
      "bookings.view_value",
      "commission.manage",
      "finance.manage",
      "finance.view",
    ]);
    expect((await getBillingSettings(env.ctx.admin.db, env.ctx.admin)).accountsRoleOffered).toBe(
      true,
    );
  });

  it("keeps billing away from managers and executives", async () => {
    for (const ctx of [env.ctx.manager, env.ctx.exec]) {
      await expect(listDealFinancials(ctx, everything, {})).rejects.toBeInstanceOf(ForbiddenError);
      await expect(listInvoices(ctx, everything, { today: today() })).rejects.toBeInstanceOf(
        ForbiddenError,
      );
      await expect(getProfitAndLoss(ctx, ALL_TIME, "builder")).rejects.toBeInstanceOf(
        ForbiddenError,
      );
      await expect(getBillingDashboard(ctx, ALL_TIME, today())).rejects.toBeInstanceOf(
        ForbiddenError,
      );
      await expect(
        saveCommissionTerm(ctx, null, {
          builderId: env.builder.id,
          type: "PERCENTAGE",
          percentage: "2",
          validFrom: "2020-01-01",
        }),
      ).rejects.toBeInstanceOf(ForbiddenError);
    }
    await expect(listDealFinancials(env.ctx.accounts, everything, {})).resolves.toMatchObject({
      total: 0,
    });
  });

  describe("commission rate cards", () => {
    it("validates cards: project of the builder, slabs, no overlapping active cards", async () => {
      await saveCommissionTerm(env.ctx.accounts, null, {
        builderId: env.builder.id,
        name: "Standard",
        type: "PERCENTAGE",
        percentage: "2",
        validFrom: "2020-01-01",
      });
      await expect(
        saveCommissionTerm(env.ctx.accounts, null, {
          builderId: env.builder.id,
          type: "PERCENTAGE",
          percentage: "2.5",
          validFrom: "2024-04-01",
        }),
      ).rejects.toBeInstanceOf(ValidationError);
      await expect(
        saveCommissionTerm(env.ctx.accounts, null, {
          builderId: env.builder.id,
          projectId: env.otherProject.id,
          type: "PERCENTAGE",
          percentage: "3",
          validFrom: "2020-01-01",
        }),
      ).rejects.toThrow("Choose a project of this builder.");
      await expect(
        saveCommissionTerm(env.ctx.accounts, null, {
          builderId: env.builder.id,
          projectId: env.premium.id,
          type: "SLAB",
          slabBasis: "VALUE",
          slabs: [
            { from: "0", to: "10000000", percentage: "2" },
            { from: "5000000", to: null, percentage: "3" },
          ],
          validFrom: "2020-01-01",
        }),
      ).rejects.toBeInstanceOf(ValidationError);
      // Premium project: 2.5% below 1 Cr, 3% from 1 Cr (the slab applies to the whole value).
      await saveCommissionTerm(env.ctx.accounts, null, {
        builderId: env.builder.id,
        projectId: env.premium.id,
        name: "Sky Towers launch",
        type: "SLAB",
        slabBasis: "VALUE",
        slabs: [
          { from: "0", to: "10000000", percentage: "2.5" },
          { from: "10000000", to: null, percentage: "3" },
        ],
        validFrom: "2020-01-01",
      });
    });

    it("unused cards are deleted, used ones deactivated", async () => {
      const { id } = await saveCommissionTerm(env.ctx.accounts, null, {
        builderId: env.otherBuilder.id,
        type: "FLAT",
        flatAmount: "1,00,000",
        validFrom: "2020-01-01",
      });
      await deleteCommissionTerm(env.ctx.accounts, id);
      expect(await prisma.commissionTerm.count({ where: { id } })).toBe(0);
    });
  });

  describe("deal financials", () => {
    let deal: { bookingId: string; dealId: string };

    it("a closed booking gets its financials from the builder's card", async () => {
      deal = await closedDeal("Priya Shah", "85 L");
      const detail = await getDealFinancial(env.ctx.accounts, deal.dealId);
      expect(detail).toMatchObject({
        status: "DRAFT",
        agreementValue: "8500000",
        grossCommission: "170000",
        commissionRate: "2",
        taxRate: "18",
        taxAmount: "30600",
        tdsRate: "2",
        tdsAmount: "3400",
        netRevenue: "170000",
        netProfit: "170000",
        executiveName: "Esha Exec",
        builder: { name: "Skyline Developers" },
      });
      expect(detail.commissionBasis).toContain("2%");
      expect(detail.history.map((entry) => entry.type)).toEqual(["CREATED"]);
      expect(await countBookingsWithoutFinancials(env.ctx.accounts)).toBe(0);
    });

    it("project slab cards win over the builder card", async () => {
      const low = await closedDeal("Kiran Low", "90 L", env.premium.id);
      const high = await closedDeal("Kavya High", "1.2 Cr", env.premium.id);
      const lowDeal = await getDealFinancial(env.ctx.accounts, low.dealId);
      const highDeal = await getDealFinancial(env.ctx.accounts, high.dealId);
      expect([lowDeal.grossCommission, highDeal.grossCommission]).toEqual(["225000", "360000"]);
    });

    it("costs give net revenue and profit; overriding needs a reason", async () => {
      await expect(
        updateDealFinancial(env.ctx.accounts, {
          dealId: deal.dealId,
          grossCommission: "1,80,000",
          taxRate: "18",
          tdsRate: "2",
        }),
      ).rejects.toThrow("Say why the commission differs from the rate card.");
      const result = await updateDealFinancial(env.ctx.accounts, {
        dealId: deal.dealId,
        taxRate: "18",
        tdsRate: "2",
        cashback: "20,000",
        subBrokerPayout: "30,000",
        subBrokerName: "Ramesh Realty",
        executiveIncentive: "10,000",
        expenses: [
          { label: "Site visit cab", amount: "2,500" },
          { label: "Gift", amount: "2,500.50" },
        ],
      });
      expect(result.changed).toEqual([
        "cashback",
        "subBrokerPayout",
        "executiveIncentive",
        "otherExpenses",
      ]);
      const detail = await getDealFinancial(env.ctx.accounts, deal.dealId);
      expect(detail).toMatchObject({
        cashback: "20000",
        otherExpenses: "5000.5",
        netRevenue: "150000",
        netProfit: "104999.5",
      });
      expect(detail.expenses.map((expense) => expense.label)).toEqual(["Site visit cab", "Gift"]);
    });

    it("booking changes flow into drafts; confirmed financials are locked", async () => {
      await updateBooking(env.ctx.admin, {
        bookingId: deal.bookingId,
        projectId: env.project.id,
        customerName: "Priya Shah",
        tower: "B",
        unitNumber: "1203",
        bookingDate: today(),
        agreementValue: "90 L",
        note: "Final price",
      });
      await runHandlers(env.orgId, "billing.");
      let detail = await getDealFinancial(env.ctx.accounts, deal.dealId);
      expect(detail).toMatchObject({ grossCommission: "180000", netProfit: "114999.5" });
      expect(detail.history[0]).toMatchObject({ type: "RECALCULATED" });

      await confirmDealFinancial(env.ctx.accounts, deal.dealId);
      await expect(
        updateDealFinancial(env.ctx.accounts, { dealId: deal.dealId, taxRate: "18", tdsRate: "2" }),
      ).rejects.toBeInstanceOf(ConflictError);
      await updateBooking(env.ctx.admin, {
        bookingId: deal.bookingId,
        projectId: env.project.id,
        customerName: "Priya Shah",
        tower: "B",
        unitNumber: "1203",
        bookingDate: today(),
        agreementValue: "95 L",
        note: "Renegotiated",
      });
      await runHandlers(env.orgId, "billing.");
      detail = await getDealFinancial(env.ctx.accounts, deal.dealId);
      expect(detail.grossCommission).toBe("180000");

      await expect(
        unlockDealFinancial(env.ctx.accounts, { dealId: deal.dealId, reason: "" }),
      ).rejects.toBeInstanceOf(ValidationError);
      await unlockDealFinancial(env.ctx.accounts, {
        dealId: deal.dealId,
        reason: "Price renegotiated",
      });
      await updateDealFinancial(env.ctx.accounts, {
        dealId: deal.dealId,
        grossCommission: "1,90,000",
        overrideReason: "Builder agreed to a bonus",
        taxRate: "18",
        tdsRate: "2",
        cashback: "20,000",
        subBrokerPayout: "30,000",
        executiveIncentive: "10,000",
        expenses: [{ label: "Site visit cab", amount: "5,000.50" }],
      });
      detail = await getDealFinancial(env.ctx.accounts, deal.dealId);
      expect(detail).toMatchObject({
        grossCommission: "190000",
        commissionOverridden: true,
        netProfit: "124999.5",
      });
      expect(detail.commissionBasis).toBe("Entered by hand: Builder agreed to a bonus");
      expect(detail.history.map((entry) => entry.type)).toEqual([
        "UPDATED",
        "UNLOCKED",
        "CONFIRMED",
        "RECALCULATED",
        "UPDATED",
        "CREATED",
      ]);
      const audit = await prisma.auditLog.count({
        where: { organizationId: env.orgId, entityId: deal.dealId },
      });
      expect(audit).toBeGreaterThanOrEqual(5);
    });

    it("a cancelled booking cancels its financials", async () => {
      const cancelled = await closedDeal("Cancelled Chetan", "70 L");
      await cancelBooking(env.ctx.admin, {
        bookingId: cancelled.bookingId,
        reasonId: env.reason("LOAN"),
        notes: "Loan rejected",
      });
      await runHandlers(env.orgId, "billing.");
      expect((await getDealFinancial(env.ctx.accounts, cancelled.dealId)).status).toBe("CANCELLED");
      const { rows } = await listDealFinancials(env.ctx.accounts, everything, {});
      expect(rows.map((row) => row.id)).not.toContain(cancelled.dealId);
    });
  });

  describe("invoices and payments", () => {
    let invoiceId: string;
    let dealIds: string[];

    it("drafts an invoice for billable deals with the tax split", async () => {
      await updateBillingSettings(env.ctx.accounts, {
        legalName: "Demo Realty LLP",
        taxRegistrationId: "27ABCDE1234F1Z5",
        state: "Maharashtra",
        bankName: "HDFC Bank",
      });
      const billable = await listBillableDeals(env.ctx.accounts, env.builder.id);
      dealIds = billable.map((row) => row.id);
      expect(billable).toHaveLength(3);
      const created = await createInvoiceDraft(env.ctx.accounts, {
        builderId: env.builder.id,
        dealIds: dealIds.slice(0, 1),
        manualLines: [{ description: "Marketing support", amount: "1000.05" }],
        intraState: true,
      });
      invoiceId = created.id;
      const invoice = await getInvoice(env.ctx.accounts, invoiceId, today());
      expect(invoice).toMatchObject({ status: "DRAFT", number: null });
      expect(invoice.lines).toHaveLength(2);
      expect(invoice.lines[0]!.description).toMatch(/^Brokerage — BK-\d{6} · /);
      // Tax on 1,91,000.05 at 18%: 34,380.01 → CGST 17,190.01 + SGST 17,190.00 (the remainder).
      expect(invoice).toMatchObject({
        subtotal: "191000.05",
        taxTotal: "34380.01",
        total: "225380.06",
      });
      expect(invoice.taxLines).toEqual([
        { label: "CGST", rate: "9", amount: "17190.01" },
        { label: "SGST", rate: "9", amount: "17190.00" },
      ]);
      await expect(
        createInvoiceDraft(env.ctx.accounts, {
          builderId: env.builder.id,
          dealIds: dealIds.slice(0, 1),
        }),
      ).rejects.toThrow(/is already on invoice/);
      await expect(
        createInvoiceDraft(env.ctx.accounts, {
          builderId: env.otherBuilder.id,
          dealIds: dealIds.slice(1, 2),
        }),
      ).rejects.toThrow(/is not with this builder/);
    });

    it("issues with a fiscal-year number, snapshots parties and confirms the deals", async () => {
      const { number } = await issueInvoice(env.ctx.accounts, {
        invoiceId,
        issueDate: "2026-09-25",
      });
      expect(number).toBe("INV/2026-27/0001");
      const invoice = await getInvoice(env.ctx.accounts, invoiceId, "2026-09-25");
      expect(invoice).toMatchObject({
        status: "ISSUED",
        fiscalYear: "2026-27",
        issueDate: "2026-09-25",
        dueDate: "2026-10-25",
        balance: "225380.06",
      });
      expect(invoice.seller).toMatchObject({ name: "Demo Realty LLP", taxId: "27ABCDE1234F1Z5" });
      expect(invoice.billTo).toMatchObject({ name: "Skyline Developers Pvt Ltd" });
      expect((await getDealFinancial(env.ctx.accounts, dealIds[0]!)).status).toBe("CONFIRMED");
      await expect(
        unlockDealFinancial(env.ctx.accounts, { dealId: dealIds[0]!, reason: "Fix it" }),
      ).rejects.toThrow(/billed on invoice INV\/2026-27\/0001/);
      await expect(deleteInvoiceDraft(env.ctx.accounts, invoiceId)).rejects.toBeInstanceOf(
        ConflictError,
      );

      // Numbers continue within a fiscal year and restart in the next one; IGST between states.
      const second = await createInvoiceDraft(env.ctx.accounts, {
        builderId: env.builder.id,
        dealIds: [dealIds[1]!],
        intraState: false,
      });
      expect(
        (await issueInvoice(env.ctx.accounts, { invoiceId: second.id, issueDate: "2027-03-31" }))
          .number,
      ).toBe("INV/2026-27/0002");
      const secondInvoice = await getInvoice(env.ctx.accounts, second.id, "2027-03-31");
      expect(secondInvoice.taxLines).toEqual([{ label: "IGST", rate: "18", amount: "40500.00" }]);
      const third = await createInvoiceDraft(env.ctx.accounts, {
        builderId: env.builder.id,
        manualLines: [{ description: "Referral fee", amount: "10,000" }],
      });
      expect(
        (await issueInvoice(env.ctx.accounts, { invoiceId: third.id, issueDate: "2027-04-02" }))
          .number,
      ).toBe("INV/2027-28/0001");
      // Drafts can be discarded.
      const draft = await createInvoiceDraft(env.ctx.accounts, {
        builderId: env.builder.id,
        dealIds: [dealIds[2]!],
      });
      await deleteInvoiceDraft(env.ctx.accounts, draft.id);
    });

    it("payments with TDS move the invoice to partly paid and paid; voids reverse them", async () => {
      await expect(
        recordPayment(env.ctx.accounts, {
          invoiceId,
          receivedOn: "2026-10-05",
          amount: "2,25,000",
          tdsDeducted: "3,820",
          mode: "BANK_TRANSFER",
        }),
      ).rejects.toThrow(/more than the/);
      await expect(
        recordPayment(env.ctx.accounts, {
          invoiceId,
          receivedOn: "2026-09-01",
          amount: "1,000",
          mode: "UPI",
        }),
      ).rejects.toThrow("The payment date is before the invoice date.");
      const first = await recordPayment(env.ctx.accounts, {
        invoiceId,
        receivedOn: "2026-10-05",
        amount: "1,00,000",
        tdsDeducted: "3,820",
        mode: "BANK_TRANSFER",
        reference: "UTR001",
      });
      expect(first.status).toBe("PARTIALLY_PAID");
      let invoice = await getInvoice(env.ctx.accounts, invoiceId, "2026-10-05");
      expect(invoice).toMatchObject({
        amountSettled: "103820",
        tdsDeducted: "3820",
        balance: "121560.06",
      });
      const second = await recordPayment(env.ctx.accounts, {
        invoiceId,
        receivedOn: "2026-10-20",
        amount: "1,21,560.06",
        mode: "CHEQUE",
      });
      expect(second.status).toBe("PAID");
      await expect(
        recordPayment(env.ctx.accounts, {
          invoiceId,
          receivedOn: "2026-10-21",
          amount: "1",
          mode: "CASH",
        }),
      ).rejects.toThrow("This invoice is paid in full.");
      await expect(
        cancelInvoice(env.ctx.accounts, { invoiceId, reason: "Wrong builder" }),
      ).rejects.toThrow(/Void them before cancelling/);

      const voided = await voidPayment(env.ctx.accounts, {
        paymentId: second.id,
        reason: "Cheque bounced",
      });
      expect(voided.status).toBe("PARTIALLY_PAID");
      invoice = await getInvoice(env.ctx.accounts, invoiceId, "2026-10-21");
      expect(invoice.balance).toBe("121560.06");
      const register = await listPayments(env.ctx.accounts, {
        period: ALL_TIME,
        includeVoided: true,
      });
      expect(register.rows).toHaveLength(2);
      expect(register.received).toBe("100000.00");
      expect(register.tds).toBe("3820.00");
    });

    it("cancelling an invoice frees its deals for a new one", async () => {
      const draftFor = await createInvoiceDraft(env.ctx.accounts, {
        builderId: env.builder.id,
        dealIds: [dealIds[2]!],
      });
      await issueInvoice(env.ctx.accounts, { invoiceId: draftFor.id, issueDate: "2026-09-26" });
      await cancelInvoice(env.ctx.accounts, { invoiceId: draftFor.id, reason: "Wrong unit" });
      const cancelled = await getInvoice(env.ctx.accounts, draftFor.id, "2026-09-26");
      expect(cancelled).toMatchObject({
        status: "CANCELLED",
        balance: "0",
        number: "INV/2026-27/0003",
      });
      expect((await listBillableDeals(env.ctx.accounts, env.builder.id)).map((d) => d.id)).toEqual([
        dealIds[2],
      ]);
    });

    it("lists and filters invoices, overdue ones included", async () => {
      const open = await listInvoices(env.ctx.accounts, everything, {
        status: "OPEN",
        today: "2026-11-30",
      });
      expect(open.rows.map((row) => row.number).sort()).toEqual([
        "INV/2026-27/0001",
        "INV/2026-27/0002",
        "INV/2027-28/0001",
      ]);
      const overdue = await listInvoices(env.ctx.accounts, everything, {
        overdue: true,
        today: "2026-11-30",
      });
      expect(overdue.rows.map((row) => row.number)).toEqual(["INV/2026-27/0001"]);
      expect(overdue.rows[0]!.overdue).toBe(true);
    });
  });

  describe("reports", () => {
    it("billing dashboard: billed, collected, outstanding and ageing", async () => {
      const dashboard = await getBillingDashboard(
        env.ctx.accounts,
        { from: "2026-04-01", to: "2027-03-31" },
        "2027-01-10",
      );
      expect(dashboard).toMatchObject({
        billed: "490880.06",
        collected: "103820.00",
        tdsDeducted: "3820.00",
        outstanding: "398860.06",
        overdue: "121560.06",
        overdueCount: 1,
      });
      // INV/2026-27/0001 issued 107 days earlier; the March and April invoices are in the future of "today".
      expect(dashboard.ageing["90+"]).toBe("121560.06");
      expect(dashboard.byBuilder[0]).toMatchObject({
        label: "Skyline Developers",
        billed: "490880.06",
        collected: "103820.00",
      });
      expect(dashboard.byMonth.map((row) => row.key)).toEqual(["2026-09", "2026-10", "2027-03"]);
    });

    it("profit & loss by dimension, less business expenses", async () => {
      await expect(
        saveBusinessExpense(env.ctx.manager, null, {
          spentOn: today(),
          category: "RENT",
          description: "Office rent",
          amount: "50,000",
        }),
      ).rejects.toBeInstanceOf(ForbiddenError);
      await saveBusinessExpense(env.ctx.accounts, null, {
        spentOn: today(),
        category: "RENT",
        description: "Office rent",
        amount: "50,000",
      });
      const { id } = await saveBusinessExpense(env.ctx.accounts, null, {
        spentOn: today(),
        category: "MARKETING",
        description: "Portal listing",
        amount: "25,000",
        projectId: env.premium.id,
      });
      await saveBusinessExpense(env.ctx.accounts, id, {
        spentOn: today(),
        category: "MARKETING",
        description: "Portal listing (99acres)",
        amount: "30,000",
        projectId: env.premium.id,
      });
      const temp = await saveBusinessExpense(env.ctx.accounts, null, {
        spentOn: today(),
        category: "OTHER",
        description: "Duplicate",
        amount: "1",
      });
      await deleteBusinessExpense(env.ctx.accounts, temp.id);
      expect((await listBusinessExpenses(env.ctx.accounts, { period: ALL_TIME })).total).toBe(
        "80000.00",
      );

      const byProject = await getProfitAndLoss(env.ctx.accounts, ALL_TIME, "project");
      expect(byProject.rows.map((row) => [row.label, row.deals, row.netProfit])).toEqual([
        ["Sky Towers", 2, "585000.00"],
        ["Hill View", 1, "124999.50"],
      ]);
      expect(byProject.total).toMatchObject({
        deals: 3,
        grossCommission: "775000.00",
        netRevenue: "755000.00",
        netProfit: "709999.50",
        margin: "94.0",
      });
      expect(byProject.businessExpensesTotal).toBe("80000.00");
      expect(byProject.organizationProfit).toBe("629999.50");
      const byExecutive = await getProfitAndLoss(env.ctx.accounts, ALL_TIME, "executive");
      expect(byExecutive.rows.map((row) => row.label)).toEqual(["Esha Exec"]);
    });

    it("cost per lead: marketing spend by source against its leads and bookings", async () => {
      const source = await prisma.leadSource.findFirstOrThrow({
        where: { organizationId: env.orgId },
        orderBy: { name: "asc" },
      });
      for (const name of ["Source Sam", "Source Sia", "Source Sid"]) {
        await createLead(env.ctx.exec, { name, mobile: nextMobile(), sourceId: source.id });
      }
      await saveBusinessExpense(env.ctx.accounts, null, {
        spentOn: today(),
        category: "MARKETING",
        description: "Campaign boost",
        amount: "12,000",
        sourceId: source.id,
      });
      const rows = await getCostPerLead(env.ctx.accounts, { from: today(), to: today() });
      expect(rows.find((row) => row.key === source.id)).toMatchObject({
        label: source.name,
        spend: "12000.00",
        leads: 3,
        bookings: 0,
        costPerLead: "4000.00",
        costPerBooking: null,
      });
      // Unattributed marketing spend (the portal listing) shows under "No source".
      expect(rows.find((row) => row.key === "none")?.spend).toBe("30000.00");
    });

    it("lost opportunities by reason with estimated values", async () => {
      const lead = await createLead(env.ctx.exec, {
        name: "Lost Lalit",
        mobile: nextMobile(),
        budgetMin: "60 L",
        budgetMax: "75 L",
      });
      await markLeadLost(env.ctx.exec, {
        leadId: lead.id,
        statusKey: "LOST",
        lossReasonId: env.reason("BUDGET"),
        notes: "Budget too low",
      });
      const report = await getLostOpportunities(env.ctx.accounts, ALL_TIME);
      // Lalit, and Chetan whose booking was cancelled (no budget recorded).
      expect(report.lost.count).toBe(2);
      expect(report.lost.estimatedValue).toBe("7500000.00");
      expect(report.lost.byReason.map((row) => [row.label, row.count])).toEqual(
        expect.arrayContaining([["Loan not approved", 1]]),
      );
      expect(report.lost.byExecutive[0]).toMatchObject({ label: "Esha Exec", count: 2 });
      expect(report.cancelledBookings).toMatchObject({ count: 1, value: "7000000.00" });
    });
  });

  it("alerts billing people about overdue invoices, once a day", async () => {
    const candidates = await overdueInvoicesRule.evaluate(
      createSystemContext(env.orgId),
      new Date("2026-12-01T06:00:00Z"),
    );
    const recipients = new Set(candidates.map((candidate) => candidate.recipientId));
    expect(recipients.has(env.m.admin)).toBe(true);
    expect(recipients.has(env.m.accounts)).toBe(true);
    expect(recipients.has(env.m.manager)).toBe(false);
    expect(candidates[0]).toMatchObject({
      type: "billing.invoices_overdue",
      title: expect.stringMatching(/^1 invoice overdue — /),
    });
    const digest = await billingDigestSection.build(env.ctx.accounts, new Date());
    expect(digest?.lines.map((line) => line.label)).toContain("Outstanding");
    expect(await billingDigestSection.build(env.ctx.exec, new Date())).toBeNull();
  });

  it("exports registers as CSV and XLSX", async () => {
    const csv = await exportBillingRegister(env.ctx.accounts, {
      register: "invoices",
      format: "csv",
    });
    expect(csv.contentType).toBe("text/csv");
    expect(String(csv.body)).toContain("INV/2026-27/0001");
    const xlsx = await exportBillingRegister(env.ctx.accounts, {
      register: "profit-loss",
      format: "xlsx",
      dimension: "builder",
    });
    expect(xlsx.fileName).toMatch(/^profit-loss-.*\.xlsx$/);
    await expect(
      exportBillingRegister(env.ctx.exec, { register: "deals", format: "csv" }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});
