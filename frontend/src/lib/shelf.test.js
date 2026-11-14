import { describe, expect, it } from "vitest";

import { groupByRecency, parseUtc, spineTone } from "./shelf";

describe("groupByRecency", () => {
  const now = new Date(2026, 10, 6, 15, 0, 0);
  const at = (date) => ({ id: String(date), last_activity_at: date.toISOString().replace("Z", "") });

  it("puts items into today, this week and earlier, dropping empty groups", () => {
    const groups = groupByRecency(
      [at(new Date(2026, 10, 6, 9)), at(new Date(2026, 10, 3, 9)), at(new Date(2026, 9, 1))],
      now,
    );
    expect(groups.map((group) => [group.label, group.items.length])).toEqual([
      ["Today", 1],
      ["This week", 1],
      ["Earlier", 1],
    ]);
  });

  it("returns no groups for no items", () => {
    expect(groupByRecency([], now)).toEqual([]);
  });
});

describe("parseUtc and spineTone", () => {
  it("reads zone-less API times as UTC", () => {
    expect(parseUtc("2026-11-06T10:00:00").toISOString()).toBe("2026-11-06T10:00:00.000Z");
  });

  it("gives the same document the same tone", () => {
    expect(spineTone("abc")).toBe(spineTone("abc"));
  });
});
