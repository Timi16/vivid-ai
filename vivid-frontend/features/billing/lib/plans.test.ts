import { describe, expect, it } from "vitest";

import { BILLING_PLANS, priceFor, yearlySavingPercent } from "@/features/billing/lib/plans";

const free = BILLING_PLANS.find((p) => p.id === "free")!;
const pro = BILLING_PLANS.find((p) => p.id === "pro")!;

describe("priceFor", () => {
  it("uses the monthly rate when billed monthly", () => {
    expect(priceFor(pro, "monthly")).toBe(20);
  });

  it("uses the discounted rate when billed yearly", () => {
    expect(priceFor(pro, "yearly")).toBe(16);
  });

  it("is zero on the free plan either way", () => {
    expect(priceFor(free, "monthly")).toBe(0);
    expect(priceFor(free, "yearly")).toBe(0);
  });
});

describe("yearlySavingPercent", () => {
  it("reports the saving on a paid plan", () => {
    expect(yearlySavingPercent(pro)).toBe(20);
  });

  it("returns null on the free plan, so no badge is rendered", () => {
    expect(yearlySavingPercent(free)).toBeNull();
  });

  it("returns null when yearly is not cheaper", () => {
    expect(yearlySavingPercent({ ...pro, yearly: pro.monthly })).toBeNull();
  });
});
