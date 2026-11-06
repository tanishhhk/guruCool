import { describe, expect, it } from "vitest";

import { parseBlocks, parseInline } from "./markdown";

describe("parseBlocks", () => {
  it("splits paragraphs on blank lines", () => {
    expect(parseBlocks("One line.\n\nTwo line.")).toEqual([
      { type: "p", text: "One line." },
      { type: "p", text: "Two line." },
    ]);
  });

  it("reads headings", () => {
    expect(parseBlocks("## The idea\nText")).toEqual([
      { type: "h", text: "The idea" },
      { type: "p", text: "Text" },
    ]);
  });

  it("reads bullet and numbered lists", () => {
    expect(parseBlocks("- a\n- b\n\n1. c\n2) d")).toEqual([
      { type: "ul", items: ["a", "b"] },
      { type: "ol", items: ["c", "d"] },
    ]);
  });

  it("reads a pipe table with a separator row", () => {
    expect(parseBlocks("| Topic | Answer |\n|---|:---:|\n| A | one |\n| B | two |")).toEqual([
      { type: "table", head: ["Topic", "Answer"], rows: [["A", "one"], ["B", "two"]] },
    ]);
  });

  it("keeps a pipe block without a separator as a paragraph", () => {
    expect(parseBlocks("| a | b |")).toEqual([{ type: "p", text: "| a | b |" }]);
  });

  it("trims rows with extra cells and pads short ones", () => {
    const [table] = parseBlocks("| A | B |\n|---|---|\n| 1 | 2 | 3 |\n| 4 |");
    expect(table.rows).toEqual([["1", "2"], ["4", ""]]);
  });

  it("joins wrapped lines of one paragraph", () => {
    expect(parseBlocks("first half\nsecond half")).toEqual([{ type: "p", text: "first half second half" }]);
  });

  it("keeps an answer line under a numbered question in the same item", () => {
    expect(parseBlocks("1. What is X?\nAnswer: A thing.\n2. Why?\nAnswer: Because.")).toEqual([
      { type: "ol", items: ["What is X?\nAnswer: A thing.", "Why?\nAnswer: Because."] },
    ]);
  });
});

describe("parseInline", () => {
  it("reads bold, italics and code", () => {
    expect(parseInline("a **b** _c_ `d`")).toEqual([
      { type: "text", text: "a " },
      { type: "strong", text: "b" },
      { type: "text", text: " " },
      { type: "em", text: "c" },
      { type: "text", text: " " },
      { type: "code", text: "d" },
    ]);
  });

  it("leaves no stray asterisks from unclosed bold", () => {
    expect(parseInline("**unclosed text")).toEqual([{ type: "text", text: "unclosed text" }]);
  });

  it("merges adjacent citations into one token after the text", () => {
    expect(parseInline("operations.[S1][S2]")).toEqual([
      { type: "text", text: "operations." },
      { type: "cite", ids: ["S1", "S2"] },
    ]);
  });

  it("reads citations with commas and spaces", () => {
    expect(parseInline("x [S1, S3] y")).toEqual([
      { type: "text", text: "x" },
      { type: "cite", ids: ["S1", "S3"] },
      { type: "text", text: " y" },
    ]);
  });
});
