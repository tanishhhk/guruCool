// Progress for one PDF: the upload is measured, the reading is estimated from the file size.
export const UPLOAD_STEPS = ["Uploading", "Reading the pages", "Finding the key ideas", "Ready"];

const UPLOAD_SHARE = 30;
const READING_CAP = 92;

export function uploadSteps({ phase, failedPhase, uploaded = 0, elapsedMs = 0, sizeBytes = 0 }) {
  const at = phase === "error" ? failedPhase : phase;
  let percent = 0;
  let step = 0;
  if (at === "uploading") {
    percent = Math.round(UPLOAD_SHARE * Math.min(1, Math.max(0, uploaded)));
  } else if (at === "reading") {
    const estimate = 4000 + sizeBytes / 2000;
    const share = 1 - Math.exp(-elapsedMs / estimate);
    percent = Math.round(UPLOAD_SHARE + (READING_CAP - UPLOAD_SHARE) * share);
    step = elapsedMs < estimate * 0.6 ? 1 : 2;
  } else if (at === "ready") {
    percent = 100;
    step = UPLOAD_STEPS.length - 1;
  }
  return { percent, step, failed: phase === "error" };
}
