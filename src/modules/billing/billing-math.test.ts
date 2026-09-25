import { describe, expect, it } from "vitest";

import {
  type CommissionCard,
  computeCommission,
  pickCommissionCard,
  validateCommissionCard,
} from "./commission";
import { fiscalYearOf } from "./fiscal";
import { percentOf, toMoney } from "./money";
import { ageingBucket, computeTaxLines, statusAfterPayments } from "./tax";

const card = (patch: Partial<CommissionCard>): CommissionCard => ({
  id: "card",
  builderId: "b1",
  projectId: null,
  name: null,
  type: "PERCENTAGE",
  percentage: "2",
  flatAmount: null,
  slabBasis: null,
  slabs: [],
  validFrom: "2026-04-01",
  validTo: null,
  isActive: true,
  ...patch,
});

describe("money", () => {
  it("rounds half up to two decimals at each step", () => {
    expect(percentOf("1234567.89", "2.5").toFixed(2)).toBe("30864.20");
    expect(percentOf("1", "0.5").toFixed(2)).toBe("0.01");
    expect(toMoney("0.005")).toBe("0.01");
    expect(toMoney("2.675")).toBe("2.68");
  });
});

describe("commission rate cards", () => {
  const deal = { builderId: "b1", projectId: "p1", date: "2026-09-25" };

  it("prefers the project's card, then the builder's, the latest valid one", () => {
    const builderOld = card({ id: "b-old", validFrom: "2025-04-01", validTo: "2026-03-31" });
    const builderNow = card({ id: "b-now", validFrom: "2026-04-01" });
    const projectNow = card({ id: "p-now", projectId: "p1", validFrom: "2026-06-01" });
    const otherProject = card({ id: "p-other", projectId: "p2" });
    const inactive = card({ id: "off", projectId: "p1", validFrom: "2026-09-01", isActive: false });
    const cards = [builderOld, builderNow, projectNow, otherProject, inactive];
    expect(pickCommissionCard(cards, deal)?.id).toBe("p-now");
    expect(pickCommissionCard(cards, { ...deal, projectId: "p3" })?.id).toBe("b-now");
    expect(pickCommissionCard(cards, { ...deal, date: "2025-12-01" })?.id).toBe("b-old");
    expect(pickCommissionCard(cards, { ...deal, date: "2025-01-01" })).toBeNull();
    expect(pickCommissionCard(cards, { ...deal, builderId: "b2" })).toBeNull();
  });

  it("computes percentage, flat and value slabs", () => {
    expect(
      computeCommission(card({ percentage: "2.5" }), { agreementValue: "8500000" }),
    ).toMatchObject({
      gross: "212500.00",
      rate: "2.5",
    });
    expect(computeCommission(card({ percentage: "2" }), { agreementValue: null })).toMatchObject({
      gross: "0.00",
      basis: "2% — the agreement value is not entered yet",
    });
    expect(
      computeCommission(card({ type: "FLAT", flatAmount: "50000", percentage: null }), {
        agreementValue: null,
      }),
    ).toMatchObject({ gross: "50000.00", rate: null });
    const slabs = card({
      type: "SLAB",
      percentage: null,
      slabBasis: "VALUE",
      slabs: [
        { from: "0", to: "10000000", percentage: "2" },
        { from: "10000000", to: "20000000", percentage: "2.5" },
        { from: "20000000", to: null, percentage: "3" },
      ],
    });
    expect(computeCommission(slabs, { agreementValue: "9999999.99" }).gross).toBe("200000.00");
    expect(computeCommission(slabs, { agreementValue: "10000000" }).gross).toBe("250000.00");
    expect(computeCommission(slabs, { agreementValue: "35000000" })).toMatchObject({
      gross: "1050000.00",
      rate: "3",
    });
    expect(computeCommission(null, { agreementValue: "100" }).gross).toBe("0.00");
  });

  it("computes volume slabs from the deal's rank in the fiscal year", () => {
    const volume = card({
      type: "SLAB",
      percentage: null,
      slabBasis: "VOLUME",
      slabs: [
        { from: "1", to: "5", percentage: "2" },
        { from: "6", to: null, percentage: "3" },
      ],
    });
    expect(computeCommission(volume, { agreementValue: "1000000", volumePosition: 5 }).gross).toBe(
      "20000.00",
    );
    expect(
      computeCommission(volume, { agreementValue: "1000000", volumePosition: 6 }),
    ).toMatchObject({
      gross: "30000.00",
      basis: "3% — deal 6 of the fiscal year",
    });
  });

  it("validates cards", () => {
    expect(validateCommissionCard({ ...card({ percentage: "0" }) })).toHaveProperty("percentage");
    expect(validateCommissionCard({ ...card({ validTo: "2026-01-01" }) })).toHaveProperty(
      "validTo",
    );
    expect(
      validateCommissionCard({
        ...card({
          type: "SLAB",
          slabBasis: "VALUE",
          slabs: [
            { from: "0", to: null, percentage: "2" },
            { from: "100", to: null, percentage: "3" },
          ],
        }),
      }),
    ).toHaveProperty("slabs");
    expect(
      validateCommissionCard({
        ...card({
          type: "SLAB",
          slabBasis: "VALUE",
          slabs: [
            { from: "0", to: "100", percentage: "2" },
            { from: "100", to: null, percentage: "3" },
          ],
        }),
      }),
    ).toEqual({});
  });
});

