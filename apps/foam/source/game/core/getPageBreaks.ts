// Takes a text already wrapped with wrapText and returns the offsets at which
// the dialogue runner pauses: the offset just after the newline that ends each
// full page. wrapText keeps the length of the text, so an offset in the
// wrapped text is the same offset in the authored one.
export function getPageBreaks(wrapped: string, linesPerPage: number): number[] {
  let pageSize = Math.max(1, Math.floor(linesPerPage));
  let lines = wrapped.split('\n');
  let breaks: number[] = [];
  let offset = 0;

  for (let [index, line] of lines.entries()) {
    // The line and the newline after it. The last line has no newline, and it
    // is never a break: the end of the text is where the runner stops anyway.
    offset += line.length + 1;

    if ((index + 1) % pageSize === 0 && index < lines.length - 1) {
      breaks.push(offset);
    }
  }

  return breaks;
}
