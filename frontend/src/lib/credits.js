// Daily credits: what is left, and when it refills.
export function creditsLeft(usage, kind) {
  if (!usage) return null;
  return Math.max(0, usage.limits[kind] - usage.used[kind]);
}

export function resetIn(seconds) {
  const minutes = Math.max(1, Math.ceil(seconds / 60 - 0.5));
  const hours = Math.floor(minutes / 60);
  return hours ? `${hours} h ${minutes % 60} min` : `${minutes} min`;
}
