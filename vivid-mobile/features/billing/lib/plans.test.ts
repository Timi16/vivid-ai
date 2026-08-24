import {
  BILLING_PLANS,
  COMPARE_GROUPS,
  priceFor,
  yearlySavingPercent,
  yearlyTotal,
} from "@/features/billing/lib/plans";

const free = BILLING_PLANS.find((p) => p.id === "free")!;
const pro = BILLING_PLANS.find((p) => p.id === "pro")!;
const proPlus = BILLING_PLANS.find((p) => p.id === "pro_plus")!;

describe("plans", () => {
  it("offers Free, Pro and Pro Plus at $0, $20 and $100 a month", () => {
    expect(BILLING_PLANS.map((p) => [p.name, p.monthly])).toEqual([
      ["Free", 0],
      ["Pro", 20],
      ["Pro Plus", 100],
    ]);
  });

  it("has one comparison value per plan on every row", () => {
    for (const group of COMPARE_GROUPS) {
      for (const row of group.rows) expect(row.values).toHaveLength(BILLING_PLANS.length);
    }
  });
});

describe("priceFor and yearlyTotal", () => {
  it("prices each cadence", () => {
    expect(priceFor(pro, "monthly")).toBe(20);
    expect(priceFor(pro, "yearly")).toBe(16);
    expect(priceFor(proPlus, "yearly")).toBe(80);
    expect(priceFor(free, "yearly")).toBe(0);
    expect(yearlyTotal(pro)).toBe(192);
  });
});

describe("yearlySavingPercent", () => {
  it("reports the saving on paid plans and nothing on free", () => {
    expect(yearlySavingPercent(pro)).toBe(20);
    expect(yearlySavingPercent(proPlus)).toBe(20);
    expect(yearlySavingPercent(free)).toBeNull();
  });
});
