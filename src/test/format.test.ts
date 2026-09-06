import { describe, expect, it } from "vitest";

import {
  formatAmount,
  formatPercent,
  getTacticStepDelta,
  normalizeAmount,
  amountsEqual
} from "@/app/lib/format";

describe("format helpers", () => {
  it("formatPercent rounds", () => {
    expect(formatPercent(0.456)).toBe("46%");
    expect(formatPercent(1)).toBe("100%");
  });

  it("formatAmount preserves meaningful decimal precision", () => {
    expect(formatAmount(0.5)).toBe("0.5");
    expect(formatAmount(2.25)).toBe("2.25");
    expect(formatAmount(1.0000000001)).toBe("1");
  });

  it("normalizeAmount stabilizes floats", () => {
    expect(normalizeAmount(0.1 + 0.2)).toBe(0.3);
    expect(amountsEqual(0.1 + 0.2, 0.3)).toBe(true);
  });
});

describe("today tactic step bounds", () => {
  it("stops incrementing at today's target", () => {
    expect(getTacticStepDelta({ direction: "increase", todayActual: 1, todayTarget: 2 })).toBe(1);
    expect(getTacticStepDelta({ direction: "increase", todayActual: 2, todayTarget: 2 })).toBe(0);
  });

  it("uses the exact fractional remainder for the final increment", () => {
    expect(getTacticStepDelta({ direction: "increase", todayActual: 1, todayTarget: 1.5 })).toBe(0.5);
    expect(getTacticStepDelta({ direction: "decrease", todayActual: 0.5, todayTarget: 1.5 })).toBe(-0.5);
  });
});
