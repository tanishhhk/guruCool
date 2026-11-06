// "p. 4" or "pp. 4 to 6" for a cited passage.
export function pagesOf(source) {
  if (!source?.page_start) return "";
  return source.page_start === source.page_end ? `p. ${source.page_start}` : `pp. ${source.page_start} to ${source.page_end}`;
}
