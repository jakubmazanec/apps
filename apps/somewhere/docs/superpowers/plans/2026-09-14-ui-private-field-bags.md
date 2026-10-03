# UI Private-Field Bags Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Group the private fields of every widget in `source/engine/ui/` into three typed bags (`#config`, `#parts`, `#runtime`) so a reader can tell from the access site whether a value is resolved configuration, an owned display object, or mutable state, with no behavior or public API change.

**Architecture:** Three one-line mapped types in `source/engine/utilities/` (next to `Disposables.ts`) name the three kinds of private things a widget holds. Each widget declares one `readonly` field per kind it actually has. The constructor resolves its options and theme into `#config` first, then builds everything else (parts, view, listeners) from `this.#config`; `#parts` is assigned once after that. `#state`, `#disposables` and the lifecycle hooks (`#onClick`, `#onChange`, ...) stay the plain fields they are today. Every themed widget stores `theme` in `#config`, because `DialogueBox` (a later phase) needs the theme after construction to build children, and the rule is the same for all widgets.

**Tech Stack:** TypeScript 6 (`exactOptionalPropertyTypes`, no `noUnusedLocals`), pixi.js v8 + `@pixi/layout`, ESLint via `@jakubmazanec/eslint-config` (`perfectionist/sort-classes` alphabetical within groups, `@typescript-eslint/no-unused-private-class-members`, `@typescript-eslint/no-unnecessary-condition`), Prettier, Vitest browser project (Playwright/Chromium).

**Spec:** Inline, in the "Design" section below (agreed in conversation on 2026-09-13/14; no separate spec file). Read it first; every task applies it to one widget.

## Open decisions (defaults are encoded in the tasks; change the tasks if Jakub decides otherwise)

1. **Mutable bag name:** `#runtime` / `Runtime<T>`. Alternatives raised: `#mutable` / `Mutable<T>`, `#live` / `Live<T>`. (`Writable<T>` is taken by `@jakubmazanec/ts-utils`.)
2. **UiRoot dead nullability:** `focusRing` and `ring` are typed optional/nullable today although always set. Default: carry `| undefined` / `| null` and their guards over verbatim (no behavior or lint change). Alternative: drop them in Task 5 (then `no-unnecessary-condition` forces removing the `=== undefined` / `!== null` guards and the `as pixi.NineSliceSprite` assertion).

## Global Constraints

- All commands run from `apps/somewhere`. Per task: `npx prettier --write <touched files>`, `npm run typecheck`, `npm run lint`, then that widget's browser tests. Final gate before merge: `npm run typecheck && npm run lint && npm test`.
- Pure refactor: no behavior change, no public API change (public fields, getters, methods and their names stay), no change to any `*Options.ts`, `*State.ts`, `*Backgrounds.ts`, `UiTheme.ts`, `internals/*` or any test. `Container.ts` is untouched (it takes no theme and resolves nothing).
- No new dependencies, no lockfile changes.
- Never remove a comment. When code moves, its comment moves with it. When a comment names a field that is now inside a bag, update the name inside the comment (`#ring` becomes `#parts.ring`); do not drop the sentence.
- Lifecycle hooks (`#onClick`, `#onChange`, `#onEnter`, `#onCancel`, `#onClose`, `#onFocusEvent`) and their `if (x !== undefined) { this.#x = x; }` blocks stay exactly as they are. `#state` and `#disposables` stay exactly as they are.
- Config first, then build: the constructor assigns `this.#config` before it creates parts or touches the view, and from then on reads option-derived values through `this.#config` (theme lookups included: `this.#config.theme?.button`, not the local `theme`). The one exception is Slider, whose `trackWidth`/`trackHeight` come from the resolved track container, so it resolves backgrounds with the local `theme` first and assigns `#config` right after. No `eslint-disable` is needed anywhere: every `#config` is read by its own constructor.
- Bags are assigned exactly once. TypeScript's definite-assignment check enforces the order. Never read `this.#config` / `this.#parts` / `this.#runtime` in constructor code that runs before the assignment (closures registered before it are fine, they run later).
- House style: `let` over `const`; blank line after every `let` block and before/after every `if` (`@stylistic/js/padding-line-between-statements`); private properties sorted alphabetically by name (`#config`, `#disposables`, `#on…`, `#parts`, `#runtime`, `#state`); imports sorted case-insensitively by path; no em-dashes in new comments; new JSDoc on each bag field.
- Object-literal and type-literal key order is not linted (`perfectionist/sort-objects` and `sort-object-types` are off); keep bag keys alphabetical anyway for readability.
- Commit after each task with the short imperative style of this repo (`git log --oneline` shows `Refactor disposables`, `Tweak`, `Fix`).

## Design

### The three bags

| bag | helper | contents | mutability |
| --- | --- | --- | --- |
| `#config` | `Config<T>` | everything the constructor resolves from options and theme (defaults applied, theme merged), plus `theme` itself; passed-in references the widget does not own (`container`, `initialFocus`, `scheduler`) | keys readonly |
| `#parts` | `Parts<T>` | display objects and DOM elements the widget creates and owns (destroyed via `#disposables`) | references readonly, objects mutable |
| `#runtime` | `Runtime<T>` | values that change during the instance's life, other than `#state` | keys mutable, bag reference readonly |

A widget declares only the bags it has something for. `#config` stores the *resolved* value, not the raw inputs it was resolved from: Button stores the merged theme+instance `layout`, not both; Text stores the merged `style`, not `role` plus the override; TextInput stores `textStyle`, not `role`/`fontFamily`/`fontSize`/`fill`. An option's initial value for something mutable (`checked`, `value`) goes to `#runtime`, not `#config`. `Config` and `Parts` are structurally identical on purpose; the separate names are the point. All three are shallow: a recursive readonly would turn `Record<ButtonState, pixi.Container>` into readonly containers that no longer type-check against `swapBackground`. Nested plain data marks its own keys (`basePadding: {readonly bottom: number; readonly top: number}`).

### Theme rule

Every widget whose options accept a theme keeps it as `#config.theme` (`UiTheme | undefined` where the option is optional, `UiTheme` for UiRoot). Resolved values that depend on the theme (`pressOffset`, `basePadding`, `caretHeight`, `focusRing`) are still resolved once and stored alongside it; storing the theme does not replace them.

### `layout` keys

