import { describe, expect, it } from "vitest";

import { TIPS, WINDOWS, fill, greetingFor, tipFor, windowOf } from "./greetings";

const memory = () => {
  const data = new Map();
  return { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
};

const at = (hour, day = 14) => new Date(2026, 10, day, hour, 30);

describe("greetings", () => {
  it("picks the part of the day by the hour", () => {
    expect(windowOf(at(3)).id).toBe("late");
    expect(windowOf(at(9)).id).toBe("morning");
    expect(windowOf(at(14)).id).toBe("afternoon");
    expect(windowOf(at(19)).id).toBe("evening");
    expect(windowOf(at(23)).id).toBe("night");
  });

  it("names the person, or reads cleanly without a name", () => {
    expect(fill("Rise and read, {name}.", "Tanishk")).toBe("Rise and read, Tanishk.");
    expect(fill("Rise and read, {name}.", null)).toBe("Rise and read.");
    for (const window of WINDOWS) {
      for (const line of window.lines) {
        expect(line).toContain(", {name}");
        expect(fill(line, null)).not.toContain("{name}");
      }
    }
  });

  it("keeps the same greeting through a refresh in the same window", () => {
    const store = memory();
    const first = greetingFor("u1", "Asha", { now: at(9), store, random: () => 0.99 });
    const again = greetingFor("u1", "Asha", { now: at(10), store, random: () => 0 });
    expect(again).toBe(first);
  });

  it("picks again in a new window or on a new day", () => {
    const store = memory();
    greetingFor("u1", "Asha", { now: at(9), store, random: () => 0.99 });
    expect(greetingFor("u1", "Asha", { now: at(14), store, random: () => 0 })).toBe("Good afternoon, Asha.");
    expect(greetingFor("u1", "Asha", { now: at(9, 15), store, random: () => 0 })).toBe("Good morning, Asha.");
  });

  it("survives a damaged or missing store", () => {
    const broken = { getItem: () => "{not json", setItem: () => { throw new Error("full"); } };
    expect(greetingFor("u1", "Asha", { now: at(9), store: broken, random: () => 0 })).toBe("Good morning, Asha.");
  });

  it("never offers video tips to people without videos", () => {
    const videoTips = TIPS.filter((tip) => tip.videos).map((tip) => tip.text);
    for (let step = 0; step < 1; step += 0.05) {
      expect(videoTips).not.toContain(tipFor({ videos: false, random: () => step }));
    }
  });
});
