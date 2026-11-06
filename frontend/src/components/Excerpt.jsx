import { pagesOf } from "../lib/pages";

const WORD = /[a-z0-9]{4,}/g;
const HEADING = /^(section|chapter|part|article|clause)\s+[\d.]+\.?$/i;

// Highlight the sentence of a passage that best matches the answer (or, for the
// no-AI fallback, the question). Headings and fragments are never highlighted.
export default function Excerpt({ source, against }) {
  const cut = source.preview.length >= 360;
  let text = source.preview.trim();
  if (cut) {
    text = text.slice(0, text.lastIndexOf(" ")).trimEnd();
    if (!/[.!?]$/.test(text)) text += "…"; // No ellipsis after a full stop.
  }
  // Lines are split too, so a heading line never joins the sentence under it.
  const sentences = text.split(/(?<=[.!?])\s+|\s*\n+\s*/).filter(Boolean);
  // Compare word stems (first five letters), so "expense" matches "expenses".
  const stems = (value) => (value.toLowerCase().match(WORD) || []).map((word) => word.slice(0, 5));
  const wanted = new Set(stems(against));
  const scores = sentences.map((sentence) =>
    sentence.split(/\s+/).length < 5 || HEADING.test(sentence.trim())
      ? 0
      : stems(sentence).filter((stem) => wanted.has(stem)).length,
  );
  const top = Math.max(...scores);
  const best = top > 0 ? scores.indexOf(top) : -1;
  return (
    <blockquote className="excerpt">
      <span className="excerpt-page folio">{pagesOf(source)}</span>
      <p>
        {sentences.map((sentence, index) => (
          <span key={index}>
            {index === best ? <span className="hl">{sentence}</span> : sentence}{" "}
          </span>
        ))}
      </p>
    </blockquote>
  );
}
