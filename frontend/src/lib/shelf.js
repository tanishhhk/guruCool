// Muted cloth tones for the notebooks on the shelf, picked from the document id.
const TONES = ["#3f6672", "#5d6f4f", "#7b5d4e", "#4e5c7c", "#6c5777", "#6f6b4b"];

export function spineTone(id) {
  let hash = 0;
  for (const char of String(id)) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return TONES[hash % TONES.length];
}

// The API sends UTC times without a zone.
export function parseUtc(value) {
  if (!value) return null;
  return new Date(/[zZ]|[+-]\d\d:\d\d$/.test(value) ? value : `${value}Z`);
}

const DAY = 24 * 60 * 60 * 1000;

export function groupByRecency(items, now = new Date()) {
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const groups = [
    { label: "Today", items: [] },
    { label: "This week", items: [] },
    { label: "Earlier", items: [] },
  ];
  for (const item of items) {
    const at = parseUtc(item.last_activity_at || item.upload_date)?.getTime() ?? 0;
    if (at >= startOfToday) groups[0].items.push(item);
    else if (at >= startOfToday - 6 * DAY) groups[1].items.push(item);
    else groups[2].items.push(item);
  }
  return groups.filter((group) => group.items.length > 0);
}
