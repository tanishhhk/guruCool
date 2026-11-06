import { useEffect, useState } from "react";
import { Check, Download, MessageSquareText, Play, RotateCcw } from "lucide-react";

import { api, wait } from "../api";
import { Mark } from "../components/Logo";
import { FOCUS } from "../lenses";
import { parseUtc } from "../lib/shelf";
import { STEPS, stepOf, creep } from "../lib/videoSteps";

const ACTIVE = ["queued", "running"];
const LENGTHS = { overview: "Short, about 2 minutes", detailed: "Detailed, about 4 minutes" };

function Options({ value, onChange, options, label }) {
  return (
    <fieldset className="segmented">
      <legend>{label}</legend>
      {options.map(([id, title, line]) => (
        <label key={id} className={value === id ? "is-selected" : ""}>
          <input type="radio" name={label} value={id} checked={value === id} onChange={() => onChange(id)} />
          <span className="segmented-title">{title}</span>
          <span className="segmented-line">{line}</span>
        </label>
      ))}
    </fieldset>
  );
}

// The screen while a video is made: the steps, and a bar that keeps moving between them.
function Making({ job }) {
  const step = stepOf(job);
  const [shown, setShown] = useState(job.progress);
  useEffect(() => {
    const started = Date.now();
    const timer = setInterval(() => setShown(creep(job.progress, Date.now() - started)), 400);
    return () => clearInterval(timer);
  }, [job.progress]);

  return (
    <div className="making" role="status" aria-live="polite">
      <ol className="making-steps">
        {STEPS.map((label, index) => (
          <li key={label} className={index < step ? "is-done" : index === step ? "is-now" : ""}>
            <span className="making-mark" aria-hidden="true">
              {index < step ? <Check size={14} strokeWidth={2.5} /> : index + 1}
            </span>
            {label}
          </li>
        ))}
      </ol>
      <div className="making-track" aria-hidden="true">
        <span style={{ transform: `scaleX(${Math.max(0.03, shown / 100)})` }} />
      </div>
      <p className="making-note">You can read on or ask questions meanwhile; the video keeps going.</p>
    </div>
  );
}

