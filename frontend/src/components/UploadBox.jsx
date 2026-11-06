import { useEffect, useRef, useState } from "react";
import { Check, FileText, Upload } from "lucide-react";

import { uploadPdf, wait, waitForDocument } from "../api";
import { UPLOAD_STEPS, uploadSteps } from "../lib/uploadSteps";

const MAX_BYTES = 10 * 1024 * 1024;

async function sampleFile() {
  const response = await fetch(`${import.meta.env.BASE_URL}sample-handbook.pdf`);
  return new File([await response.blob()], "Northwind employee handbook.pdf", { type: "application/pdf" });
}

function Progress({ state }) {
  const [now, setNow] = useState(() => Date.now());
  const running = state.phase === "uploading" || state.phase === "reading";
  useEffect(() => {
    if (!running) return undefined;
    const timer = setInterval(() => setNow(Date.now()), 300);
    return () => clearInterval(timer);
  }, [running]);

  const { percent, step, failed } = uploadSteps({
    ...state,
    elapsedMs: state.readingSince ? (state.stoppedAt ?? now) - state.readingSince : 0,
  });

  return (
    <div className={`upload-progress${failed ? " is-failed" : ""}`} role="status" aria-live="polite">
      <p className="upload-file">
        <FileText size={18} strokeWidth={1.75} aria-hidden="true" />
        <strong>{state.name}</strong>
        <span className="upload-percent folio">{percent}%</span>
      </p>
      <div
        className="upload-track"
        role="progressbar"
        aria-label={`Reading ${state.name}`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
      >
        <span style={{ transform: `scaleX(${Math.max(0.02, percent / 100)})` }} />
      </div>
      <ol className="upload-steps">
        {UPLOAD_STEPS.map((label, index) => (
          <li key={label} className={index < step || state.phase === "ready" ? "is-done" : index === step && !failed ? "is-now" : ""}>
            {(index < step || state.phase === "ready") && <Check size={14} strokeWidth={2.5} aria-hidden="true" />}
            {label}
          </li>
        ))}
      </ol>
    </div>
  );
}

// Pick or drop a PDF, upload it, and wait until it has been read.
export default function UploadBox({ onReady, offerSample = false, compact = false }) {
  const input = useRef(null);
  const [state, setState] = useState({ phase: "idle" });
  const [over, setOver] = useState(false);
  const busy = state.phase === "uploading" || state.phase === "reading" || state.phase === "ready";

  const send = async (file) => {
    if (!file || busy) return;
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      setState({ phase: "invalid", message: "That is not a PDF. Choose a .pdf file." });
      return;
    }
    if (file.size > MAX_BYTES) {
      setState({ phase: "invalid", message: "That PDF is over 10 MB. Try a smaller file or split it." });
      return;
    }
    const base = { name: file.name, sizeBytes: file.size };
    const fail = (failedPhase, message, readingSince) =>
      setState({ ...base, phase: "error", failedPhase, message, readingSince, stoppedAt: Date.now(), uploaded: 1 });
    let readingSince;
    try {
      setState({ ...base, phase: "uploading", uploaded: 0 });
      const created = await uploadPdf(file, (uploaded) => setState((current) => ({ ...current, uploaded })));
      readingSince = Date.now();
      setState({ ...base, phase: "reading", uploaded: 1, readingSince });
      const document = await waitForDocument(created.id);
      if (document.status === "failed") {
        fail("reading", document.error_message || "This PDF could not be read.", readingSince);
        return;
      }
      setState({ ...base, phase: "ready", uploaded: 1, readingSince, stoppedAt: Date.now() });
      await wait(700); // Let the full bar and the last tick be seen.
      setState({ phase: "idle" });
      onReady(document);
    } catch (error) {
      fail(readingSince ? "reading" : "uploading", error.message, readingSince);
    }
  };

  const showProgress = busy || state.phase === "error";

  return (
    <div className={`upload${compact ? " upload-compact" : ""}`}>
      {showProgress ? (
        <Progress state={state} />
      ) : (
        <div
          className={`upload-drop${over ? " is-over" : ""}`}
          onDragOver={(event) => {
            event.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(event) => {
            event.preventDefault();
            setOver(false);
            send(event.dataTransfer.files[0]);
          }}
        >
          <Upload size={compact ? 20 : 28} strokeWidth={1.6} aria-hidden="true" />
          <p className="upload-line">
            Drop a PDF here, or{" "}
            <button type="button" className="upload-pick" onClick={() => input.current?.click()}>
              choose a file
            </button>
          </p>
          <p className="upload-limits">Up to 10 MB and 100 pages. Text PDFs only; scans have no text to read.</p>
        </div>
      )}
      <input
        ref={input}
        type="file"
        accept="application/pdf,.pdf"
        className="visually-hidden"
        tabIndex={-1}
        onChange={(event) => {
          send(event.target.files[0]);
          event.target.value = "";
        }}
      />

      {(state.phase === "error" || state.phase === "invalid") && (
        <div className="upload-error">
          <p className="field-error" role="alert">
            {state.message}
          </p>
          {state.phase === "error" && (
            <button type="button" className="button button-quiet" onClick={() => setState({ phase: "idle" })}>
              Try another file
            </button>
          )}
        </div>
      )}

      {offerSample && !showProgress && (
        <button type="button" className="button button-quiet upload-sample" onClick={async () => send(await sampleFile())}>
          <FileText size={18} strokeWidth={1.75} aria-hidden="true" />
          Try the sample handbook instead
        </button>
      )}
    </div>
  );
}
