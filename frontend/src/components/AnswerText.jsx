import { Fragment } from "react";

import { parseBlocks, parseInline } from "../lib/markdown";
import { pagesOf } from "../lib/pages";

// One line of text: bold, italics, code, and citations shown as page chips.
function Inline({ text, pages }) {
  return parseInline(text).map((token, index) => {
    if (token.type === "strong") return <strong key={index}>{token.text}</strong>;
    if (token.type === "em") return <em key={index}>{token.text}</em>;
    if (token.type === "code") return <code key={index}>{token.text}</code>;
    if (token.type === "cite") {
      const labels = [...new Set(token.ids.map((id) => pages[id]).filter(Boolean))];
      return labels.length ? (
        <span key={index} className="cite-chip folio">
          {labels.join(", ")}
        </span>
      ) : null;
    }
    return <Fragment key={index}>{token.text}</Fragment>;
  });
}

// Lines inside one list item, such as a question and its "Answer:" line.
function Lines({ text, pages }) {
  return text.split("\n").map((line, index) => (
    <Fragment key={index}>
      {index > 0 && <br />}
      <Inline text={line} pages={pages} />
    </Fragment>
  ));
}

export default function AnswerText({ text, sources = [] }) {
  const pages = Object.fromEntries(sources.map((source) => [source.source_id, pagesOf(source)]));
  return (
    <div className="answer-text">
      {parseBlocks(text).map((block, index) => {
        if (block.type === "h") return <h3 key={index}><Inline text={block.text} pages={pages} /></h3>;
        if (block.type === "p") return <p key={index}><Inline text={block.text} pages={pages} /></p>;
        if (block.type === "table") {
          return (
            <div key={index} className="answer-table">
              <table>
                <thead>
                  <tr>{block.head.map((cell, i) => <th key={i} scope="col"><Inline text={cell} pages={pages} /></th>)}</tr>
                </thead>
                <tbody>
                  {block.rows.map((row, r) => (
                    <tr key={r}>{row.map((cell, i) => <td key={i}><Inline text={cell} pages={pages} /></td>)}</tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }
        const List = block.type === "ol" ? "ol" : "ul";
        return (
          <List key={index}>
            {block.items.map((item, i) => <li key={i}><Lines text={item} pages={pages} /></li>)}
          </List>
        );
      })}
    </div>
  );
}
