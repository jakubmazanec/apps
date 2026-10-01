import {type UiChild} from '../UiChild.js';

// Destroys the components still in `children` when the stack is disposed; a
// child taken out with removeChild() earlier belongs to whoever took it.
// Iterates a snapshot, because an overlay's destroy() splices it out of its
// root's children. Call it after deferring the view's own destroy, so the
// (LIFO) stack tears the children down first.
export function adoptChildren(disposables: DisposableStack, children: UiChild[]): void {
  disposables.defer(() => {
    let snapshot = [...children];

    for (let child of snapshot) {
      if ('view' in child) {
        child.destroy?.();
      }
    }
  });
}
