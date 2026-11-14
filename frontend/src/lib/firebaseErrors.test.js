import { describe, expect, it } from "vitest";

import { friendlyAuthError, toE164 } from "./firebaseErrors";

describe("friendlyAuthError", () => {
  it("stays quiet when the person closed the Google window", () => {
    expect(friendlyAuthError({ code: "auth/popup-closed-by-user" })).toBeNull();
    expect(friendlyAuthError({ code: "auth/cancelled-popup-request" })).toBeNull();
  });

  it("explains the common problems in plain words", () => {
    expect(friendlyAuthError({ code: "auth/invalid-verification-code" })).toMatch(/code is not right/);
    expect(friendlyAuthError({ code: "auth/too-many-requests" })).toMatch(/Too many tries/);
    expect(friendlyAuthError({ code: "auth/invalid-phone-number" })).toMatch(/phone number/);
  });

  it("falls back to a general message, and passes API messages through", () => {
    expect(friendlyAuthError({ code: "auth/something-new" })).toBe("That sign-in did not work. Try again.");
    expect(friendlyAuthError({ message: "That Google account is already used by another account." })).toBe(
      "That Google account is already used by another account.",
    );
  });
});

describe("toE164", () => {
  it("joins the country code and the number, dropping spaces and a leading zero", () => {
    expect(toE164("+91", "098765 43210")).toBe("+919876543210");
    expect(toE164("+1", "(555) 000-1111")).toBe("+15550001111");
  });

  it("refuses numbers that are too short", () => {
    expect(toE164("+91", "1234")).toBeNull();
  });
});
