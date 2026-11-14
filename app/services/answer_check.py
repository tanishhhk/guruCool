"""Fast checks on a drafted answer before it is shown. No model calls: plain text comparisons.

An answer should explain the document in its own words and state only what the
passages support. These checks catch the common failures cheaply:

- copied: a long run of words lifted from a passage (the model pasted instead of explaining);
- figures: a number that appears in no passage and not in the question (possibly invented);
- uncited: a substantive answer with no source ids at all.

llm.generate_answer asks for one rewrite only when a check fails, so a clean
answer costs nothing extra.
"""
import re
from dataclasses import dataclass

# Ten or more consecutive words copied from a passage counts as pasting.
# The answer rules allow quoting up to eight words when the exact wording matters.
COPY_RUN_WORDS = 10

_CITATION = re.compile(r"[\[【［]\s*S\d{1,3}[^\]】］]*[\]】］]")
_LIST_MARKER = re.compile(r"(?m)^\s*(?:\d{1,2}[.)]|[-*•])\s+")
# A number not glued to letters: "Q4", "H1" and "S2" are labels, not figures.
_NUMBER = re.compile(r"(?<![A-Za-z\d.,])\d+(?:[.,]\d+)*(?![A-Za-z])")
_WORD = re.compile(r"[a-z0-9]+(?:'[a-z]+)?")


@dataclass(frozen=True)
class Problem:
    kind: str  # copied, figures, uncited
    detail: str


def _plain(text: str) -> str:
    """The answer as prose: no citations, list markers or markdown emphasis."""
    text = _CITATION.sub(" ", text)
    text = _LIST_MARKER.sub(" ", text)
    return re.sub(r"[*_`#|>]", " ", text)


def _words(text: str) -> list[str]:
    return _WORD.findall(text.lower().replace("’", "'"))


def _figures(text: str) -> set[str]:
    """Numbers by value as written: "4,820" matches "4820", and "22.0" matches "22"."""
    found = set()
    for raw in _NUMBER.findall(text):
        if re.fullmatch(r"\d{1,3}(?:,\d{3})+(?:\.\d+)?", raw):
            raw = raw.replace(",", "")
        value = raw.replace(",", ".")
        if "." in value:
            value = value.rstrip("0").rstrip(".")
        found.add(value)
    return found


def copied_run(answer: str, passages: list[str], length: int = COPY_RUN_WORDS) -> str | None:
    """The first run of `length` answer words that appears word for word in a passage."""
    words = _words(_plain(answer))
    if len(words) < length:
        return None
    runs = set()
    for passage in passages:
        tokens = _words(passage)
        runs.update(tuple(tokens[i : i + length]) for i in range(len(tokens) - length + 1))
    for i in range(len(words) - length + 1):
        if tuple(words[i : i + length]) in runs:
            return " ".join(words[i : i + length])
    return None


def unsupported_figures(answer: str, passages: list[str], question: str = "") -> list[str]:
    """Numbers in the answer that no passage (and not the question) contains."""
    known = _figures(" ".join(passages)) | _figures(question)
    return sorted(_figures(_plain(answer)) - known, key=lambda value: (len(value), value))


def review(answer: str, sources, question: str = "", not_found: str = "") -> list[Problem]:
    """Every problem found in a drafted answer, most important first."""
    if not answer.strip() or (not_found and not_found.lower() in answer.lower()):
        return []
    passages = [source.text for source in sources]
    problems = []
    figures = unsupported_figures(answer, passages, question)
    if figures:
        problems.append(Problem("figures", ", ".join(figures[:8])))
    run = copied_run(answer, passages)
    if run:
        problems.append(Problem("copied", run))
    if not _CITATION.search(answer):
        problems.append(Problem("uncited", ""))
    return problems


def describe(problems: list[Problem]) -> str:
    """The problems as instructions for a rewrite."""
    lines = []
    for problem in problems:
        if problem.kind == "figures":
            lines.append(
                f"- These figures appear in no source: {problem.detail}. Remove them, or use the figures the sources give."
            )
        elif problem.kind == "copied":
            lines.append(
                f'- This part repeats the document word for word: "{problem.detail}". Explain it in your own simple words.'
            )
        elif problem.kind == "uncited":
            lines.append("- Add the source id in square brackets after each point, for example [S1].")
    return "\n".join(lines)
