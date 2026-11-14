// Plain words for Firebase sign-in problems, and phone numbers in the +<country><number> form.
const MESSAGES = {
  "auth/invalid-verification-code": "That code is not right. Check the text message and try again.",
  "auth/code-expired": "That code has expired. Ask for a new one.",
  "auth/invalid-phone-number": "That phone number does not look right. Check it and try again.",
  "auth/missing-phone-number": "Enter your phone number.",
  "auth/too-many-requests": "Too many tries for now. Wait a few minutes and try again.",
  "auth/quota-exceeded": "Text messages are paused for now. Try again later or use email.",
  "auth/popup-blocked": "Your browser blocked the Google window. Allow pop-ups for this site and try again.",
  "auth/network-request-failed": "The connection dropped. Check it and try again.",
  "auth/unauthorized-domain": "Google sign-in is not set up for this address yet.",
};
const QUIET = new Set(["auth/popup-closed-by-user", "auth/cancelled-popup-request", "auth/user-cancelled"]);

export function friendlyAuthError(error) {
  const code = error?.code;
  if (QUIET.has(code)) return null;
  if (MESSAGES[code]) return MESSAGES[code];
  if (!code && error?.message) return error.message; // Already plain: from our own API.
  return "That sign-in did not work. Try again.";
}

export function toE164(countryCode, number) {
  const digits = String(number).replace(/\D/g, "").replace(/^0+/, "");
  if (digits.length < 6 || digits.length > 14) return null;
  return `${countryCode}${digits}`;
}
