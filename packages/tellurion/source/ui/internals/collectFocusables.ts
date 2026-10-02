import {type Focusable} from '../Focusable.js';
import {type UiChild, type UiParent} from '../UiChild.js';

function walk(node: UiChild, result: Focusable[]): void {
  if (!('view' in node)) {
    return;
  }

  if (!node.view.visible) {
    return;
  }

  // A destroyed pixi container still reports visible === true, but its
  // getBounds() throws; without this prune a component destroyed while still
  // in a children array would crash the spatial-navigation math on the next
  // Tab/arrow press.
  if (node.view.destroyed) {
    return;
  }

  let {isFocusable, children} = node as Partial<Focusable> & Partial<UiParent>;

  if (isFocusable === true) {
    result.push(node as Focusable);
  }

  for (let child of children ?? []) {
    walk(child, result);
  }
}

// Depth-first order over the component hierarchy is the Tab order. Raw Pixi
// containers are leaves (components are only discoverable through public
// children arrays), and subtrees whose view is hidden are pruned.
export function collectFocusables(root: UiChild): Focusable[] {
  let result: Focusable[] = [];

  walk(root, result);

  return result;
}
