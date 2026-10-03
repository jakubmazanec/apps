import type * as pixi from 'pixi.js';

// Inactive backgrounds are detached during swaps, so `view.destroy({children:
// true})` does not reach them; this registers a disposer per background that
// destroys any the view did not already take down. Call it before deferring the
// view's own destroy, so the (LIFO) stack tears the view down first.
export function adoptDetachedBackgrounds(
  disposables: DisposableStack,
  backgrounds: Iterable<pixi.Container>,
): void {
  for (let background of new Set(backgrounds)) {
    disposables.adopt(background, (b) => {
      if (!b.destroyed) {
        b.destroy();
      }
    });
  }
}
