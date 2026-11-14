import { describe, expect, it } from "vitest";

import { STEPS, creep, stepOf } from "./videoSteps";

describe("stepOf", () => {
  it("follows the API's progress milestones", () => {
    expect(stepOf({ status: "queued", progress: 0 })).toBe(0);
    expect(stepOf({ status: "running", progress: 20 })).toBe(1);
    expect(stepOf({ status: "running", progress: 60, video_status: "rendering" })).toBe(2);
    expect(stepOf({ status: "completed", progress: 100, video_status: "ready" })).toBe(STEPS.length - 1);
  });
});

describe("creep", () => {
  it("starts at the real progress", () => {
    expect(creep(20, 0)).toBe(20);
  });

  it("moves toward the next milestone but never reaches it", () => {
    expect(creep(20, 10_000)).toBeGreaterThan(20);
    expect(creep(20, 10_000_000)).toBeLessThan(60);
    expect(creep(60, 10_000_000)).toBeLessThan(100);
  });

  it("stays at 100 once done", () => {
    expect(creep(100, 5000)).toBe(100);
  });
});
