import {type ChildUiComponent} from '../ChildUiComponent.js';
import {type FocusableUiComponent} from '../FocusableUiComponent.js';
import {type ParentUiComponent} from '../ParentUiComponent.js';

function walk(node: ChildUiComponent, result: FocusableUiComponent[]): void {
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

  let {isFocusable, children} = node as Partial<FocusableUiComponent> & Partial<ParentUiComponent>;

  if (isFocusable === true) {
    result.push(node as FocusableUiComponent);
  }

  for (let child of children ?? []) {
    walk(child, result);
  }
}

// Depth-first order over the component hierarchy is the Tab order. Raw Pixi
// containers are leaves (components are only discoverable through public
// children arrays), and subtrees whose view is hidden are pruned.
export function collectFocusables(root: ChildUiComponent): FocusableUiComponent[] {
  let result: FocusableUiComponent[] = [];

  walk(root, result);

  return result;
}
