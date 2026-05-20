// Scale numeric fields in a BMFont .fnt (XML) file by a given integer factor.
// Usage: node scripts/scale-fnt.mjs <path> <factor>
// In-place edit. NOT idempotent — running twice scales twice.

import {readFileSync, writeFileSync} from 'node:fs';
import {argv} from 'node:process';

const SCALED_ATTRS = {
  info: ['size', 'spacing', 'padding', 'outline'],
  common: ['lineHeight', 'base', 'scaleW', 'scaleH'],
  char: ['x', 'y', 'width', 'height', 'xoffset', 'yoffset', 'xadvance'],
  kerning: ['amount'],
};

function scaleCsv(value, factor) {
  return value
    .split(',')
    .map((n) => String(Math.round(Number(n) * factor)))
    .join(',');
}

function scaleSingle(value, factor) {
  return String(Math.round(Number(value) * factor));
}

function scaleLine(line, factor) {
  const tagMatch = line.match(/<(\w+)\b/);

  if (!tagMatch) {
    return line;
  }

  const tag = tagMatch[1];
  const attrs = SCALED_ATTRS[tag];

  if (!attrs) {
    return line;
  }

  let out = line;

  for (const attr of attrs) {
    out = out.replace(new RegExp(`(\\b${attr}=")([^"]+)(")`), (_, p1, value, p3) => {
      const scaled = value.includes(',') ? scaleCsv(value, factor) : scaleSingle(value, factor);

      return `${p1}${scaled}${p3}`;
    });
  }

  return out;
}

function main() {
  const [, , path, factorArg] = argv;

  if (!path || !factorArg) {
    console.error('Usage: node scripts/scale-fnt.mjs <path> <factor>');
    process.exit(1);
  }

  const factor = Number(factorArg);

  if (!Number.isFinite(factor) || factor <= 0) {
    console.error(`Invalid factor: ${factorArg}`);
    process.exit(1);
  }

  console.warn(`Scaling ${path} by ${factor}× (NOT idempotent — do not run twice).`);

  const input = readFileSync(path, 'utf8');
  const eol = input.includes('\r\n') ? '\r\n' : '\n';
  const output = input
    .split(/\r?\n/)
    .map((line) => scaleLine(line, factor))
    .join(eol);

  writeFileSync(path, output, 'utf8');
  console.log(`Wrote ${path}`);
}

main();
