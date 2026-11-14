// A small reader for the light markdown models write: headings, paragraphs,
// lists, pipe tables, bold, italics, code and [S1] citations. Anything it does
// not recognise stays plain text, so messy output still reads cleanly.

const HEADING = /^#{1,6}\s+(.*?)\s*#*$/;
const LIST_ITEM = /^\s*(?:([-*•])|(\d+)[.)])\s+(.*)$/;
const TABLE_ROW = /^\s*\|.*\|?\s*$/;
const TABLE_RULE = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;

function cells(line) {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

export function parseBlocks(text) {
  const lines = String(text ?? "").replace(/\r\n?/g, "\n").split("\n");
  const blocks = [];
  let current = null; // the open paragraph or list

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      current = null;
      continue;
    }

    if (TABLE_ROW.test(trimmed) && i + 1 < lines.length && TABLE_RULE.test(lines[i + 1])) {
      const head = cells(trimmed);
      const rows = [];
      i += 2;
      while (i < lines.length && TABLE_ROW.test(lines[i].trim()) && lines[i].trim()) {
        const row = cells(lines[i]).slice(0, head.length);
        while (row.length < head.length) row.push("");
        rows.push(row);
        i += 1;
      }
      i -= 1;
      blocks.push({ type: "table", head, rows });
      current = null;
      continue;
    }

    const heading = trimmed.match(HEADING);
    if (heading) {
      blocks.push({ type: "h", text: heading[1] });
      current = null;
      continue;
    }

    const item = line.match(LIST_ITEM);
    if (item) {
      const type = item[1] ? "ul" : "ol";
      if (current?.type !== type) {
        current = { type, items: [] };
        blocks.push(current);
      }
      current.items.push(item[3].trim());
      continue;
    }

    if (current?.type === "ul" || current?.type === "ol") {
      // A line under a list item belongs to it, such as "Answer: ..." under a question.
      const last = current.items.length - 1;
      current.items[last] = `${current.items[last]}\n${trimmed}`;
      continue;
    }

    if (current?.type === "p") {
      current.text = `${current.text} ${trimmed}`;
      continue;
    }

    current = { type: "p", text: trimmed };
    blocks.push(current);
  }
  return blocks;
}

const TOKEN = new RegExp(
  [
    String.raw`(\[\s*S\d{1,3}(?:\s*[,;]\s*S\d{1,3})*\s*\]|【[^】]*】)`, // 1 citation
    String.raw`\*\*([^*\n]+?)\*\*`, // 2 bold
    "`([^`\\n]+)`", // 3 code
    String.raw`(?<![\w*])\*([^*\n]+?)\*(?![\w*])`, // 4 italics
    String.raw`(?<![\w_])_([^_\n]+?)_(?![\w_])`, // 5 italics
  ].join("|"),
  "g",
);

// Leftover markers from unclosed bold or italics.
function plain(text) {
  return text.replace(/\*\*/g, "").replace(/(^|\s)[*_]+|[*_]+(\s|$)/g, "$1$2");
}

export function parseInline(text) {
  const tokens = [];
  const source = String(text ?? "");
  let at = 0;
  const pushText = (value) => {
    const cleaned = plain(value);
    if (cleaned) tokens.push({ type: "text", text: cleaned });
  };

  for (const match of source.matchAll(TOKEN)) {
    pushText(source.slice(at, match.index));
    at = match.index + match[0].length;
    if (match[1]) {
      const ids = (match[1].match(/S\d{1,3}/g) || []).map((id) => `S${Number(id.slice(1))}`);
      const last = tokens[tokens.length - 1];
      if (last?.type === "text") {
        last.text = last.text.trimEnd();
        if (!last.text) tokens.pop();
      }
      const previous = tokens[tokens.length - 1];
      if (previous?.type === "cite") {
        for (const id of ids) if (!previous.ids.includes(id)) previous.ids.push(id);
      } else {
        tokens.push({ type: "cite", ids: [...new Set(ids)] });
      }
    } else if (match[2]) tokens.push({ type: "strong", text: match[2] });
    else if (match[3]) tokens.push({ type: "code", text: match[3] });
    else tokens.push({ type: "em", text: match[4] ?? match[5] });
  }
  pushText(source.slice(at));

  // "leave [S1]." reads better as "leave. [S1]": move the punctuation before the chip.
  for (let i = 1; i < tokens.length - 1; i += 1) {
    const [before, cite, after] = [tokens[i - 1], tokens[i], tokens[i + 1]];
    const mark = after.type === "text" && after.text.match(/^[.,;:!?]+/);
    if (cite.type === "cite" && before.type === "text" && mark) {
      before.text += mark[0];
      after.text = after.text.slice(mark[0].length);
    }
  }
  return tokens.filter((token) => token.type !== "text" || token.text);
}