`pixi.ContainerOptions['layout']` is `Omit<LayoutOptions, 'target'> | null | boolean | undefined` (from `@pixi/layout`'s module augmentation) and every member of `LayoutOptions` is optional. Widgets that today do `typeof layout === 'object' ? layout : undefined` store that result as `layout: Exclude<pixi.ContainerOptions['layout'], boolean>` (`null` passes `typeof === 'object'` and spreads harmlessly, exactly as today). Button stores its merged theme+instance layout as `layout: NonNullable<UiTheme['button']['layout']>`. Text keeps its three-way branch at the build site and stores the raw option as `layout: pixi.ContainerOptions['layout']`.

### What stays a plain field

`#state` (the lifecycle enum; its name is taken, which is why the mutable bag is not called `#state`), `#disposables` (already a bag), and every `#onX` hook.

### Per widget

| widget | `#config` | `#parts` | `#runtime` | kept as-is |
| --- | --- | --- | --- | --- |
| Button | basePadding, layout, pressOffset, theme | backgrounds | (none) | `#disposables`, `#onClick`, `#state` |
| Toggle | theme | backgrounds | isChecked | `#disposables`, `#onChange`, `#state` |
| Slider | max, min, step, theme, trackHeight, trackWidth | fill, trackBackgrounds | isDragging, value | `#disposables`, `#onChange`, `#state` |
| Modal | fadeDuration, initialFocus, layout, scheduler, scrimAlpha | scrim | cancelFade | `#disposables`, `#onCancel`, `#onClose`, `#state` |
| UiRoot | focusRing, theme | overlay, ring | focused, isRingVisible, scopes | `#disposables`, `#onFocusEvent` |
| Text | anchor, layout, style, theme | sprite | (none) | `#disposables` |
| Panel | layout, theme | background | (none) | `#disposables` |
| Container | untouched | | | |
| TextInput | caretHeight, container, layout, maxLength, placeholder, textStyle, theme | backgrounds, caret, input, placeholderText, row, valueText | blinkTick, caretOffset, caretWidth, isEditing, isOwnPointerDown, value | `#disposables`, `#onChange`, `#onEnter`, `#state` |

## File Structure

**New files (Task 1):**

| File | Responsibility |
| --- | --- |
| `source/engine/utilities/Config.ts` | `Config<T>`: readonly mapped type for the resolved-once bag; carries the theme rule in its comment |
| `source/engine/utilities/Parts.ts` | `Parts<T>`: readonly mapped type for owned display objects and DOM elements |
| `source/engine/utilities/Runtime.ts` | `Runtime<T>`: mutable mapped type for values that change during the instance's life |

**Modified, one per task:** `source/engine/ui/Button.ts`, `Toggle.ts`, `Slider.ts`, `Modal.ts`, `UiRoot.ts`, `Text.ts`, `Panel.ts`, `TextInput.ts`.

**Tests (existing, unchanged, run per task):** `tests/Button.browser.test.ts`, `tests/Toggle.browser.test.ts`, `tests/Slider.browser.test.ts`, `tests/SliderFillGeometry.browser.test.ts`, `tests/Modal.browser.test.ts`, `tests/pauseFlow.browser.test.ts`, `tests/UiRoot.browser.test.ts`, `tests/Text.browser.test.ts`. Panel and TextInput have no suite; they are covered by typecheck, lint and the final `npm test`.

A single suite runs with `npx vitest run --project browser tests/<Name>.browser.test.ts`.

---

### Task 1: Bag helper types and Button

The helpers land with their first user. Button already has `#basePadding` as a small bag from the earlier commit; this task folds it, `#pressOffset`, the merged layout and `theme` into `#config`, and `#backgrounds` into `#parts`.

**Files:**
- Create: `source/engine/utilities/Config.ts`, `source/engine/utilities/Parts.ts`, `source/engine/utilities/Runtime.ts`
- Modify: `source/engine/ui/Button.ts`
- Test: `tests/Button.browser.test.ts` (existing, unchanged)

**Interfaces:**
- Produces: `Config<T extends object>`, `Parts<T extends object>`, `Runtime<T extends object>` (all `type` exports, one per file). Every later task imports them with `import {type Config} from '../utilities/Config.js';` etc.
- Button's free function `pressPadding(state, {pressOffset, basePadding})` keeps its signature; call sites pass `this.#config` (extra keys are fine, it is not an object literal).

- [ ] **Step 1: Baseline: run Button's suite before touching anything**

Run: `npx vitest run --project browser tests/Button.browser.test.ts`
Expected: all tests PASS. (If not, stop: the baseline is broken independently of this plan.)

- [ ] **Step 2: Create the three helper files**

`source/engine/utilities/Config.ts`:

```ts
// Everything the constructor resolves from options and theme (defaults applied,
// theme merged), then fixed for the instance's lifetime; the widget builds itself
// from this. Every themed widget also keeps `theme` here, so a widget that builds
// themed children after construction (DialogueBox) is the norm, not an exception.
export type Config<T extends object> = {readonly [Name in keyof T]: T[Name]};
```

`source/engine/utilities/Parts.ts`:

```ts
// Display objects and DOM elements the widget creates and owns: the references
// are fixed, the objects themselves mutate, and `#disposables` destroys them.
export type Parts<T extends object> = {readonly [Name in keyof T]: T[Name]};
```

`source/engine/utilities/Runtime.ts`:

```ts
// Values that change during the instance's life; the bag itself is held in a
// readonly field and only its keys are written.
export type Runtime<T extends object> = {-readonly [Name in keyof T]: T[Name]};
```

- [ ] **Step 3: Rewrite Button's imports and fields**

Replace the import block and everything from the class opening through the end of the field declarations (currently lines 1-39) with:

```ts
import {LayoutContainer} from '@pixi/layout/components';
import type * as pixi from 'pixi.js';

import {type Config} from '../utilities/Config.js';
import {type Disposables} from '../utilities/Disposables.js';
import {type Parts} from '../utilities/Parts.js';
import {type ButtonOptions} from './ButtonOptions.js';
import {type ButtonState} from './ButtonState.js';
import {type Focusable} from './Focusable.js';
import {adoptDetachedBackgrounds} from './internals/adoptDetachedBackgrounds.js';
import {attachWidgetInteraction} from './internals/attachWidgetInteraction.js';
import {resolveBackgrounds} from './internals/resolveBackgrounds.js';
import {resolveThemedBackgrounds} from './internals/resolveThemedBackgrounds.js';
import {setInteractionEnabled} from './internals/setInteractionEnabled.js';
import {swapBackground} from './internals/swapBackground.js';
import {type UiChild, type UiParent} from './UiChild.js';
import {type UiTheme} from './UiTheme.js';

export class Button implements Focusable, UiParent {
  /** TBD */
  readonly children: UiChild[] = [];

  /** View. */
  readonly view: LayoutContainer;

  /** Resolved once from options and theme; fixed for the instance's lifetime. */
  readonly #config: Config<{
    basePadding: {readonly bottom: number; readonly top: number};
    layout: NonNullable<UiTheme['button']['layout']>;
    pressOffset: number;
    theme: UiTheme | undefined;
  }>;

  /** Stacks to register disposers that cleanup resources when needed. */
  readonly #disposables: Disposables<'instance'> = {instance: new DisposableStack()};

  /** Lifecycle hook called when the button is clicked. */
  readonly #onClick?: (button: Button) => void;

  /** Display objects the button creates and owns. */
  readonly #parts: Parts<{backgrounds: Record<ButtonState, pixi.Container>}>;

  /** State; which part of its life cycle the instance is currently in. */
  #state: ButtonState = 'normal';
```

- [ ] **Step 4: Rewrite the constructor up to the view wiring**

Replace the constructor body from its opening through `this.view = new LayoutContainer(...)` (currently lines 41-84) with:

```ts
  constructor({backgrounds, theme, children, onClick, layout, pressOffset}: ButtonOptions) {
    if (onClick !== undefined) {
      this.#onClick = onClick;
    }

    // The theme provides per-property layout defaults; an instance property wins.
    let mergedLayout = {
      ...theme?.button.layout,
      ...(typeof layout === 'object' ? layout : undefined),
    };
    let {
      padding = 0,
      paddingTop = padding,
      paddingBottom = padding,
    } = mergedLayout as {
      padding?: number;
      paddingTop?: number;
      paddingBottom?: number;
    };

    this.#config = {
      basePadding: {top: paddingTop, bottom: paddingBottom},
      layout: mergedLayout,
      pressOffset: pressOffset ?? theme?.button.pressOffset ?? 0,
      theme,
    };

    let resolved = resolveThemedBackgrounds(
      ['normal', 'hovered', 'active', 'disabled'],
      this.#config.theme?.button,
      backgrounds,
    );

    if (resolved.normal === undefined) {
      // Unreachable through ThemedOptions, which requires one source or the other.
      throw new Error('Button needs a theme or a normal background!');
    }

    this.#parts = {
      backgrounds: resolveBackgrounds(
        ['normal', 'hovered', 'active', 'disabled'],
        resolved.normal,
        resolved,
      ),
    };

    adoptDetachedBackgrounds(this.#disposables.instance, Object.values(this.#parts.backgrounds));

    this.view = new LayoutContainer({background: this.#parts.backgrounds.normal});
```

- [ ] **Step 5: Update the six state-transition blocks and the background swaps**

In `attachWidgetInteraction`'s `setState`, the `pointerdown`, `pointerup` and `pointerupoutside` handlers, and in `disable()` and `enable()`, each block currently reads:

```ts
        if (this.#pressOffset !== 0) {
          this.view.layout = pressPadding(state, {
            pressOffset: this.#pressOffset,
            basePadding: this.#basePadding,
          });
        }

        swapBackground(this.view, this.#backgrounds[state]);
```

(with `'active'`, `'hovered'`, `'normal'`, `'disabled'`, `'normal'` in place of `state`, and `.active` / `.hovered` / `.normal` / `.disabled` / `.normal` in place of `[state]`). Each becomes:

```ts
        if (this.#config.pressOffset !== 0) {
          this.view.layout = pressPadding(state, this.#config);
        }

        swapBackground(this.view, this.#parts.backgrounds[state]);
```

keeping the same literal state and the same background key per site. `pressPadding` at the bottom of the file and its comment are unchanged.

- [ ] **Step 6: Build the initial layout from `#config`**

At the end of the constructor, the block currently reading

```ts
    this.view.layout = {
      justifyContent: 'center',
      alignItems: 'center',
      ...mergedLayout,
    };
```

becomes

```ts
    this.view.layout = {
      justifyContent: 'center',
      alignItems: 'center',
      ...this.#config.layout,
    };
```

(`mergedLayout` is still needed above for the padding destructure, so the local stays.)

- [ ] **Step 7: Verify no old field name survives**

Run: `rg -n 'this\.#(pressOffset|basePadding|backgrounds)\b' source/engine/ui/Button.ts`
Expected: no output.

- [ ] **Step 8: Format, typecheck, lint**

Run: `npx prettier --write source/engine/ui/Button.ts source/engine/utilities/Config.ts source/engine/utilities/Parts.ts source/engine/utilities/Runtime.ts && npm run typecheck && npm run lint`
Expected: all three exit 0. `Runtime.ts` is unused until Task 2; an unused module is not a lint error.

- [ ] **Step 9: Run Button's suite**

Run: `npx vitest run --project browser tests/Button.browser.test.ts`
Expected: PASS, same test count as Step 1.

- [ ] **Step 10: Review the diff for lost comments**

Run: `git diff -- source/engine/ui/Button.ts | rg '^-\s*//|^-\s*/\*\*'`
Expected: only the two `/** TBD */` lines of the removed `#backgrounds` and `#pressOffset` fields and the `/** Padding captured at construction; press/release restores it. */` line of `#basePadding`. Any other removed comment line must be restored next to the code it described.

- [ ] **Step 11: Commit**

```bash
git add source/engine/utilities/Config.ts source/engine/utilities/Parts.ts source/engine/utilities/Runtime.ts source/engine/ui/Button.ts
git commit -m "Add Config, Parts and Runtime bag types; refactor Button"
```

---

### Task 2: Toggle

**Files:**
- Modify: `source/engine/ui/Toggle.ts`
- Test: `tests/Toggle.browser.test.ts` (existing, unchanged)

**Interfaces:**
- Consumes: `Config`, `Parts`, `Runtime` from Task 1.
- The free function `toggleBackground(backgrounds, isChecked, state)` keeps its signature.

Toggle resolves nothing from its options besides the theme (`checked` is `#runtime`'s initial value), so `#config` is `{theme}`; the constructor reads it for the theme lookup, which is what keeps `no-unused-private-class-members` satisfied.

- [ ] **Step 1: Baseline**

Run: `npx vitest run --project browser tests/Toggle.browser.test.ts`
Expected: PASS.

- [ ] **Step 2: Rewrite imports and fields**

Replace lines 1-35 (imports through the last field) with:

```ts
import {LayoutContainer} from '@pixi/layout/components';
import type * as pixi from 'pixi.js';

import {type Config} from '../utilities/Config.js';
import {type Disposables} from '../utilities/Disposables.js';
import {type Parts} from '../utilities/Parts.js';
import {type Runtime} from '../utilities/Runtime.js';
import {type Focusable} from './Focusable.js';
import {adoptDetachedBackgrounds} from './internals/adoptDetachedBackgrounds.js';
import {attachWidgetInteraction} from './internals/attachWidgetInteraction.js';
import {resolveBackgrounds} from './internals/resolveBackgrounds.js';
import {resolveThemedBackgrounds} from './internals/resolveThemedBackgrounds.js';
import {setInteractionEnabled} from './internals/setInteractionEnabled.js';
import {swapBackground} from './internals/swapBackground.js';
import {type ToggleOptions} from './ToggleOptions.js';
import {type ToggleState} from './ToggleState.js';
import {type UiTheme} from './UiTheme.js';

export class Toggle implements Focusable {
  /** View. */
  readonly view: LayoutContainer;

  /** Resolved once from options and theme; fixed for the instance's lifetime. */
  readonly #config: Config<{theme: UiTheme | undefined}>;

  /** Stacks to register disposers that cleanup resources when needed. */
  readonly #disposables: Disposables<'instance'> = {instance: new DisposableStack()};

  /** Lifecycle hook called when the toggle's checked state changes. */
  readonly #onChange?: (toggle: Toggle) => void;

  /** Display objects the toggle creates and owns. */
  readonly #parts: Parts<{
    backgrounds: {
      checked: Record<ToggleState, pixi.Container>;
      unchecked: Record<ToggleState, pixi.Container>;
    };
  }>;

  /** Values that change during the instance's life. */
  readonly #runtime: Runtime<{isChecked: boolean}>; // basically a `value`

  /** State; which part of its life cycle the instance is currently in. */
  #state: ToggleState = 'normal';
```

- [ ] **Step 3: Rewrite the constructor**

Replace the whole constructor (currently lines 37-95) with:

```ts
  constructor({backgrounds, theme, checked = false, onChange}: ToggleOptions) {
    if (onChange !== undefined) {
      this.#onChange = onChange;
    }

    this.#config = {theme};

    let resolved = resolveThemedBackgrounds(
      ['unchecked', 'checked', 'hovered', 'hoveredChecked', 'disabled', 'disabledChecked'],
      this.#config.theme?.toggle,
      backgrounds,
    );

    if (resolved.unchecked === undefined || resolved.checked === undefined) {
      // Unreachable through ThemedOptions, which requires one source or the other.
      throw new Error('Toggle needs a theme or unchecked and checked backgrounds!');
    }

    let states = ['normal', 'hovered', 'disabled'] as const;

    this.#parts = {
      backgrounds: {
        unchecked: resolveBackgrounds(states, resolved.unchecked, {
          hovered: resolved.hovered,
          disabled: resolved.disabled,
        }),
        checked: resolveBackgrounds(states, resolved.checked, {
          hovered: resolved.hoveredChecked,
          disabled: resolved.disabledChecked,
        }),
      },
    };

    adoptDetachedBackgrounds(this.#disposables.instance, [
      ...Object.values(this.#parts.backgrounds.unchecked),
      ...Object.values(this.#parts.backgrounds.checked),
    ]);

    this.#runtime = {isChecked: checked};
    this.view = new LayoutContainer({
      background: this.#parts.backgrounds[checked ? 'checked' : 'unchecked'].normal,
    });
    this.view.layout = {width: resolved.unchecked.width, height: resolved.unchecked.height};

    attachWidgetInteraction(this.view, {
      cursor: 'pointer',
      getState: () => this.#state,
      setState: (state) => {
        this.#state = state;

        swapBackground(
          this.view,
          toggleBackground(this.#parts.backgrounds, this.#runtime.isChecked, state),
        );
      },
    });

    this.view.on('pointertap', (event) => {
      if (this.#state !== 'disabled') {
        event.stopPropagation();
        this.activate();
      }
    });

    this.#disposables.instance.defer(() => this.view.destroy({children: true}));
  }
```

- [ ] **Step 4: Update the getter and the five methods**

`get isChecked()` returns `this.#runtime.isChecked`. In `activate()`, `check()`, `disable()`, `enable()` and `uncheck()` replace every `this.#isChecked` with `this.#runtime.isChecked` and every `this.#backgrounds` with `this.#parts.backgrounds`; the literal `true` / `false` / `'disabled'` / `'normal'` arguments passed to `toggleBackground` stay as they are. For example `activate()` becomes:

```ts
  activate() {
    if (this.#state === 'disabled') {
      return;
    }

    this.#runtime.isChecked = !this.#runtime.isChecked;

    swapBackground(
      this.view,
      toggleBackground(this.#parts.backgrounds, this.#runtime.isChecked, this.#state),
    );

    this.#onChange?.(this);
  }
```

- [ ] **Step 5: Verify no old field name survives**

Run: `rg -n 'this\.#(isChecked|backgrounds)\b' source/engine/ui/Toggle.ts`
Expected: no output.

- [ ] **Step 6: Format, typecheck, lint**

Run: `npx prettier --write source/engine/ui/Toggle.ts && npm run typecheck && npm run lint`
Expected: exit 0.

- [ ] **Step 7: Run Toggle's suite**

Run: `npx vitest run --project browser tests/Toggle.browser.test.ts`
Expected: PASS, same count as Step 1.

- [ ] **Step 8: Review the diff for lost comments**

Run: `git diff -- source/engine/ui/Toggle.ts | rg '^-\s*//|^-\s*/\*\*'`
Expected: only the `/** TBD */` lines of the removed `#backgrounds` and `#isChecked` fields. The `// basically a \`value\`` trailer must be present on the `#runtime` line.

- [ ] **Step 9: Commit**

```bash
git add source/engine/ui/Toggle.ts
git commit -m "Refactor Toggle private fields into bags"
```

---

### Task 3: Slider

**Files:**
- Modify: `source/engine/ui/Slider.ts`
- Test: `tests/Slider.browser.test.ts`, `tests/SliderFillGeometry.browser.test.ts` (existing, unchanged)

**Interfaces:**
- Consumes: `Config`, `Parts`, `Runtime` from Task 1.
- The free functions `clamp`, `fillWidth(trackWidth, value, {min, max})`, `snap(value, {min, max, step})`, `valueFromEvent(event, view, {trackWidth, min, max, step})` keep their signatures; call sites pass `this.#config` where they used to rebuild `{min, max, step}` / `{trackWidth, min, max, step}` literals.
- Slider is the documented exception to "config first": `trackWidth`/`trackHeight` come from the resolved track container, so backgrounds are resolved with the local `theme` and `#config` is assigned immediately after.

- [ ] **Step 1: Baseline**

Run: `npx vitest run --project browser tests/Slider.browser.test.ts tests/SliderFillGeometry.browser.test.ts`
Expected: PASS.

- [ ] **Step 2: Rewrite imports and fields**

Replace lines 1-53 with:

```ts
import {LayoutContainer} from '@pixi/layout/components';
import type * as pixi from 'pixi.js';

import {type Config} from '../utilities/Config.js';
import {type Disposables} from '../utilities/Disposables.js';
import {type Parts} from '../utilities/Parts.js';
import {type Runtime} from '../utilities/Runtime.js';
import {type Focusable} from './Focusable.js';
import {adoptDetachedBackgrounds} from './internals/adoptDetachedBackgrounds.js';
import {attachWidgetInteraction} from './internals/attachWidgetInteraction.js';
import {resolveBackgrounds} from './internals/resolveBackgrounds.js';
import {resolveThemedBackgrounds} from './internals/resolveThemedBackgrounds.js';
import {setInteractionEnabled} from './internals/setInteractionEnabled.js';
import {swapBackground} from './internals/swapBackground.js';
import {type SliderOptions} from './SliderOptions.js';
import {type SliderState} from './SliderState.js';
import {type UiTheme} from './UiTheme.js';

export class Slider implements Focusable {
  /** View. */
  readonly view: LayoutContainer;

  /** Resolved once from options and theme; fixed for the instance's lifetime. */
  readonly #config: Config<{
    max: number;
    min: number;
    step: number;
    theme: UiTheme | undefined;
    trackHeight: number;
    trackWidth: number;
  }>;

  /** Stacks to register disposers that cleanup resources when needed. */
  readonly #disposables: Disposables<'instance'> = {instance: new DisposableStack()};

  /** Lifecycle hook called when the slider's value changes. */
  readonly #onChange?: (slider: Slider) => void;

  /** Display objects the slider creates and owns. */
  readonly #parts: Parts<{
    fill: pixi.Container;
    trackBackgrounds: Record<SliderState, pixi.Container>;
  }>;

  /** Values that change during the instance's life. */
  readonly #runtime: Runtime<{isDragging: boolean; value: number}>;

  /** State; which part of its life cycle the instance is currently in. */
  #state: SliderState = 'normal';
```

- [ ] **Step 3: Rewrite the constructor up to the pointer handlers**

Replace the constructor from its opening through the `this.#fill.setSize(...)` call (currently lines 55-123) with:

```ts
  constructor({
    backgrounds,
    theme,
    min = 0,
    max = 1,
    step = 0.1,
    value = min,
    onChange,
  }: SliderOptions) {
    if (onChange !== undefined) {
      this.#onChange = onChange;
    }

    // The track's size is part of the config, and it only exists once the
    // backgrounds are resolved, so this widget resolves them first.
    let resolved = resolveThemedBackgrounds(
      ['track', 'fill', 'hovered', 'disabled'],
      theme?.slider,
      backgrounds,
    );

    if (resolved.track === undefined || resolved.fill === undefined) {
      // Unreachable through ThemedOptions, which requires one source or the other.
      throw new Error('Slider needs a theme or track and fill backgrounds!');
    }

    this.#config = {
      min,
      max,
      step,
      theme,
      trackWidth: resolved.track.width,
      trackHeight: resolved.track.height,
    };
    this.#parts = {
      fill: resolved.fill,
      trackBackgrounds: resolveBackgrounds(['normal', 'hovered', 'disabled'], resolved.track, {
        hovered: resolved.hovered,
        disabled: resolved.disabled,
      }),
    };

    adoptDetachedBackgrounds(
      this.#disposables.instance,
      Object.values(this.#parts.trackBackgrounds),
    );

    this.view = new LayoutContainer({background: this.#parts.trackBackgrounds.normal});
    this.view.layout = {width: this.#config.trackWidth, height: this.#config.trackHeight};

    attachWidgetInteraction(this.view, {
      cursor: 'pointer',
      getState: () => this.#state,
      setState: (state) => {
        this.#state = state;

        swapBackground(this.view, this.#parts.trackBackgrounds[state]);
      },
    });

    // Deliberately NOT given a `layout` style: the fill is sized via setSize()
    // whenever the value changes, and a yoga node would double-apply that size. @pixi/layout
    // treats any ViewContainer as a leaf styled `{width: 'intrinsic'}`, resolves
    // 'intrinsic' as getLocalBounds().width * scale.x (so yoga's width becomes
    // the already-scaled visual width), then re-derives an offsetScale of
    // computedLayout.width / getLocalBounds().width against the *unscaled*
    // texture and composes the two multiplicatively — a 32 art-px fill would
    // render at 256. Positioning it directly (no yoga node) is the same shape
    // swapBackground/LayoutContainer use for a view's background child.
    this.#parts.fill.position.set(0, 0);
    this.view.addChild(this.#parts.fill);

    this.#runtime = {
      isDragging: false,
      value: snap(value, this.#config),
    };
    this.#parts.fill.setSize(
      fillWidth(this.#config.trackWidth, this.#runtime.value, this.#config),
      this.#config.trackHeight,
    );
```

(The long "Deliberately NOT given a `layout` style" comment is the existing one, moved verbatim; it keeps its em-dash because it is not new text. The two-line comment above `resolveThemedBackgrounds` is new.)

- [ ] **Step 4: Update the pointer handlers in the constructor**

In the `pointerdown` handler:

```ts
      event.stopPropagation();
      this.#runtime.isDragging = true;
      this.value = valueFromEvent(event, this.view, this.#config);
      this.#onChange?.(this);
```

In the `globalpointermove` handler, `if (!this.#isDragging)` becomes `if (!this.#runtime.isDragging)`, the `this.#isDragging = false;` inside the `buttons === 0` branch becomes `this.#runtime.isDragging = false;`, and:

```ts
      let next = valueFromEvent(event, this.view, this.#config);

      if (next === this.#runtime.value) {
        return;
      }
```

In the `pointerup`, `pointerupoutside` and `pointercancel` handlers, `this.#isDragging = false;` becomes `this.#runtime.isDragging = false;`. All comments in these handlers stay.

- [ ] **Step 5: Update the accessors and methods**

```ts
  /** TBD */
  get value(): number {
    return this.#runtime.value;
  }

  set value(value: number) {
    this.#runtime.value = snap(value, this.#config);
    this.#parts.fill.setSize(
      fillWidth(this.#config.trackWidth, this.#runtime.value, this.#config),
      this.#config.trackHeight,
    );
  }
```

`decrease()`: `this.value = this.#runtime.value - this.#config.step;`. `increase()`: `this.value = this.#runtime.value + this.#config.step;`. `disable()`: `this.#runtime.isDragging = false;` and `swapBackground(this.view, this.#parts.trackBackgrounds.disabled);`. `enable()`: `swapBackground(this.view, this.#parts.trackBackgrounds.normal);`. Everything else in those methods is unchanged.

- [ ] **Step 6: Verify no old field name survives**

Run: `rg -n 'this\.#(fill|isDragging|max|min|step|trackBackgrounds|trackHeight|trackWidth|value)\b' source/engine/ui/Slider.ts`
Expected: no output.

- [ ] **Step 7: Format, typecheck, lint**

Run: `npx prettier --write source/engine/ui/Slider.ts && npm run typecheck && npm run lint`
Expected: exit 0.

- [ ] **Step 8: Run Slider's suites**

Run: `npx vitest run --project browser tests/Slider.browser.test.ts tests/SliderFillGeometry.browser.test.ts`
Expected: PASS, same counts as Step 1.

- [ ] **Step 9: Review the diff for lost comments**

Run: `git diff -- source/engine/ui/Slider.ts | rg '^-\s*//|^-\s*/\*\*'`
Expected: only the `/** TBD */` lines of the removed fields (`#fill`, `#isDragging`, `#max`, `#min`, `#step`, `#trackBackgrounds`, `#trackHeight`, `#trackWidth`, `#value`). The "Deliberately NOT given a `layout` style" block and every handler comment must still be present.

- [ ] **Step 10: Commit**

```bash
git add source/engine/ui/Slider.ts
git commit -m "Refactor Slider private fields into bags"
```

---

### Task 4: Modal

**Files:**
- Modify: `source/engine/ui/Modal.ts`
- Test: `tests/Modal.browser.test.ts`, `tests/pauseFlow.browser.test.ts` (existing, unchanged)

**Interfaces:**
- Consumes: `Config`, `Parts`, `Runtime` from Task 1.
- Modal has no theme option, so its `#config` has no `theme` key. `fadeDuration` and `scheduler` stay two keys and the existing paired guard stays verbatim.

- [ ] **Step 1: Baseline**

Run: `npx vitest run --project browser tests/Modal.browser.test.ts tests/pauseFlow.browser.test.ts`
Expected: PASS.

- [ ] **Step 2: Rewrite imports and fields**

Replace lines 1-51 (imports, the class comment and the fields) with:

```ts
import * as pixi from 'pixi.js';

import {easeOutQuad} from '../scheduler/easing.js';
import {type Scheduler} from '../scheduler/Scheduler.js';
import {type Config} from '../utilities/Config.js';
import {type Disposables} from '../utilities/Disposables.js';
import {type Parts} from '../utilities/Parts.js';
import {type Runtime} from '../utilities/Runtime.js';
import {type Focusable} from './Focusable.js';
import {type ModalOptions} from './ModalOptions.js';
import {type ModalState} from './ModalState.js';
import {type UiChild, type UiParent} from './UiChild.js';
import {type UiRoot} from './UiRoot.js';

// A reusable modal: a flat widget in the existing Container/Panel idiom (public
// `children` + `view`, no inheritance). Constructed per open by whatever
// handler opens it; the owning screen tracks the open instance and calls
// destroy() (never the animated close()) from its onHide.
export class Modal implements UiParent {
  /** TBD */
  readonly children: UiChild[] = [];

  /** View. */
  readonly view: pixi.Container = new pixi.Container();

  /** Resolved once from options; fixed for the instance's lifetime. */
  readonly #config: Config<{
    fadeDuration: number | undefined;
    initialFocus: Focusable | undefined;
    layout: Exclude<pixi.ContainerOptions['layout'], boolean>;
    scheduler: Scheduler | undefined;
    scrimAlpha: number;
  }>;

  /** Stacks to register disposers that cleanup resources when needed. */
  readonly #disposables: Disposables<'instance', 'open'> = {
    instance: new DisposableStack(),
    open: null,
  };

  /** Lifecycle hook called when there is an unhandled cancel command. */
  readonly #onCancel?: () => void;

  /** Lifecycle hook called when the modal is closed. */
  readonly #onClose?: () => void;

  /** Display objects the modal creates and owns. */
  readonly #parts: Parts<{scrim: pixi.Graphics}> = {scrim: new pixi.Graphics()};

  /** Values that change during the instance's life. */
  readonly #runtime: Runtime<{cancelFade: (() => void) | null}> = {cancelFade: null};

  /** State; which part of its life cycle the instance is currently in. */
  #state: ModalState = 'closed';
```

- [ ] **Step 3: Rewrite the constructor**

Replace the whole constructor (currently lines 53-108) with:

```ts
  constructor({
    children,
    layout,
    scrimAlpha = 0.5,
    initialFocus,
    onClose,
    onCancel,
    scheduler,
    fadeDuration,
  }: ModalOptions) {
    if (onClose !== undefined) {
      this.#onClose = onClose;
    }

    if (onCancel !== undefined) {
      this.#onCancel = onCancel;
    }

    this.#config = {
      fadeDuration,
      initialFocus,
      layout: typeof layout === 'object' ? layout : undefined,
      scheduler,
      scrimAlpha,
    };

    // The scrim is a raw pixi child behind the layout children and deliberately
    // NOT in `children`, so the focus walk never sees it. It is interactive so
    // every pointer event lands on UI (UiRoot already stops taps on UI from
    // reaching the game view, which blocks click-to-move for free). It sits
    // out-of-flow (no layout of its own) at (0, 0) — the same mixed
    // layout/non-layout child behavior loadingScreen's view exercises.
    this.#parts.scrim.alpha = this.#config.scrimAlpha;
    this.#parts.scrim.eventMode = 'static';
    this.view.addChild(this.#parts.scrim);

    if (children !== undefined) {
      for (let child of children) {
        this.children.push(child);
        this.view.addChild('view' in child ? child.view : child);
      }
    }

    // position: 'absolute' keeps the full-screen root out of any flex flow the
    // owning UiRoot's view may have (the menu centers its own children); the
    // caller's layout still styles content placement inside the root.
    this.view.layout = {
      position: 'absolute',
      left: 0,
      top: 0,
      ...this.#config.layout,
    };

    this.#disposables.instance.defer(() => this.view.destroy({children: true}));
  }
```

(`{fadeDuration, scheduler}` is equivalent to the old paired `if (scheduler !== undefined)` block: `ModalOptions` is a union that makes `fadeDuration` undefined whenever `scheduler` is.)

- [ ] **Step 4: Update `close()`, `open()`, `resize()`**

`close()`:

```ts
    if (this.#config.scheduler !== undefined && this.#config.fadeDuration !== undefined) {
      // Tweens don't reverse: cancel any in-flight fade-in and start a new
      // tween toward 0 — Tween captures its from-value from the current alpha
      // at construction, so the replacement picks up with no visual jump.
      this.#runtime.cancelFade?.();
      this.#state = 'closing';
      this.#runtime.cancelFade = this.#config.scheduler.tween({
        target: this.view,
        to: {alpha: 0},
        duration: this.#config.fadeDuration,
        easing: easeOutQuad,
        onComplete: () => {
          this.#runtime.cancelFade = null;
          this.#finishClose();
        },
      });
    } else {
      this.#finishClose();
    }
```

`open()` in full (its comments stay):

```ts
  // A modal is opened INTO a ui root, so the target is a parameter of open,
  // not the constructor. Adds the modal as the last UI child (above the HUD by
  // insertion order; UiRoot.addChild keeps the focus-ring overlay topmost),
  // then pushes the focus scope (scope root = the modal itself).
  /** TBD */
  open(ui: UiRoot) {
    if (this.#state !== 'closed' || this.view.destroyed) {
      return;
    }

    this.#disposables.open = new DisposableStack();

    ui.addChild(this);
    ui.pushFocusScope(this, {
      onCancel: () => {
        if (this.#onCancel === undefined) {
          return this.close();
        }

        this.#onCancel();

        return true;
      },
    });

    // The scope is popped BEFORE removeChild: removing first would let UiRoot's
    // scope self-heal drop the scope as stale and silently lose the
    // previousFocus restoration (the Options flow depends on it).
    this.#disposables.open.defer(() => {
      this.#runtime.cancelFade?.();
      this.#runtime.cancelFade = null;
      ui.popFocusScope();
      ui.removeChild(this);
    });

    if (this.#config.initialFocus !== undefined) {
      ui.focus(this.#config.initialFocus);
    }

    if (this.#config.scheduler !== undefined && this.#config.fadeDuration !== undefined) {
      this.#state = 'opening';
      this.view.alpha = 0;
      this.#runtime.cancelFade = this.#config.scheduler.tween({
        target: this.view,
        to: {alpha: 1},
        duration: this.#config.fadeDuration,
        easing: easeOutQuad,
        onComplete: () => {
          this.#runtime.cancelFade = null;
          this.#state = 'open';
        },
      });
    } else {
      this.#state = 'open';
    }
  }
```

`resize()`: `this.#parts.scrim.clear().rect(0, 0, width, height).fill(0x000000);`. `destroy()`, `#destroyViews()` and `#finishClose()` reference none of the moved fields and are unchanged.

- [ ] **Step 5: Verify no old field name survives**

Run: `rg -n 'this\.#(cancelFade|fadeDuration|initialFocus|scheduler|scrim)\b' source/engine/ui/Modal.ts`
Expected: no output.

- [ ] **Step 6: Format, typecheck, lint**

Run: `npx prettier --write source/engine/ui/Modal.ts && npm run typecheck && npm run lint`
Expected: exit 0. If typecheck reports `this.#config.scheduler` as possibly undefined inside the guarded block, the guard was rewritten; it must test `this.#config.scheduler !== undefined && this.#config.fadeDuration !== undefined` exactly, on the same property paths that are used inside.

- [ ] **Step 7: Run Modal's suites**

Run: `npx vitest run --project browser tests/Modal.browser.test.ts tests/pauseFlow.browser.test.ts`
Expected: PASS, same counts as Step 1.

- [ ] **Step 8: Review the diff for lost comments**

Run: `git diff -- source/engine/ui/Modal.ts | rg '^-\s*//|^-\s*/\*\*'`
Expected: only the `/** TBD */` lines of `#cancelFade`, `#fadeDuration`, `#initialFocus`, `#scheduler`, `#scrim`.

- [ ] **Step 9: Commit**

```bash
git add source/engine/ui/Modal.ts
git commit -m "Refactor Modal private fields into bags"
```

---

### Task 5: UiRoot

**Files:**
- Modify: `source/engine/ui/UiRoot.ts`
- Test: `tests/UiRoot.browser.test.ts` (existing, unchanged)

**Interfaces:**
- Consumes: `Config`, `Parts`, `Runtime` from Task 1.
- Decision 2 default: `focusRing` stays `UiTheme['focusRing'] | undefined` and `ring` stays `pixi.NineSliceSprite | null`, so the existing guards and the `as` assertion in `update()` stay and `no-unnecessary-condition` has nothing to say.

- [ ] **Step 1: Baseline**

Run: `npx vitest run --project browser tests/UiRoot.browser.test.ts`
Expected: PASS.

- [ ] **Step 2: Rewrite imports and fields**

Replace lines 1-54 (imports, `FocusScope`, the scoring constants and their comment, the fields) with:

```ts
import * as pixi from 'pixi.js';

import {type Config} from '../utilities/Config.js';
import {type Disposables} from '../utilities/Disposables.js';
import {type Parts} from '../utilities/Parts.js';
import {type Runtime} from '../utilities/Runtime.js';
import {type Focusable} from './Focusable.js';
import {type FocusDirection} from './FocusDirection.js';
import {type UiChild, type UiParent} from './UiChild.js';
import {type UiFocusEvent} from './UiFocusEvent.js';
import {type UiRootOptions} from './UiRootOptions.js';
import {type UiTheme} from './UiTheme.js';

type FocusScope = {
  onCancel?: (() => boolean) | undefined;
  previousFocus: Focusable | null;
  root: UiChild;
};

// Spatial scoring: distance along the movement axis plus a weighted penalty
// for perpendicular gap (zero while the candidate stays within the source's
// cross-axis extent); candidates whose bounds overlap the source's
// perpendicular extent score better, so "down" prefers the component directly
// below over a nearer diagonal one.
const PERPENDICULAR_PENALTY = 2;
const OVERLAP_BONUS = 0.5;

export class UiRoot implements UiParent {
  /** TBD */
  readonly children: UiChild[] = [];

  /** View. */
  readonly view: pixi.Container = new pixi.Container();

  /** Resolved once from options and theme; fixed for the instance's lifetime. */
  readonly #config: Config<{focusRing: UiTheme['focusRing'] | undefined; theme: UiTheme}>;

  /** Stacks to register disposers that cleanup resources when needed. */
  readonly #disposables: Disposables<'instance'> = {instance: new DisposableStack()};

  /** Lifecycle hook called when focus moves or a directional move is rejected. */
  readonly #onFocusEvent?: (event: UiFocusEvent) => void;

  /** Display objects the root creates and owns. */
  readonly #parts: Parts<{overlay: pixi.Container; ring: pixi.NineSliceSprite | null}>;

  /** Values that change during the instance's life. */
  readonly #runtime: Runtime<{
    focused: Focusable | null;
    isRingVisible: boolean;
    scopes: FocusScope[];
  }> = {focused: null, isRingVisible: false, scopes: []};
```

- [ ] **Step 3: Rewrite the start of the constructor**

Replace the constructor from its opening through `this.view.addChild(this.#overlay);` (currently lines 56-74) with:

```ts
  constructor({theme, onFocusEvent}: UiRootOptions) {
    this.#config = {focusRing: theme.focusRing, theme};

    let overlay = new pixi.Container();
    let ring = new pixi.NineSliceSprite({texture: this.#config.theme.focusRing.texture});

    this.#parts = {overlay, ring};
    overlay.addChild(ring);

    if (onFocusEvent !== undefined) {
      this.#onFocusEvent = onFocusEvent;
    }

    // The overlay draws the focus ring on top of every widget, and once a
    // widget is focused the ring's bounds cover it. Pixi hit-tests front-to-back
    // and would reach the ring first; because the ring only carries the default
    // (hit-testable) event mode, pixi resolves the tap to the ring's nearest
    // interactive ancestor — this view — and stops, never descending to the
    // widget beneath. 'none' prunes the whole overlay subtree from hit-testing
    // so taps fall through to the focused widget and its onClick still fires.
    overlay.eventMode = 'none';

    this.view.addChild(overlay);
```

(Locals rather than `this.#parts.ring` for `addChild`: the declared type of `ring` is nullable and an object-literal assignment does not narrow a non-union property, so `this.#parts.overlay.addChild(this.#parts.ring)` would not type-check.) In the rest of the constructor, `handlePointerDown` becomes:

```ts
    let handlePointerDown = () => {
      this.#runtime.isRingVisible = false;
    };
```

Everything else in the constructor is unchanged.

- [ ] **Step 4: Rename the remaining field accesses**

Apply these exact substitutions throughout the file (methods, getters, private methods):

| old | new |
| --- | --- |
| `this.#focused` | `this.#runtime.focused` |
| `this.#isRingVisible` | `this.#runtime.isRingVisible` |
| `this.#scopes` | `this.#runtime.scopes` |
| `this.#overlay` | `this.#parts.overlay` |
| `this.#ring` | `this.#parts.ring` |
| `this.#focusRing` | `this.#config.focusRing` |

`update()` after the substitutions must read:

```ts
  update() {
    let focused = this.#runtime.focused;

    if (
      this.#config.focusRing === undefined ||
      !this.#runtime.isRingVisible ||
      !focused?.isFocusable ||
      focused.view.destroyed
    ) {
      if (this.#parts.ring !== null) {
        this.#parts.ring.visible = false;
      }

      return;
    }

    // the assertion is ok, because #parts.ring is created alongside #config.focusRing in
    // the constructor, and we already returned above when #config.focusRing is undefined
    let ring = this.#parts.ring as pixi.NineSliceSprite;
    let {padding} = this.#config.focusRing;
    // Bounds are re-read every frame while the ring is visible, so it tracks
    // layout changes and animations without any cached geometry to invalidate.
    let bounds = focused.view.getBounds();
    let topLeft = this.#parts.overlay.toLocal({x: bounds.x, y: bounds.y});
    let bottomRight = this.#parts.overlay.toLocal({
      x: bounds.x + bounds.width,
      y: bounds.y + bounds.height,
    });

    ring.visible = true;
    ring.position.set(topLeft.x - padding, topLeft.y - padding);
    ring.setSize(bottomRight.x - topLeft.x + 2 * padding, bottomRight.y - topLeft.y + 2 * padding);
  }
```

(The two identifiers inside the "assertion is ok" comment are updated; the sentence is kept.) The comment block above `#collectFocusables()` mentions `#scopes`; update it to `#runtime.scopes` in place.

- [ ] **Step 5: Verify no old field name survives**

Run: `rg -n '#(focused|isRingVisible|scopes|overlay|ring|focusRing)\b' source/engine/ui/UiRoot.ts | rg -v '#(runtime|parts|config)\.'`
Expected: no output (every remaining mention is a bag access).

- [ ] **Step 6: Format, typecheck, lint**

Run: `npx prettier --write source/engine/ui/UiRoot.ts && npm run typecheck && npm run lint`
Expected: exit 0.

- [ ] **Step 7: Run UiRoot's suite**

Run: `npx vitest run --project browser tests/UiRoot.browser.test.ts`
Expected: PASS, same count as Step 1.

- [ ] **Step 8: Review the diff for lost comments**

Run: `git diff -- source/engine/ui/UiRoot.ts | rg '^-\s*//|^-\s*/\*\*'`
Expected: only the `/** TBD */` lines of `#focused`, `#focusRing`, `#isRingVisible`, `#overlay`, `#ring`, `#scopes`, plus the two comment lines whose identifiers were updated (their `+` counterparts must be in the diff).

- [ ] **Step 9: Commit**

```bash
git add source/engine/ui/UiRoot.ts
git commit -m "Refactor UiRoot private fields into bags"
```

---

### Task 6: Text

**Files:**
- Modify: `source/engine/ui/Text.ts`
- Test: `tests/Text.browser.test.ts` (existing, unchanged)

**Interfaces:**
- Consumes: `Config`, `Parts` from Task 1. No `Runtime`: Text has no mutable state.
- `#config.style` is the merged theme+override style (`pixi.TextStyleOptions`); `role` is consumed by that merge and not stored. `layout` is stored raw because Text's three-way branch on it is the build step.

- [ ] **Step 1: Baseline**

Run: `npx vitest run --project browser tests/Text.browser.test.ts`
Expected: PASS.

- [ ] **Step 2: Rewrite imports, fields and the constructor**

Replace lines 1-50 (through the end of the constructor) with:

```ts
import * as pixi from 'pixi.js';

import {type Config} from '../utilities/Config.js';
import {type Disposables} from '../utilities/Disposables.js';
import {type Parts} from '../utilities/Parts.js';
import {type TextOptions} from './TextOptions.js';
import {type UiTheme} from './UiTheme.js';

const DEFAULT_ANCHOR: pixi.PointData = {x: 0, y: 0};
// A layout leaf is measured by its own bounds, but @pixi/layout then fits it to
// the box yoga computed: objectFit defaults to 'fill', which SCALES the glyphs
// by box/bounds on each axis, and objectPosition defaults to 'center', which
// re-centers them inside the box. The box comes from the leaf's intrinsic size,
// which LayoutSystem re-measures on a ~100 ms throttle, so text that changes
// every frame (the dialogue typewriter) renders most frames against a stale
// box: squashed to a fractional width and drifting. The font has one size and
// must render 1:1, so the leaf opts out of both.
const LEAF_LAYOUT = {isLeaf: true, objectFit: 'none', objectPosition: 'left top'} as const;

export class Text {
  /** View. */
  readonly view: pixi.Container = new pixi.Container();

  /** Resolved once from options and theme; fixed for the instance's lifetime. */
  readonly #config: Config<{
    anchor: pixi.PointData;
    layout: pixi.ContainerOptions['layout'];
    style: pixi.TextStyleOptions;
    theme: UiTheme | undefined;
  }>;

  /** Stacks to register disposers that cleanup resources when needed. */
  readonly #disposables: Disposables<'instance'> = {instance: new DisposableStack()};

  /** Display objects the text creates and owns. */
  readonly #parts: Parts<{sprite: pixi.BitmapText}>;

  constructor(options: TextOptions) {
    let {text, theme, role = 'label', anchor = DEFAULT_ANCHOR, layout, ...style} = options;
    let themeStyle = theme?.text[role];

    this.#config = {
      anchor,
      layout,
      style: themeStyle === undefined ? style : {...themeStyle, ...style},
      theme,
    };
    this.#parts = {sprite: new pixi.BitmapText({text, style: this.#config.style})};

    this.#parts.sprite.anchor.set(this.#config.anchor.x, this.#config.anchor.y);
    this.view.addChild(this.#parts.sprite);

    if (this.#config.layout !== undefined) {
      if (this.#config.layout === true) {
        this.view.layout = {...LEAF_LAYOUT};
      } else if (typeof this.#config.layout === 'object' && this.#config.layout !== null) {
        this.view.layout = {...LEAF_LAYOUT, ...this.#config.layout};
      } else {
        this.view.layout = this.#config.layout;
      }
    }

    this.#disposables.instance.defer(() => this.view.destroy({children: true}));
  }
```

- [ ] **Step 3: Update the getter and methods**

`get style()` returns `this.#parts.sprite.style`; `measureWidth()` passes `this.#parts.sprite.style` (its comment stays); `setAnchor()` calls `this.#parts.sprite.anchor.set(...)`; `setText()` assigns `this.#parts.sprite.text = text;`.

- [ ] **Step 4: Verify no old field name survives**

Run: `rg -n 'this\.#sprite\b' source/engine/ui/Text.ts`
Expected: no output.

- [ ] **Step 5: Format, typecheck, lint**

Run: `npx prettier --write source/engine/ui/Text.ts && npm run typecheck && npm run lint`
Expected: exit 0. If typecheck rejects `style: pixi.TextStyleOptions`, the `fill?: pixi.ColorSource` from `TextOptions` is the likely culprit; the value is the same object the old code passed to `new pixi.BitmapText({style})`, so widen the key to `Parameters<typeof pixi.BitmapText>[0]['style']` rather than changing the value.

- [ ] **Step 6: Run Text's suite**

Run: `npx vitest run --project browser tests/Text.browser.test.ts`
Expected: PASS, same count as Step 1.

- [ ] **Step 7: Review the diff for lost comments**

Run: `git diff -- source/engine/ui/Text.ts | rg '^-\s*//|^-\s*/\*\*'`
Expected: only the `/** TBD */` line of `#sprite`.

- [ ] **Step 8: Commit**

```bash
git add source/engine/ui/Text.ts
git commit -m "Refactor Text private fields into bags"
```

---

### Task 7: Panel

**Files:**
- Modify: `source/engine/ui/Panel.ts`

**Interfaces:**
- Consumes: `Config`, `Parts` from Task 1. Panel has no mutable state, so no `#runtime`.
- The resolved background (passed in, or created from the theme) is a part, as Button's backgrounds are.

- [ ] **Step 1: Baseline**

Panel has no suite of its own. Run: `npm run typecheck && npm run lint`
Expected: exit 0.

- [ ] **Step 2: Rewrite imports, fields and the constructor**

Replace lines 1-32 (through the end of the constructor) with:

```ts
import {LayoutContainer} from '@pixi/layout/components';
import type * as pixi from 'pixi.js';

import {type Config} from '../utilities/Config.js';
import {type Disposables} from '../utilities/Disposables.js';
import {type Parts} from '../utilities/Parts.js';
import {createBackground} from './internals/createBackground.js';
import {type PanelOptions} from './PanelOptions.js';
import {type UiChild, type UiParent} from './UiChild.js';
import {type UiTheme} from './UiTheme.js';

export class Panel implements UiParent {
  /** TBD */
  readonly children: UiChild[] = [];

  /** View. */
  readonly view: LayoutContainer;

  /** Resolved once from options and theme; fixed for the instance's lifetime. */
  readonly #config: Config<{
    layout: Exclude<pixi.ContainerOptions['layout'], boolean>;
    theme: UiTheme | undefined;
  }>;

  /** Stacks to register disposers that cleanup resources when needed. */
  readonly #disposables: Disposables<'instance'> = {instance: new DisposableStack()};

  /** Display objects the panel creates and owns. */
  readonly #parts: Parts<{background: pixi.Container | undefined}>;

  constructor({background, theme, children, layout}: PanelOptions) {
    this.#config = {layout: typeof layout === 'object' ? layout : undefined, theme};
    this.#parts = {
      background:
        background ??
        (this.#config.theme && createBackground(this.#config.theme.panel.background)),
    };

    this.view = new LayoutContainer(
      this.#parts.background === undefined ? {} : {background: this.#parts.background},
    );

    if (children !== undefined) {
      this.addChild(...children);
    }

    this.view.layout = {...this.#config.layout};

    this.#disposables.instance.defer(() => this.view.destroy({children: true}));
  }
```

The rest of the file (`addChild`, `destroy`, `removeChild`) is unchanged.

- [ ] **Step 3: Format, typecheck, lint**

Run: `npx prettier --write source/engine/ui/Panel.ts && npm run typecheck && npm run lint`
Expected: exit 0.

- [ ] **Step 4: Run the suites that construct panels**

Run: `npx vitest run --project browser tests/Modal.browser.test.ts tests/pauseFlow.browser.test.ts tests/UiRoot.browser.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add source/engine/ui/Panel.ts
git commit -m "Refactor Panel private fields into bags"
```

---

### Task 8: TextInput

The largest one (19 private fields) and last, so the pattern is settled before it. There is no TextInput suite; typecheck, lint and the final full `npm test` are the gates, plus a manual check.

**Files:**
- Modify: `source/engine/ui/TextInput.ts`

**Interfaces:**
- Consumes: `Config`, `Parts`, `Runtime` from Task 1; `UiTextStyle` from `./UiTheme.js`.
- `#config.textStyle` is the resolved `{fontFamily?, fontSize?, fill?}` object (`Partial<UiTextStyle>`; verified assignable from the conditional spread under `exactOptionalPropertyTypes`, and spreadable back into `Text`'s options); `role`/`fontFamily`/`fontSize`/`fill` are consumed by it and not stored. `value` is `#runtime`'s initial value.

- [ ] **Step 1: Baseline**

Run: `npm run typecheck && npm run lint`
Expected: exit 0.

- [ ] **Step 2: Rewrite imports and fields**

Replace lines 1-83 (imports, `BLINK_PERIOD` and its comment, the fields) with:

```ts
import {LayoutContainer} from '@pixi/layout/components';
import * as pixi from 'pixi.js';

import {type Config} from '../utilities/Config.js';
import {type Disposables} from '../utilities/Disposables.js';
import {type Parts} from '../utilities/Parts.js';
import {type Runtime} from '../utilities/Runtime.js';
import {type Focusable} from './Focusable.js';
import {adoptDetachedBackgrounds} from './internals/adoptDetachedBackgrounds.js';
import {attachWidgetInteraction} from './internals/attachWidgetInteraction.js';
import {resolveBackgrounds} from './internals/resolveBackgrounds.js';
import {resolveThemedBackgrounds} from './internals/resolveThemedBackgrounds.js';
import {setInteractionEnabled} from './internals/setInteractionEnabled.js';
import {swapBackground} from './internals/swapBackground.js';
import {Text} from './Text.js';
import {type TextInputOptions} from './TextInputOptions.js';
import {type TextInputState} from './TextInputState.js';
import {type UiTextStyle, type UiTheme} from './UiTheme.js';

// One full blink cycle in ticker frames: ~0.5 s lit, ~0.5 s dark at 60 fps.
const BLINK_PERIOD = 60;

export class TextInput implements Focusable {
  /** View. */
  readonly view: LayoutContainer;

  /** Resolved once from options and theme; fixed for the instance's lifetime. */
  readonly #config: Config<{
    caretHeight: number;
    container: HTMLElement;
    layout: Exclude<pixi.ContainerOptions['layout'], boolean>;
    maxLength: number | undefined;
    placeholder: string;
    textStyle: Partial<UiTextStyle>;
    theme: UiTheme | undefined;
  }>;

  /** Stacks to register disposers that cleanup resources when needed. */
  readonly #disposables: Disposables<'instance', 'editing'> = {
    editing: null,
    instance: new DisposableStack(),
  };

  /** Lifecycle hook called when the input's value changes. */
  readonly #onChange?: (input: TextInput) => void;

  /** Lifecycle hook called when Enter is pressed while editing. */
  readonly #onEnter?: (input: TextInput) => void;

  /** Display objects and the hidden DOM input the field creates and owns. */
  readonly #parts: Parts<{
    backgrounds: Record<TextInputState, pixi.Container>;
    caret: pixi.Sprite;
    input: HTMLInputElement;
    placeholderText: Text;
    row: LayoutContainer;
    valueText: Text;
  }>;

  // caretOffset and caretWidth are -1 until #syncCaret writes the first layout; no
  // measured offset or width can be negative, so the first sync always applies.
  /** Values that change during the instance's life. */
  readonly #runtime: Runtime<{
    blinkTick: number;
    caretOffset: number;
    caretWidth: number;
    isEditing: boolean;
    isOwnPointerDown: boolean;
    value: string;
  }>;

  /** State; which part of its life cycle the instance is currently in. */
  #state: TextInputState = 'normal';
```

(The "-1 on both until #syncCaret…" comment is kept with the two keys named, since "both" no longer identifies them.)

- [ ] **Step 3: Rewrite the constructor**

Replace the entire constructor (currently lines 85-324) with the following. Every comment from the old constructor is present; the order changed so that `#config` is resolved first, parts are created as locals from it, the bags are assigned, and then the view is wired exactly as before.

```ts
  constructor({
    backgrounds,
    theme,
    value = '',
    placeholder = '',
    maxLength,
    container,
    role,
    fontFamily,
    fontSize,
    fill,
    onChange,
    onEnter,
    layout,
  }: TextInputOptions) {
    if (onChange !== undefined) {
      this.#onChange = onChange;
    }

    if (onEnter !== undefined) {
      this.#onEnter = onEnter;
    }

    // TextInput defaults to 'body' because it renders entered text, not a label.
    let style = theme === undefined ? undefined : theme.text[role ?? 'body'];
    let resolvedFontFamily = fontFamily ?? style?.fontFamily;
    let resolvedFontSize = fontSize ?? style?.fontSize;
    let resolvedFill = fill ?? style?.fill;

    this.#config = {
      // The block covers the character's whole line box, the way a terminal's cell
      // cursor does. Falls back to 0 only in the no-theme, no-explicit-fontSize
      // branch — unreachable through TextInputOptions in practice (the theme, when
      // present, always supplies a fontSize), used here only, not smuggled into
      // the text style above.
      caretHeight: resolvedFontSize ?? 0,
      container,
      layout: typeof layout === 'object' ? layout : undefined,
      maxLength,
      placeholder,
      textStyle: {
        ...(resolvedFontFamily === undefined ? undefined : {fontFamily: resolvedFontFamily}),
        ...(resolvedFontSize === undefined ? undefined : {fontSize: resolvedFontSize}),
        ...(resolvedFill === undefined ? undefined : {fill: resolvedFill}),
      },
      theme,
    };

    let resolved = resolveThemedBackgrounds(
      ['normal', 'hovered', 'disabled'],
      this.#config.theme?.textInput,
      backgrounds,
    );

    if (resolved.normal === undefined) {
      // Unreachable through ThemedOptions, which requires one source or the other.
      throw new Error('TextInput needs a theme or a normal background!');
    }

    let row = new LayoutContainer({});

    row.layout = {flexDirection: 'row', alignItems: 'center'};

    // LayoutContainer makes itself an interactive hit target ('static', for its
    // scroll trackpad), and Pixi takes the canvas cursor from the deepest
    // interactive hit target only; the purely visual row would override the
    // view's 'text' cursor wherever the text covers the field.
    row.eventMode = 'none';

    let valueText = new Text({text: value, layout: true, ...this.#config.textStyle});
    let placeholderText = new Text({
      text: this.#config.placeholder,
      layout: true,
      ...this.#config.textStyle,
    });

    placeholderText.view.alpha = 0.5;

    let caret = new pixi.Sprite(pixi.Texture.WHITE);

    caret.tint = this.#config.textStyle.fill ?? 0xffffff;

    let input = document.createElement('input');

    input.type = 'text';
    input.value = value;
    input.inputMode = 'text';
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.tabIndex = -1;
    input.setAttribute('autocorrect', 'off');
    input.setAttribute('autocapitalize', 'none');

    if (this.#config.maxLength !== undefined) {
      input.maxLength = this.#config.maxLength;
    }

    let inputStyle = input.style;

    // Keep the element genuinely present and focusable so mobile opens the soft
    // keyboard, but make it visually invisible via transparent colors rather than
    // display:none / visibility:hidden / opacity:0 / z-index:-1, all of which can
    // stop Android from opening the keyboard. pointerEvents is 'none' so taps
    // always route through the Pixi view, never this element.
    inputStyle.position = 'fixed';
    inputStyle.top = '0';
    inputStyle.left = '0';
    inputStyle.width = '1px';
    inputStyle.height = '1px';
    inputStyle.padding = '0';
    inputStyle.margin = '0';
    inputStyle.border = '0';
    inputStyle.outline = 'none';
    inputStyle.background = 'transparent';
    inputStyle.color = 'transparent';
    inputStyle.caretColor = 'transparent';
    inputStyle.fontSize = '16px'; // >= 16px avoids iOS focus zoom
    inputStyle.pointerEvents = 'none';

    this.#parts = {
      backgrounds: resolveBackgrounds(['normal', 'hovered', 'disabled'], resolved.normal, resolved),
      caret,
      input,
      placeholderText,
      row,
      valueText,
    };
    this.#runtime = {
      blinkTick: 0,
      caretOffset: -1,
      caretWidth: -1,
      isEditing: false,
      isOwnPointerDown: false,
      value,
    };

    adoptDetachedBackgrounds(this.#disposables.instance, Object.values(this.#parts.backgrounds));

    this.view = new LayoutContainer({background: this.#parts.backgrounds.normal});

    attachWidgetInteraction(this.view, {
      cursor: 'text',
      getState: () => this.#state,
      setState: (state) => {
        this.#state = state;

        swapBackground(this.view, this.#parts.backgrounds[state]);
      },
    });

    this.view.addChild(row);

    // Cancel the native pointerdown so the browser does not generate the
    // compatibility mouse events whose default action moves focus to the canvas,
    // which would immediately blur the hidden input right after startEditing() and close
    // the soft keyboard. (Per the Pointer Events spec, canceling pointerdown
    // suppresses the compatibility mouse events.)
    this.view.on('pointerdown', (event) => {
      event.stopPropagation();
      event.preventDefault();
      this.#runtime.isOwnPointerDown = true;
    });

    // Use pointerup rather than pointertap: on touch, a tap with slight finger
    // movement is classified as a drag and pointertap never fires, so the field
    // would never focus and the soft keyboard would never open.
    this.view.on('pointerup', (event) => {
      event.stopPropagation();
      this.startEditing();
    });

    // The view is a row (@pixi/layout defaults flexDirection to 'row'), so
    // justifyContent is the horizontal axis. Typed text reads left-to-right from
    // the field's left edge, as text fields customarily do; only the vertical
    // axis is centered. Centering the main axis instead would drift the value
    // sideways on every keystroke whenever the field is wider than its content.
    this.view.layout = {
      justifyContent: 'flex-start',
      alignItems: 'center',
      ...this.#config.layout,
    };

    this.#config.container.append(input);

    let handleInput = () => {
      if (this.#state === 'disabled') {
        return;
      }

      let next = input.value;

      if (this.#config.maxLength !== undefined && next.length > this.#config.maxLength) {
        next = next.slice(0, this.#config.maxLength);
        input.value = next;
      }

      this.#runtime.value = next;
      this.#parts.valueText.setText(next);
      this.#onChange?.(this);
    };
    // TODO: remove when linter config contains fix for this: https://github.com/sindresorhus/eslint-plugin-unicorn/issues/2088
    // eslint-disable-next-line unicorn/consistent-function-scoping -- false positive
    let handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Enter') {
        this.#onEnter?.(this);
        this.stopEditing();
      } else if (event.key === 'Escape') {
        this.stopEditing();
      }
    };

    input.addEventListener('input', handleInput);
    input.addEventListener('keydown', handleKeyDown);

    this.#disposables.instance.defer(() => {
      input.removeEventListener('input', handleInput);
      input.removeEventListener('keydown', handleKeyDown);
      input.remove();
    });

    let update = (ticker: pixi.Ticker) => {
      if (!this.#runtime.isEditing) {
        return;
      }

      // Ahead of the advance below, so a caret that moved this frame is lit for
      // the frame it moved on rather than one later.
      this.#syncCaret();

      this.#runtime.blinkTick = (this.#runtime.blinkTick + ticker.deltaTime) % BLINK_PERIOD;

      // A block covers the character it sits on, so it blinks hard on and off;
      // fading would leave that character half-obscured for most of the cycle.
      this.#parts.caret.alpha = this.#runtime.blinkTick < BLINK_PERIOD / 2 ? 1 : 0;
    };

    pixi.Ticker.shared.add(update);

    this.#disposables.instance.defer(() => {
      pixi.Ticker.shared.remove(update);
    });

    // #parts.valueText / #parts.placeholderText / #parts.caret are swapped in and out of
    // #parts.row, so whichever is currently detached would leak under view.destroy({children}).
    this.#disposables.instance.defer(() => {
      this.#parts.row.removeChildren();
      this.#parts.valueText.destroy();
      this.#parts.placeholderText.destroy();
      this.#parts.caret.destroy();
      this.view.destroy({children: true});
    });

    // The caret is only in the row while editing, but it has to carry a layout
    // before it first lands there: an unlaid-out sprite renders at the white
    // texture's own size for a frame.
    this.#syncCaret();
    this.#refresh();
  }
```

- [ ] **Step 4: Update the accessors and methods**

```ts
  /** TBD */
  get value(): string {
    return this.#runtime.value;
  }

  set value(value: string) {
    this.#runtime.value =
      this.#config.maxLength === undefined ? value : value.slice(0, this.#config.maxLength);
    this.#parts.valueText.setText(this.#runtime.value);
    this.#parts.input.value = this.#runtime.value;

    this.#refresh();
  }
```

`disable()`: `swapBackground(this.view, this.#parts.backgrounds.disabled);`. `enable()`: `swapBackground(this.view, this.#parts.backgrounds.normal);`.

`startEditing()` (all its comments stay):

```ts
  startEditing(): this {
    if (this.#runtime.isEditing) {
      return this;
    }

    this.#runtime.isEditing = true;

    // Clear the own-pointer flag the opening tap set, so the first outside tap
    // is recognized as outside (nothing else clears it before the listener
    // below exists).
    this.#runtime.isOwnPointerDown = false;

    // Everything that only matters during an edit is registered by the edit and
    // torn down with it, so idle inputs hold no app-wide listeners. Closes the
    // editor when a pointerdown lands outside this field, and when the input
    // loses focus on its own (e.g. the soft keyboard is dismissed), so the
    // field can be focused again afterwards. A tap on this field's own view
    // sets #runtime.isOwnPointerDown first (the view's federated pointerdown runs
    // before the window listener), so an in-field tap keeps the edit — and the
    // soft keyboard — alive.
    this.#disposables.editing = new DisposableStack();

    // TODO: remove when linter config contains fix for this: https://github.com/sindresorhus/eslint-plugin-unicorn/issues/2088
    // eslint-disable-next-line unicorn/consistent-function-scoping -- false positive
    let handleBlur = () => {
      if (this.#runtime.isOwnPointerDown) {
        this.#runtime.isOwnPointerDown = false;

        return;
      }

      this.stopEditing();
    };

    globalThis.addEventListener('pointerdown', handleBlur);
    this.#parts.input.addEventListener('blur', handleBlur);
    this.#disposables.editing.defer(() => {
      globalThis.removeEventListener('pointerdown', handleBlur);
      this.#parts.input.removeEventListener('blur', handleBlur);
    });

    this.#parts.input.value = this.#runtime.value;

    let {x, y} = this.view.getGlobalPosition();
    let ratio = window.devicePixelRatio || 1;
    // getGlobalPosition is in renderer (device) pixels relative to the canvas;
    // the input is position: fixed (viewport-relative), so offset by the canvas
    // container's viewport rect and convert device px -> CSS px.
    let rect = this.#config.container.getBoundingClientRect();

    this.#parts.input.style.left = `${rect.left + x / ratio}px`;
    this.#parts.input.style.top = `${rect.top + y / ratio}px`;

    this.#parts.input.focus({preventScroll: true});

    this.#refresh();

    return this;
  }
```

`stopEditing()`: `if (!this.#runtime.isEditing)`, `this.#runtime.isEditing = false;`, `this.#parts.input.blur();` (comments stay).

`#positionCaret()`:

```ts
  #positionCaret(offset: number, width: number) {
    this.#runtime.caretOffset = offset;
    this.#runtime.caretWidth = width;

    // Restart the blink lit. A caret that moved during the dark half would
    // otherwise leave the user hunting for where it went — and since typing
    // moves it too, this also keeps it solid while the user types.
    this.#runtime.blinkTick = 0;

    this.#parts.caret.layout = {
      width,
      height: this.#config.caretHeight,
      // Out of the row's flow: an in-flow caret can only ever land after the
      // whole value, and it would shove the text following it aside as the
      // cursor moved through the string. `top` is left undefined so the row's
      // alignItems still centers it vertically.
      position: 'absolute',
      left: offset,
    };
  }
```

`#refresh()`:

```ts
  #refresh() {
    this.#parts.row.removeChildren();

    if (this.#runtime.isEditing) {
      this.#parts.row.addChild(this.#parts.valueText.view, this.#parts.caret);
    } else if (this.#runtime.value.length === 0) {
      this.#parts.row.addChild(this.#parts.placeholderText.view);
    } else {
      this.#parts.row.addChild(this.#parts.valueText.view);
    }
  }
```

`#syncCaret()`:

```ts
  #syncCaret() {
    // The hidden input owns the cursor: arrow keys, Home/End, word jumps and IME
    // all move it without changing the value, so there is no event to hook —
    // reading the selection back each frame is what catches every one of them.
    let index = this.#parts.input.selectionStart ?? this.#runtime.value.length;
    let offset = this.#parts.valueText.measureWidth(this.#runtime.value.slice(0, index));
    // The font leaves a single 1 art px column between glyphs and its descenders
    // fill the line box, so a bar caret has nowhere to sit without touching ink.
    // The caret is a block over the character's cell instead, the way a
    // terminal's is. Past the last character there is no cell to cover, so it
    // falls back to a space's advance.
    let width = this.#parts.valueText.measureWidth(this.#runtime.value[index] ?? ' ');

    if (offset !== this.#runtime.caretOffset || width !== this.#runtime.caretWidth) {
      this.#positionCaret(offset, width);
    }
  }
```

- [ ] **Step 5: Verify no old field name survives**

Run: `rg -n 'this\.#(backgrounds|blinkTick|caret|caretHeight|caretOffset|caretWidth|container|input|isEditing|isOwnPointerDown|maxLength|placeholderText|row|value|valueText)\b' source/engine/ui/TextInput.ts`
Expected: no output.

- [ ] **Step 6: Format, typecheck, lint**

Run: `npx prettier --write source/engine/ui/TextInput.ts && npm run typecheck && npm run lint`
Expected: exit 0.

- [ ] **Step 7: Review the diff for lost comments**

Run: `git diff -- source/engine/ui/TextInput.ts | rg '^-\s*//|^-\s*/\*\*'`
Expected: only the `/** TBD */` lines of the 15 removed fields, plus the two comment lines whose identifiers were updated ("-1 on both…" and "#valueText / #placeholderText / #caret are swapped…", each with a `+` counterpart).

- [ ] **Step 8: Manual check in the running app**

Run: `npm run develop`, open http://localhost:5000; the main menu's name input (`source/game/screens/mainMenuScreen.ts:50`) is the only `TextInput` in the game. Click it, type, press Enter, press Escape, click outside. Expected: caret blinks over the current character, value updates, editing stops on Enter/Escape/outside tap, exactly as before the refactor. Stop the server afterwards and confirm nothing is still listening on port 5000 (`netstat -ano | findstr :5000`); kill the node process if it is.

- [ ] **Step 9: Commit**

```bash
git add source/engine/ui/TextInput.ts
git commit -m "Refactor TextInput private fields into bags"
```

---

### Task 9: Final gate

**Files:** none modified.

- [ ] **Step 1: Full gates**

Run: `npm run typecheck && npm run lint && npm test`
Expected: all exit 0, every suite passes.

- [ ] **Step 2: Whole-folder sweep for stragglers**

Run: `rg -n 'readonly #\w+' source/engine/ui/*.ts | rg -v '#(config|disposables|on[A-Z]\w*|parts|runtime)\b'`
Expected: no output (the only `readonly #` fields left in `ui/` are the bags, `#disposables` and hooks). And: `rg -c 'import \{type (Config|Parts|Runtime)\}' source/engine/ui/*.ts` lists Button, Modal, Panel, Slider, Text, TextInput, Toggle, UiRoot. And: `rg -n 'eslint-disable' source/engine/ui/*.ts` shows only the two pre-existing `unicorn/consistent-function-scoping` lines in TextInput and the one in UiRoot; nothing about `no-unused-private-class-members`.

- [ ] **Step 3: Report**

Summarize per widget: fields before → after, any decision (1-2) that was applied differently from the default, and the test counts. No commit; the branch is ready for Jakub's review.

## Self-review notes

- Spec coverage: three helpers (Task 1), config-first construction with the theme lookup through `this.#config.theme` (Tasks 1, 2, 6, 7, 8; Slider documented exception in Task 3; UiRoot in Task 5; Modal has no theme), theme stored on every themed widget (Tasks 1-3, 5-8), `#parts` bag (Tasks 1-8), mutable bag not named `#state` (Tasks 2-5, 8), hooks/`#state`/`#disposables` untouched (Global Constraints), scope limited to `ui/` (File Structure).
- Type consistency: every task imports `Config`/`Parts`/`Runtime` from `../utilities/<Name>.js` as `type`; every `#config` in a themed widget has `theme: UiTheme | undefined` except UiRoot (`UiTheme`); `layout` keys follow the "layout keys" rule in Design (Button `NonNullable<UiTheme['button']['layout']>`, Text raw `pixi.ContainerOptions['layout']`, Modal/Panel/TextInput `Exclude<pixi.ContainerOptions['layout'], boolean>`); free-function signatures (`pressPadding`, `snap`, `fillWidth`, `valueFromEvent`, `toggleBackground`) are unchanged and receive `this.#config` / `this.#parts.backgrounds` where they used to receive rebuilt literals or individual fields.
- Verified while writing (2026-09-14): `pixi.ContainerOptions['layout']` is `Omit<LayoutOptions, 'target'> | null | boolean` per `@pixi/layout/dist/index.d.ts`, and `LayoutStyles`/`YogaStyles` have no required members, so Button's merged spread is assignable to `NonNullable<UiTheme['button']['layout']>`; a `tsc --strict --exactOptionalPropertyTypes` probe confirmed the conditional-spread `textStyle` object is assignable to `Partial<UiTextStyle>` and re-spreads into an options object with plain optional keys.
- Lint: every `#config` is read in its own constructor, so `@typescript-eslint/no-unused-private-class-members` needs no suppression; `noUnusedLocals` is off, so TypeScript does not flag write-only members either.
