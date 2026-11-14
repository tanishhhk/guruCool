// The welcome tour shows once per person on this browser; the account menu can reopen it.
const key = (userId) => `gurukool_tour_seen:${userId}`;

export function tourSeen(userId) {
  try {
    return localStorage.getItem(key(userId)) === "1";
  } catch {
    return true;
  }
}

export function markTourSeen(userId) {
  try {
    localStorage.setItem(key(userId), "1");
  } catch {
    // Private browsing can refuse storage; the tour may then show again.
  }
}