describe("tax", () => {
  const gst = {
    rate: "18",
    split: true,
    splitLabels: ["CGST", "SGST"] as [string, string],
    singleLabel: "IGST",
  };

  it("splits within the state and keeps the parts adding up", () => {
    expect(computeTaxLines("212500.00", gst, true)).toEqual([
      { label: "CGST", rate: "9", amount: "19125.00" },
      { label: "SGST", rate: "9", amount: "19125.00" },
    ]);
    // 18% of 100.05 = 18.009 → 18.01; halves 9.01 + 9.00.
    const lines = computeTaxLines("100.05", gst, true);
    expect(lines.map((line) => line.amount)).toEqual(["9.01", "9.00"]);
    expect(computeTaxLines("212500.00", gst, false)).toEqual([
      { label: "IGST", rate: "18", amount: "38250.00" },
    ]);
    expect(computeTaxLines("100", { ...gst, rate: "0" }, true)).toEqual([]);
  });

  it("derives the invoice status from settled amounts", () => {
    expect(statusAfterPayments("1000.00", "0")).toBe("ISSUED");
    expect(statusAfterPayments("1000.00", "400.00")).toBe("PARTIALLY_PAID");
    expect(statusAfterPayments("1000.00", "1000.00")).toBe("PAID");
  });

  it("ages receivables by days since the invoice date", () => {
    expect(ageingBucket("2026-09-01", "2026-09-25")).toBe("0-30");
    expect(ageingBucket("2026-08-20", "2026-09-25")).toBe("31-60");
    expect(ageingBucket("2026-07-10", "2026-09-25")).toBe("61-90");
    expect(ageingBucket("2026-01-01", "2026-09-25")).toBe("90+");
  });
});

describe("fiscal years", () => {
  it("numbers April–March years and calendar years", () => {
    expect(fiscalYearOf("2026-09-25")).toEqual({
      label: "2026-27",
      start: "2026-04-01",
      end: "2027-03-31",
    });
    expect(fiscalYearOf("2027-03-31").label).toBe("2026-27");
    expect(fiscalYearOf("2027-04-01").label).toBe("2027-28");
    expect(fiscalYearOf("2026-09-25", 1)).toEqual({
      label: "2026",
      start: "2026-01-01",
      end: "2026-12-31",
    });
    expect(fiscalYearOf("2026-06-15", 7)).toEqual({
      label: "2025-26",
      start: "2025-07-01",
      end: "2026-06-30",
    });
  });
});
