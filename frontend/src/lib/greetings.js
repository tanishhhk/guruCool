// Greetings for the home screen. Each part of the day has a few lines; one is
// picked per user and kept for that window of that day, so a refresh does not
// change it, but the next window (or the next day) brings a new one.
// Every line names the person as ", {name}" so it reads cleanly without a name too.

export const WINDOWS = [
  {
    id: "late",
    until: 5,
    lines: ["Up late, {name}?", "Burning the midnight oil, {name}?", "The quiet hours, {name}. Good for reading."],
  },
  {
    id: "morning",
    until: 12,
    lines: ["Good morning, {name}.", "Morning, {name}. Fresh mind, fresh pages.", "Rise and read, {name}."],
  },
  {
    id: "afternoon",
    until: 17,
    lines: ["Good afternoon, {name}.", "Afternoon, {name}. What are we reading?", "Back at it, {name}?"],
  },
  {
    id: "evening",
    until: 21,
    lines: ["Good evening, {name}.", "Evening, {name}. One more chapter?", "Winding down, {name}?"],
  },
  {
    id: "night",
    until: 24,
    lines: ["Still at it, {name}?", "A page or two before bed, {name}?", "Good night for reading, {name}."],
  },
];

// The guru's tips. All true of the product; video tips are left out for people without videos.
export const TIPS = [
  { text: "Stuck on an answer? Tap Simpler and I will say it again, plainer." },
  { text: "Every answer shows its page. Open the chip to read the passage itself." },
  { text: "Ask in your own words. The document does not need to use them." },
  { text: "Your chats stay with each document, ready when you come back." },
  { text: "A short video is the quickest way into a long document.", videos: true },
  { text: "Pick the voice and the length of your video before you make it.", videos: true },
];

export function windowOf(now = new Date()) {
  const hour = now.getHours();
  return WINDOWS.find((window) => hour < window.until);
}

export function fill(line, name) {
  return name ? line.replace("{name}", name) : line.replace(", {name}", "");
}

const dayOf = (now) => `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;

// The greeting for this user now. `store` is localStorage in the app; tests pass a Map-like stub.
export function greetingFor(userId, name, { now = new Date(), store = localStorage, random = Math.random } = {}) {
  const window = windowOf(now);
  const key = `gurucool_greeting:${userId}`;
  const stamp = `${dayOf(now)}:${window.id}`;
  let index;
  try {
    const saved = JSON.parse(store.getItem(key) || "null");
    if (saved?.stamp === stamp && Number.isInteger(saved.index) && window.lines[saved.index]) index = saved.index;
  } catch {
    // A damaged entry just means a fresh pick.
  }
  if (index === undefined) {
    index = Math.floor(random() * window.lines.length);
    try {
      store.setItem(key, JSON.stringify({ stamp, index }));
    } catch {
      // Private browsing can refuse storage; the greeting still shows.
    }
  }
  return fill(window.lines[index], name);
}

// A fresh tip on every visit.
export function tipFor({ videos = true, random = Math.random } = {}) {
  const pool = TIPS.filter((tip) => videos || !tip.videos);
  return pool[Math.floor(random() * pool.length)].text;
}
