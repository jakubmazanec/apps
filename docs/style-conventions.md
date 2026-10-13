- # Examples

## Comments

```
/** This is documentation comment (used by tools like TypeDoc). It uses sentence case. */
```

```
// This is explanation comment. It uses sentence case too.
```

```
/**
 * Multi-line documentation comments are used only when ESLint rule flags too long comment, or some
 * parameter or property cannot be described by its own single-line documentation comment. Not all
 * such parameters must be described, e.g. if their meaning and usage is self-evident.
 */
```

## Visual look of ordering and uncluttering

If possible, group assignments and function calls into own groups:

```
export class Button {
  /* ... */

  disable() {
    if (this.#state === 'disabled') {
      return;
    }

    this.#state = 'disabled';
    this.view.eventMode = 'none';
    this.view.cursor = 'default';

    if (this.#config.pressOffset !== 0) {
      setVerticalOffset(this.children, 0);
    }

    setLayerContainerBackground(this.view, this.#parts.backgrounds.disabled);
  }

  /* ... */
}
```

instead of:

```
export class Button {
  /* ... */

  disable() {
    if (this.#state === 'disabled') {
      return;
    }

    this.#state = 'disabled';

    if (this.#config.pressOffset !== 0) {
      setVerticalOffset(this.children, 0);
    }

    setLayerContainerBackground(this.view, this.#parts.backgrounds.disabled);

    this.view.eventMode = 'none';
    this.view.cursor = 'default';
  }

  /* ... */
}
```

If such ordering cannot be maintained because of execution order, add short explanation comment.
