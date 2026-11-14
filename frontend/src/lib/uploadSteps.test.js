import { describe, expect, it } from "vitest";

import { UPLOAD_STEPS, uploadSteps } from "./uploadSteps";

const size = 2_000_000; // estimate: 4000 + 1000 = 5000 ms

describe("uploadSteps", () => {
  it("counts the upload as the first 30 percent", () => {
    expect(uploadSteps({ phase: "uploading", uploaded: 0.5, elapsedMs: 0, sizeBytes: size })).toEqual({
      percent: 15,
      step: 0,
      failed: false,
    });
  });

  it("eases reading toward 92 percent and never passes it", () => {
    const early = uploadSteps({ phase: "reading", elapsedMs: 1000, sizeBytes: size });
    const late = uploadSteps({ phase: "reading", elapsedMs: 10_000_000, sizeBytes: size });
    expect(early.percent).toBeGreaterThan(30);
    expect(early.step).toBe(1);
    expect(late.percent).toBeLessThanOrEqual(92);
    expect(late.step).toBe(2);
  });

  it("is full when ready", () => {
    expect(uploadSteps({ phase: "ready", elapsedMs: 0, sizeBytes: size })).toEqual({
      percent: 100,
      step: UPLOAD_STEPS.length - 1,
      failed: false,
    });
  });

  it("keeps the percent reached when it fails, and says so", () => {
    const reading = uploadSteps({ phase: "reading", elapsedMs: 3000, sizeBytes: size });
    const failed = uploadSteps({ phase: "error", failedPhase: "reading", elapsedMs: 3000, sizeBytes: size });
    expect(failed).toEqual({ ...reading, failed: true });
  });
});
