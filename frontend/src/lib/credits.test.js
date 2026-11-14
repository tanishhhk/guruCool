import { describe, expect, it } from "vitest";

import { creditsLeft, resetIn } from "./credits";

const usage = { limits: { question: 25, story: 3, upload: 5 }, used: { question: 25, story: 1, upload: 0 } };

describe("creditsLeft", () => {
  it("is what the plan allows minus what was used, never below zero", () => {
    expect(creditsLeft(usage, "question")).toBe(0);
    expect(creditsLeft(usage, "story")).toBe(2);
    expect(creditsLeft({ ...usage, used: { ...usage.used, upload: 9 } }, "upload")).toBe(0);
  });

  it("is unknown until usage has loaded", () => {
    expect(creditsLeft(null, "story")).toBeNull();
  });
});

describe("resetIn", () => {
  it("reads hours and minutes", () => {
    expect(resetIn(5 * 3600 + 12 * 60 + 30)).toBe("5 h 12 min");
  });

  it("drops hours under one hour, and never says zero minutes", () => {
    expect(resetIn(42 * 60)).toBe("42 min");
    expect(resetIn(20)).toBe("1 min");
  });
});
