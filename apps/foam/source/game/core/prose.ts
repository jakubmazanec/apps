function write(strings: TemplateStringsArray, values: unknown[]): string[] | string {
  let text = strings.reduce(
    (result, part, index) => result + (index > 0 ? String(values[index - 1]) : '') + part,
    '',
  );
  let pages: string[] = [];
  let lines: string[] = [];

  for (let line of text.split('\n')) {
    let trimmed = line.trim();

    if (trimmed === '') {
      // Blank lines in a row end one page, not several.
      if (lines.length > 0) {
        pages.push(lines.join(' '));
        lines = [];
      }
    } else {
      lines.push(trimmed);
    }
  }

  if (lines.length > 0) {
    pages.push(lines.join(' '));
  }

  if (pages.length === 0) {
    return '';
  }

  return pages.length === 1 ? (pages[0] ?? '') : pages;
}

/**
 * Writes a text so the author may wrap and indent it freely: lines are trimmed and joined with a
 * space, and a blank line ends a page. One page gives a string, several give a list of strings.
 */
export function prose(strings: TemplateStringsArray, ...values: unknown[]): string[] | string {
  return write(strings, values);
}

/**
 * Does what `prose` does, and marks the text as a stand-in. The mark exists only in the source:
 * when the author writes the real text, `standIn` becomes `prose`.
 */
export function standIn(strings: TemplateStringsArray, ...values: unknown[]): string[] | string {
  return prose(strings, ...values);
}
