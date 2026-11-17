import { describe, expect, it } from "vitest";
import type { PingOverviewBucket } from "@/types/cfsm";
import {
  formatCompactBillingCycle,
  formatCompactExpire,
  getBarGeometry,
  healthBarInteractionModel,
  healthBarSlotModel,
  snapBarRect,
  snapBarTop,
} from "@/components/node/nodeCardShared";

function bucket(value: number | null, loss: number | null = 0): PingOverviewBucket {
  return {
    index: 0,
    value,
    loss,
    total: value == null ? 0 : 1,
    lost: 0,
    startAt: null,
    endAt: null,
  };
}

describe("healthBarSlotModel", () => {
  it("keeps every valid latency bucket at one height while color carries severity", () => {
    const values = [0, 20, 55, 88.5, 151, 400];
    const slots = values.map((value) => healthBarSlotModel(bucket(value), "latency"));

    expect(slots.every((slot) => slot.active)).toBe(true);
    expect(new Set(slots.map((slot) => slot.heightFraction))).toEqual(new Set([0.84]));
    expect(slots.map((slot) => slot.color)).toEqual([
      "var(--latency-excellent)",
      "var(--latency-excellent)",
      "var(--latency-excellent)",
      "var(--latency-good)",
      "var(--latency-moderate)",
      "var(--latency-critical)",
    ]);
  });

  it("renders missing latency as a short neutral gap", () => {
    expect(healthBarSlotModel(bucket(null, null), "latency")).toMatchObject({
      active: false,
      heightFraction: 0.25,
      color: "var(--progress-bg)",
    });
  });

  it("keeps loss buckets on the same fixed-height visual language", () => {
    expect(healthBarSlotModel(bucket(20), "latency")).toMatchObject({
      active: true,
      heightFraction: 0.84,
      alpha: 0.94,
    });
    expect(healthBarSlotModel(bucket(20, 12.5), "loss")).toMatchObject({
      active: true,
      heightFraction: 0.84,
      alpha: 0.94,
    });
  });

  it("uses the shared hover lift and sibling fade for canvas renderers", () => {
    const slot = healthBarSlotModel(bucket(55), "latency");

    expect(healthBarInteractionModel(slot, true, 1)).toMatchObject({
      heightFraction: 1,
      alpha: 1,
    });
    expect(healthBarInteractionModel(slot, false, 1).alpha).toBeCloseTo(slot.alpha * 0.54);
    expect(healthBarInteractionModel(slot, true, 0)).toMatchObject({
      heightFraction: slot.heightFraction,
      alpha: slot.alpha,
    });
  });
});

describe("formatCompactExpire", () => {
  it("shows 永久 when no expiry date is set", () => {
    // 之前显示 "余 --",看不出是"没填"还是"算不出来"。
    expect(formatCompactExpire({ value: "—", unit: "" })).toBe("永久");
  });

  it("keeps the remaining-days form otherwise", () => {
    expect(formatCompactExpire({ value: "12", unit: "天" })).toBe("余 12天");
    expect(formatCompactExpire({ value: "长期", unit: "" })).toBe("长期");
  });
});