export default function ExplainPanel({ document, focus, usage, onUsed, onAsk }) {
  const [style, setStyle] = useState(focus ? FOCUS[focus].strictness : "exam");
  const [depth, setDepth] = useState("overview");
  const [stories, setStories] = useState(null);
  const [job, setJob] = useState(null);
  const [videoUrl, setVideoUrl] = useState(null);
  const [error, setError] = useState("");
  const [choosing, setChoosing] = useState(false);
  const left = usage ? Math.max(0, usage.limits.story - usage.used.story) : null;

  // This document's stories, newest first; open the latest.
  useEffect(() => {
    let cancelled = false;
    api("/videos")
      .then(async (all) => {
        const mine = all.filter((story) => story.document_id === document.id);
        if (cancelled) return;
        setStories(mine);
        if (mine[0]) {
          const detail = await api(`/videos/${mine[0].id}`);
          if (!cancelled) setJob((current) => current ?? detail);
        }
      })
      .catch(() => !cancelled && setStories([]));
    return () => {
      cancelled = true;
    };
  }, [document.id]);

  // Follow a story while it is written and rendered.
  useEffect(() => {
    if (!job || (!ACTIVE.includes(job.status) && job.video_status !== "rendering")) return undefined;
    let stopped = false;
    (async () => {
      while (!stopped) {
        await wait(2500);
        try {
          const next = await api(`/videos/${job.id}`);
          if (stopped) break;
          setJob(next);
          if (!ACTIVE.includes(next.status) && next.video_status !== "rendering") {
            onUsed();
            break;
          }
        } catch {
          // Keep following through brief network trouble.
        }
      }
    })();
    return () => {
      stopped = true;
    };
  }, [job?.id, job?.status, job?.video_status]); // eslint-disable-line react-hooks/exhaustive-deps

  // The video needs the sign-in header, so fetch it as a blob.
  useEffect(() => {
    if (job?.video_status !== "ready") return undefined;
    let url;
    let cancelled = false;
    api(`/videos/${job.id}/download`, { raw: true })
      .then((response) => response.blob())
      .then((blob) => {
        if (cancelled) return;
        url = URL.createObjectURL(blob);
        setVideoUrl(url);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [job?.id, job?.video_status]);

  const start = async () => {
    setError("");
    setChoosing(false);
    try {
      setVideoUrl(null);
      const created = await api(`/videos/generate/${document.id}`, { method: "POST", body: { strictness: style, depth } });
      setJob(created);
      setStories((previous) => [created, ...(previous ?? []).filter((story) => story.id !== created.id)]);
    } catch (failure) {
      setError(failure.message);
    } finally {
      onUsed();
    }
  };

  const openStory = async (story) => {
    setVideoUrl(null);
    setJob(await api(`/videos/${story.id}`));
  };

  const making = job && (ACTIVE.includes(job.status) || job.video_status === "rendering");
  const hasStory = job?.scenes?.length > 0;
  const outOfVideos = left === 0;

  const setup = (
    <div className="explain-setup">
      <Options
        label="How should it be told?"
        value={style}
        onChange={setStyle}
        options={[
          ["exam", "Explain it simply", "Plain words, like a tutor"],
          ["strict", "Stick to the facts", "Only what the document says"],
        ]}
      />
      <Options
        label="How long?"
        value={depth}
        onChange={setDepth}
        options={[
          ["overview", "Short", "About 2 minutes"],
          ["detailed", "Detailed", "About 4 minutes"],
        ]}
      />
    </div>
  );

  return (
    <div className="explain">
      <div className={`screen${videoUrl ? " has-video" : ""}`}>
        {videoUrl ? (
          <video src={videoUrl} controls className="screen-video" aria-label={`Video explanation: ${job.title}`} />
        ) : making ? (
          <Making job={job} />
        ) : (
          <div className="screen-start">
            <Mark size={44} />
            <h2>{hasStory ? "Make a new video of this document" : "See this document explained"}</h2>
            <p>A narrated video that walks you through what matters, told from the document itself.</p>
            {outOfVideos ? (
              <p className="screen-locked">You have used today's {usage.limits.story} videos. More at midnight UTC.</p>
            ) : (
              <button type="button" className="button button-primary screen-play" onClick={start}>
                <Play size={20} strokeWidth={2} aria-hidden="true" /> Make my video
              </button>
            )}
            <button type="button" className="screen-choose" aria-expanded={choosing} onClick={() => setChoosing(!choosing)}>
              {choosing ? "Hide the options" : `${LENGTHS[depth]}, ${style === "strict" ? "facts only" : "explained simply"}. Change`}
            </button>
          </div>
        )}
      </div>

      {choosing && !making && setup}
      {error && <p className="field-error" role="alert">{error}</p>}
      {job?.status === "failed" && <p className="field-error" role="alert">{job.error}</p>}
      {hasStory && !videoUrl && !making && job.video_error && <p className="notice">{job.video_error}</p>}

      {videoUrl && (
        <div className="explain-after">
          <a className="button button-quiet" href={videoUrl} download={`${document.filename.replace(/\.pdf$/i, "")} explained.mp4`}>
            <Download size={18} strokeWidth={1.75} aria-hidden="true" /> Download
          </a>
          {!outOfVideos && (
            <button type="button" className="button button-quiet" onClick={() => setChoosing(!choosing)}>
              <RotateCcw size={18} strokeWidth={1.75} aria-hidden="true" /> Make another version
            </button>
          )}
          <button type="button" className="button button-quiet" onClick={onAsk}>
            <MessageSquareText size={18} strokeWidth={1.75} aria-hidden="true" /> Ask a question
          </button>
        </div>
      )}
      {videoUrl && choosing && (
        <>
          {setup}
          <button type="button" className="button button-primary explain-go" onClick={start}>
            <Play size={18} strokeWidth={2} aria-hidden="true" /> Make this version
          </button>
        </>
      )}

      {hasStory && (
        <article className="chapter">
          <h2 className="chapter-title">{job.title}</h2>
          <p className="chapter-source">{job.story_source === "ai" ? "The script, as narrated" : "Told in the document's own words"}</p>
          {job.scenes.map((scene, index) => (
            <section key={index} className="scene">
              <h3>{scene.heading}</h3>
              <p>{scene.text}</p>
            </section>
          ))}
        </article>
      )}

      {stories && stories.length > 1 && (
        <section className="versions" aria-labelledby="versions-heading">
          <h2 id="versions-heading">Earlier versions</h2>
          <ul>
            {stories.map((story) => (
              <li key={story.id}>
                <button type="button" className={`version${story.id === job?.id ? " is-current" : ""}`} onClick={() => openStory(story)}>
                  <span>{story.depth === "detailed" ? "Detailed" : "Short"}, {story.strictness === "strict" ? "facts only" : "explained simply"}</span>
                  <span className="folio">
                    {parseUtc(story.created_at)?.toLocaleString(undefined, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
