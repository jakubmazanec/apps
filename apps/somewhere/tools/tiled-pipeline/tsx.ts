import {XMLParser} from 'fast-xml-parser';

export type XmlElement = {
  name: string;
  attributes: Record<string, string>;
  children: XmlElement[];
  text?: string;
};

export type XmlDocument = {
  declaration: string;
  newline: string;
  root: XmlElement;
};

// A comment is carried as an element whose name is one no XML element can have,
// with the raw comment body in `text`. That keeps comments inside the same
// children arrays the pipeline already walks — every lookup here goes through
// findChild/findChildren, which match on name, so a comment is invisible to the
// mutating code and still lands back on disk where its author left it.
export const COMMENT_NAME = '#comment';

// Tiled writes each element's attributes in a fixed, non-alphabetical order.
// Existing attributes keep whatever order the source had; a NEW one is spliced
// in here, so a pipeline-written file and a Tiled-written one converge instead
// of ping-ponging on every save.
const ATTRIBUTE_ORDER: Record<string, string[]> = {
  frame: ['tileid', 'duration'],
  image: ['format', 'source', 'trans', 'width', 'height'],
  object: ['id', 'name', 'type', 'x', 'y', 'width', 'height', 'rotation', 'gid', 'visible'],
  objectgroup: ['draworder', 'id', 'name', 'color', 'opacity', 'visible', 'offsetx', 'offsety'],
  property: ['name', 'type', 'propertytype', 'value'],
  tile: ['id', 'type', 'probability'],
  tileset: [
    'version',
    'tiledversion',
    'name',
    'class',
    'tilewidth',
    'tileheight',
    'spacing',
    'margin',
    'tilecount',
    'columns',
    'objectalignment',
    'tilerendersize',
    'fillmode',
    'backgroundcolor',
  ],
};
const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  '\n': '&#10;',
};
let parser = new XMLParser({
  attributeNamePrefix: '@_',
  // Without this the parser drops comments, and a hand-authored note would
  // disappear on the next sync with nothing said about it.
  commentPropName: COMMENT_NAME,
  ignoreAttributes: false,
  parseAttributeValue: false,
  parseTagValue: false,
  preserveOrder: true,
  processEntities: true,
  trimValues: true,
});

// fast-xml-parser's preserveOrder shape is an array of single-key objects, with
// attributes under ':@' and text under '#text'. Converting it once into a plain
// tree keeps every other module free of that shape.
function toElement(node: Record<string, unknown>): XmlElement | undefined {
  let name = Object.keys(node).find((key) => key !== ':@');

  if (name === undefined || name === '#text' || name.startsWith('?')) {
    return undefined;
  }

  if (name === COMMENT_NAME) {
    // The parser hands the comment body back neither trimmed nor entity-decoded,
    // so writing it out verbatim between the delimiters reproduces the source bytes.
    let [body] = (node[name] ?? []) as Array<Record<string, unknown>>;

    return {name, attributes: {}, children: [], text: String(body?.['#text'] ?? '')};
  }

  let attributes: Record<string, string> = {};
  let rawAttributes = (node[':@'] ?? {}) as Record<string, string>;

  for (let [key, value] of Object.entries(rawAttributes)) {
    attributes[key.replace('@_', '')] = String(value);
  }

  let element: XmlElement = {name, attributes, children: []};
  let rawChildren = (node[name] ?? []) as Array<Record<string, unknown>>;

  for (let rawChild of rawChildren) {
    if ('#text' in rawChild) {
      element.text = String(rawChild['#text']);

      continue;
    }

    let child = toElement(rawChild);

    if (child) {
      element.children.push(child);
    }
  }

  return element;
}

export function parseXmlDocument(text: string): XmlDocument {
  let newline = text.includes('\r\n') ? '\r\n' : '\n';
  let declarationMatch = /^<\?xml[^?]*\?>/u.exec(text);
  let nodes = parser.parse(text) as Array<Record<string, unknown>>;
  let root: XmlElement | undefined;

  for (let node of nodes) {
    let element = toElement(node);

    // Only the root element and its descendants have somewhere to live in this
    // model, so a comment beside the root is refused rather than dropped: the
    // one outcome worth ruling out is losing it without saying so.
    if (element?.name === COMMENT_NAME) {
      throw new Error(
        'The XML document has a comment outside its root element, which this writer cannot reproduce! Move it inside the root element.',
      );
    }

    root ??= element;
  }

  if (!root) {
    throw new Error('The XML document has no root element!');
  }

  return {
    declaration: declarationMatch?.[0] ?? '<?xml version="1.0" encoding="UTF-8"?>',
    newline,
    root,
  };
}

export function parseTsx(text: string): XmlDocument {
  let document = parseXmlDocument(text);

  if (document.root.name !== 'tileset') {
    throw new Error(`Expected a <tileset> root element, found <${document.root.name}>!`);
  }

  return document;
}

function escapeAttribute(value: string): string {
  return value.replaceAll(/[&<>"\n]/gu, (character) => ESCAPES[character] as string);
}

function formatElement(element: XmlElement, depth: number, newline: string): string {
  let indent = ' '.repeat(depth);

  if (element.name === COMMENT_NAME) {
    return `${indent}<!--${element.text ?? ''}-->${newline}`;
  }

  let attributes = Object.entries(element.attributes)
    .map(([name, value]) => ` ${name}="${escapeAttribute(value)}"`)
    .join('');

  if (element.children.length === 0 && element.text === undefined) {
    return `${indent}<${element.name}${attributes}/>${newline}`;
  }

  if (element.children.length === 0) {
    let text = escapeAttribute(element.text as string);

    return `${indent}<${element.name}${attributes}>${text}</${element.name}>${newline}`;
  }

  let children = element.children.map((child) => formatElement(child, depth + 1, newline)).join('');

  return `${indent}<${element.name}${attributes}>${newline}${children}${indent}</${element.name}>${newline}`;
}

export function formatTsx(document: XmlDocument): string {
  return (
    document.declaration + document.newline + formatElement(document.root, 0, document.newline)
  );
}

export function getAttribute(element: XmlElement, name: string): string | undefined {
  return element.attributes[name];
}

export function getNumericAttribute(element: XmlElement, name: string): number | undefined {
  let value = element.attributes[name];

  return value === undefined ? undefined : Number(value);
}

export function setAttribute(element: XmlElement, name: string, value: string): void {
  if (name in element.attributes) {
    element.attributes[name] = value;

    return;
  }

  let order = ATTRIBUTE_ORDER[element.name] ?? [];
  let position = order.indexOf(name);
  let reordered: Record<string, string> = {};
  let inserted = false;

  for (let [existingName, existingValue] of Object.entries(element.attributes)) {
    let existingPosition = order.indexOf(existingName);

    if (!inserted && position >= 0 && (existingPosition < 0 || existingPosition > position)) {
      reordered[name] = value;
      inserted = true;
    }

    reordered[existingName] = existingValue;
  }

  if (!inserted) {
    reordered[name] = value;
  }

  element.attributes = reordered;
}

export function removeAttribute(element: XmlElement, name: string): void {
  delete element.attributes[name];
}

export function findChild(element: XmlElement, name: string): XmlElement | undefined {
  return element.children.find((child) => child.name === name);
}

export function findChildren(element: XmlElement, name: string): XmlElement[] {
  return element.children.filter((child) => child.name === name);
}

export function createElement(name: string, attributes: Record<string, string>): XmlElement {
  return {name, attributes, children: []};
}
