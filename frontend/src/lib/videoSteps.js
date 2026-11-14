// The steps shown while a video is made, matched to the API's progress milestones (0, 20, 60, 100).
export const STEPS = ["Reading the document", "Writing the script", "Recording the voice and building the video", "Ready"];

export function stepOf(job) {
  if (job.status === "completed" && job.video_status !== "rendering") return STEPS.length - 1;
  if (job.progress >= 60) return 2;
  if (job.progress >= 20) return 1;
  return 0;
}

// The API only reports milestones, so between them the bar eases toward the next one
// without ever reaching it: it keeps moving, and it never claims more than is done.
const NEXT = [
  [60, 100, 120_000],
  [20, 60, 30_000],
  [0, 20, 8_000],
];

export function creep(progress, elapsedMs) {
  if (progress >= 100) return 100;
  const [from, to, pace] = NEXT.find(([start]) => progress >= start);
  const share = 0.9 * (1 - Math.exp(-elapsedMs / pace));
  return progress + (to - from) * share * ((to - progress) / (to - from));
}