describe("formatCompactBillingCycle", () => {
  it("formats standard cycles correctly", () => {
    expect(formatCompactBillingCycle("month")).toBe("月付");
    expect(formatCompactBillingCycle(30)).toBe("月付");
    expect(formatCompactBillingCycle("quarter")).toBe("季付");
    expect(formatCompactBillingCycle(90)).toBe("季付");
    expect(formatCompactBillingCycle("half_year")).toBe("半年付");
    expect(formatCompactBillingCycle(180)).toBe("半年付");
    expect(formatCompactBillingCycle("year")).toBe("年付");
    expect(formatCompactBillingCycle(365)).toBe("年付");
    expect(formatCompactBillingCycle("two_years")).toBe("2年付");
    expect(formatCompactBillingCycle("三年付")).toBe("3年付");
    expect(formatCompactBillingCycle("three_years")).toBe("3年付");
    expect(formatCompactBillingCycle("four_years")).toBe("4年付");
    expect(formatCompactBillingCycle("five_years")).toBe("5年付");
    expect(formatCompactBillingCycle(1095)).toBe("3年付");
    expect(formatCompactBillingCycle("lifetime")).toBe("永久");
    expect(formatCompactBillingCycle(-1)).toBe("永久");
  });

  it("handles free price sentinel", () => {
    expect(formatCompactBillingCycle("year", -1)).toBe("免费");
  });

  it("falls back to 年付 for invalid or empty cycle values", () => {
    expect(formatCompactBillingCycle("")).toBe("年付");
    expect(formatCompactBillingCycle(null)).toBe("年付");
    expect(formatCompactBillingCycle(undefined)).toBe("年付");
  });
});

describe("snapBarRect", () => {
  // 175.95px 分 20 根：按 CSS 宽度均分得到 6.9px 这类分数，整排边界都会压在半个像素上。
  it("lands both edges of every bar on whole device pixels", () => {
    const isWhole = (value: number) => Math.abs(value - Math.round(value)) < 1e-9;

    for (const dpr of [1, 1.25, 2]) {
      const geometry = getBarGeometry(175.95, 20, dpr);
      for (let index = 0; index < 20; index += 1) {
        const { x, width } = snapBarRect(index, geometry, dpr);
        expect(isWhole(x * dpr)).toBe(true);
        expect(isWhole((x + width) * dpr)).toBe(true);
      }
    }
  });

  // 之前的实现逐根取整，间距在 2/3 个设备像素之间跳，一整排看着就是间隔不匀。
  it("keeps every gap between bars exactly the same", () => {
    for (const dpr of [1, 1.25, 2]) {
      for (const count of [14, 18, 20]) {
        const geometry = getBarGeometry(176.4, count, dpr);
        for (let index = 1; index < count; index += 1) {
          const previous = snapBarRect(index - 1, geometry, dpr);
          const current = snapBarRect(index, geometry, dpr);
          expect(Math.round((current.x - (previous.x + previous.width)) * dpr)).toBe(
            geometry.gap,
          );
        }
      }
    }
  });

  it("keeps the row inside the track and every bar at least one device pixel wide", () => {
    const geometry = getBarGeometry(60, 20, 1);
    const last = snapBarRect(19, geometry, 1);

    expect(snapBarRect(0, geometry, 1).x).toBe(0);
    expect(last.x + last.width).toBeLessThanOrEqual(60);
    expect(last.width).toBeGreaterThanOrEqual(1);
  });

  // 柱宽只可能有两种取值，差 1 个设备像素；多出来的像素按 Bresenham 摊开，不会全挤在一端。
  it("spreads the leftover device pixels evenly across the row", () => {
    const count = 20;
    const geometry = getBarGeometry(175.95, count, 1);
    const widths = Array.from(
      { length: count },
      (_, index) => Math.round(snapBarRect(index, geometry, 1).width),
    );
    const widened = widths
      .map((width, index) => ({ width, index }))
      .filter(({ width }) => width === geometry.barWidth + 1)
      .map(({ index }) => index);

    expect(new Set(widths).size).toBeLessThanOrEqual(2);
    expect(widened).toHaveLength(geometry.extra);
    const idealStep = Math.ceil(count / Math.max(1, geometry.extra));
    for (let index = 1; index < widened.length; index += 1) {
      expect(widened[index]! - widened[index - 1]!).toBeLessThanOrEqual(idealStep);
    }
  });
});

describe("snapBarTop", () => {
  it("rounds the top edge to whole device pixels", () => {
    expect(snapBarTop(11 - 11 * 0.84, 1)).toBe(2);
    expect(snapBarTop(2.4, 1)).toBe(2);
    expect(snapBarTop(2.4, 2)).toBe(2.5);
  });
});
