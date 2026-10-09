# Dialogue Next Function Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** A node's `next` and a choice's `next` may be a function of the context that returns a node
or an id, and the runner calls it once each time it is followed.

**Architecture:** One alias, `DialogueReference`, names a node, an id or a function of the context
that returns either; both `next` fields and `start` are declared through it. The runner's
`#enterNode()` is the one place that resolves a `next`, so it calls a function before it looks the
node up. `advance()`, `choose()`, `defineDialogueScript` and `DialogueBox` do not change.

**Tech Stack:** TypeScript 6 (strict by default), Vitest 4 (a `unit` project in Node and a `browser`
project in Playwright's Chromium), Turborepo.

**Spec:** `docs/superpowers/specs/2026-10-08-dialogue-next-function-design.md`

## Global Constraints

- Only files under `packages/tellurion/` change. Nothing under `apps/somewhere/` or `apps/foam/`.
- The alias `DialogueReference<TContext, TNodeId extends string>` is exported from
  `source/dialogue/DialogueScript.ts`, written as in Task 1 Step 6. Its doc comment is the spec's
  without the Oxford comma:
  `/** Where a dialogue goes: a node, an id or a function of the context that returns either. */`.
- A function `next` returns a node or an id, never nothing. It cannot end the dialogue.
- The order on a choice: its `onChoose`, then its `next` with the context, then the next node's
  `onEnter`, then the next node's text. On a node: its last page, then its `next` with the context,
  then the next node's `onEnter`.
- No `try`/`catch`: an error from a function `next` reaches the caller of `choose()` or `advance()`
  and the runner stays on its node and in its phase.
- The dangling-id message names the id the function returned:
  `` `Dialogue node "${String(target)}" wasn't found in the script!` ``.
- Comments stay within 100 columns (CI's lint enforces this even where the local one does not). The
  spec's trailing comments on the two `next` fields would run to 110, so each field keeps its
  existing trailing comment and the note on when a function runs goes on the line above, as the
  `text` field's note does.
- Never remove a comment. `#enterNode`'s `/** TBD */` stays.
- Code style of the repository: `let` for locals, `const` only at module level; relative imports end
  in `.js`; prettier formats (printWidth 100, no bracket spacing, single quotes) and lint fails on a
  prettier difference.
- Tests use the `vitest` object (`vitest.fn`, `vitest.spyOn`), not `vi`. Every `vitest.fn` takes a
  type parameter (lint rule `vitest/require-mock-type-parameters`). A blank line separates a group
  of `expect` lines from other statements (`vitest/padding-around-all`).
- Work on the current branch, `somewhere-update`. Never use `git stash`. Commit at the end of the
  task; the message is one short imperative sentence, with no prefix and no trailer lines. Do not
  commit `apps/foam/docs/direction.md`, the spec or this plan: they are Jakub's.

## Review Focus

- **A roll made in `onChoose` and read by the same choice's `next`.** Foam's dice: `onChoose` writes
  the roll into the context and `next` routes on it, so the dialogue goes to the node the roll
  picked. Pinned in Task 1 (test "a choice's function next reads what its onChoose wrote").
- **A node with a function `next` that is entered and paged through.** The function runs only when
  the last page is advanced past: not on entry, not on a page turn. Pinned in Task 1 by the
  `not.toHaveBeenCalled()` lines in the two "follows a function next" tests.
- **A node's function `next` that throws.** The spec's behaviour table covers it; its test list has
  only the choice's case. `advance()` rethrows and the runner stays idle on the node's last page.
  Pinned in Task 1 (test "an error thrown by a node's function next…").
- **A node carrying both `choices` and a function `next`.** The DEV failure still fires and the
  function is never called. Pinned in Task 1; the test passes before the change, it holds the check.
- **Typed scripts handed to the runner.** A `DialogueScript<TContext, TNodeId>` must stay assignable
  to `RunnableDialogueScript<TContext>`: Somewhere's `dialogueSystem.ts` and Foam's
  `content/journeys.ts` and `screens/storyWindow.ts` rely on it. Pinned by the three-package turbo
  run in Task 1.

---

### Task 1: A next may be a function of the context

**Files:**

- Modify: `packages/tellurion/source/dialogue/DialogueScript.ts:1-24`
- Modify: `packages/tellurion/source/dialogue/Dialogue.ts:2` (import), `:10-16`
  (`RunnableDialogueScript`), `:247-255` (`#enterNode`)
- Test: `packages/tellurion/tests/Dialogue.test.ts`
- Test: `packages/tellurion/tests/dialogueScript.test.ts`
- Test: `packages/tellurion/tests/DialogueBox.browser.test.ts`

**Interfaces:**

- Consumes: `DialogueNode`, `DialogueChoice`, `DialogueScript`, `defineDialogueScript` from
  `source/dialogue/DialogueScript.ts`; `Dialogue`, `RunnableDialogueScript` from
  `source/dialogue/Dialogue.ts`.
- Produces: `export type DialogueReference<TContext, TNodeId extends string>`, exported from
  `tellurion` through `source/main.ts`'s existing `export * from './dialogue/DialogueScript.js'`.
  `DialogueChoice.next`, `DialogueNode.next` and `DialogueScript.start` are typed
  `DialogueReference<TContext, TNodeId>`; `RunnableDialogueScript.start` is
  `DialogueReference<TContext, string>`. Foam's second phase 5 spec writes function `next`s in its
  content and teaches its checker to call them.

- [ ] **Step 1: Write the failing runner tests**

In `packages/tellurion/tests/Dialogue.test.ts`, add these tests. Each builds its script inline, as
the file's other tests do.

At the end of `describe('Dialogue tick and advance', …)`, after the test
`advance follows next by id and by inline node`:

```ts
test('advance past the last page follows a function next once, by id and by inline node', () => {
  let context = createContext();
  let toB = vitest.fn<(c: TestContext) => string>(() => 'b');
  let toInline = vitest.fn<(c: TestContext) => {text: string}>(() => ({text: 'C'}));
  let dialogue = new Dialogue({
    script: {
      start: 'a',
      nodes: {a: {text: ['A1', 'A2'], next: toB}, b: {text: 'B', next: toInline}},
    },
    context,
  });

  dialogue.advance(); // skip page A1
  dialogue.advance(); // page turn

  expect(toB).not.toHaveBeenCalled();

  dialogue.advance(); // skip page A2
  dialogue.advance(); // past the last page: follows next

  expect(toB).toHaveBeenCalledTimes(1);
  expect(toB).toHaveBeenCalledWith(context);
  expect(dialogue.pageText).toBe('B');

  dialogue.advance();
  dialogue.advance();

  expect(toInline).toHaveBeenCalledTimes(1);
  expect(toInline).toHaveBeenCalledWith(context);
  expect(dialogue.pageText).toBe('C');
  expect(toB).toHaveBeenCalledTimes(1);
});

test("an error thrown by a node's function next reaches the caller and the runner stays", () => {
  let dialogue = new Dialogue({
    script: {
      start: {
        text: 'A',
        next: () => {
          throw new Error('Nowhere to go.');
        },
      },
    },
    context: createContext(),
  });

  dialogue.advance();

  expect(() => {
    dialogue.advance();
  }).toThrow('Nowhere to go.');
  expect(dialogue.phase).toBe('idle');
  expect(dialogue.pageText).toBe('A');
});
```

At the end of `describe('Dialogue choices', …)`, after the test
`an ended dialogue runs no onChoose`:

```ts
test('choose follows a function next once with the context, after onChoose, before onEnter', () => {
  let context = createContext();
  let next = vitest.fn<(c: TestContext) => string>((c) => {
    c.calls.push('next');

    return 'a';
  });
  let dialogue = new Dialogue({
    script: {
      start: 'q',
      nodes: {
        q: {
          text: 'Q',
          choices: [
            {
              text: 'A',
              next,
              onChoose: (c: TestContext) => {
                c.calls.push('onChoose');
              },
            },
          ],
        },
        a: {
          text: 'Went A.',
          onEnter: (c: TestContext) => {
            c.calls.push('onEnter');
          },
        },
      },
    },
    context,
  });

  dialogue.advance();

  expect(next).not.toHaveBeenCalled(); // unlike isVisible, not evaluated on node entry

  dialogue.choose(0);

  expect(next).toHaveBeenCalledTimes(1);
  expect(next).toHaveBeenCalledWith(context);
  expect(context.calls).toEqual(['onChoose', 'next', 'onEnter']);
  expect(dialogue.pageText).toBe('Went A.');
});

test('a function next followed again on a later visit runs again and may lead elsewhere', () => {
  let next = vitest.fn<(c: TestContext) => string>((c) => (c.metMira ? 'again' : 'first'));
  let dialogue = new Dialogue({
    script: {
      start: 'q',
      nodes: {
        q: {text: 'Q', choices: [{text: 'Hello', next}]},
        first: {
          text: 'First time.',
          next: 'q',
          onEnter: (c: TestContext) => {
            c.metMira = true;
          },
        },
        again: {text: 'Back already?'},
      },
    },
    context: createContext(),
  });

  dialogue.advance();
  dialogue.choose(0);

  expect(dialogue.pageText).toBe('First time.');

  dialogue.advance();
  dialogue.advance(); // back to q
  dialogue.advance();
  dialogue.choose(0);

  expect(next).toHaveBeenCalledTimes(2);
  expect(dialogue.pageText).toBe('Back already?');
});

test("a choice's function next reads what its onChoose wrote", () => {
  let dialogue = new Dialogue({
    script: {
      start: 'q',
      nodes: {
        q: {
          text: 'Q',
          choices: [
            {
              text: 'Roll',
              next: (c: TestContext) => (c.metMira ? 'success' : 'failure'),
              onChoose: (c: TestContext) => {
                c.metMira = true;
              },
            },
          ],
        },
        success: {text: 'Success.'},
        failure: {text: 'Failure.'},
      },
    },
    context: createContext(),
  });

  dialogue.advance();
  dialogue.choose(0);

  expect(dialogue.pageText).toBe('Success.');
});

test("an error thrown by a choice's function next reaches the caller after onChoose", () => {
  let onChoose = vitest.fn<() => void>();
  let dialogue = new Dialogue({
    script: {
      start: {
        text: 'Q',
        choices: [
          {
            text: 'A',
            next: () => {
              throw new Error('Nowhere to go.');
            },
            onChoose,
          },
        ],
      },
    },
    context: createContext(),
  });

  dialogue.advance();

  expect(() => {
    dialogue.choose(0);
  }).toThrow('Nowhere to go.');
  expect(onChoose).toHaveBeenCalledTimes(1);
  expect(dialogue.phase).toBe('choosing');
  expect(dialogue.pageText).toBe('Q');
});
```

At the end of `describe('Dialogue DEV invariants', …)`, after the test
`a dangling node id throws (untyped data escape hatch)`:

```ts
test('a function next returning a dangling id throws, naming the id', () => {
  let dialogue = new Dialogue({
    script: {start: {text: 'x', next: () => 'missing'}},
    context: createContext(),
  });

  dialogue.advance();

  expect(() => {
    dialogue.advance();
  }).toThrow(/Dialogue node "missing" wasn't found/);
});

test('a node carrying both choices and a function next throws without calling it', () => {
  let next = vitest.fn<(c: TestContext) => string>(() => 'y');

  expect(
    () =>
      new Dialogue({
        script: {start: {text: 'x', choices: [{text: 'A'}], next}},
        context: createContext(),
      }),
  ).toThrow(/both choices and next/);
  expect(next).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run the runner tests to see them fail**

Run: `cd packages/tellurion && npx vitest run --project unit tests/Dialogue.test.ts`

Expected: FAIL. The runner takes each function for a node and spreads its missing text, so the two
"follows a function next" tests, "may lead elsewhere" and "reads what its onChoose wrote" fail with
`TypeError: text is not iterable`, and the two "error thrown by" tests and "naming the id" fail
because the error thrown is that `TypeError`, not the one expected. "both choices and a function
next" already passes: it holds the DEV check, which reads only that `next` is not `undefined`.

- [ ] **Step 3: Type the function `next` in the script tests**

In `packages/tellurion/tests/dialogueScript.test.ts`, the first test's `greeting` node gains a
fourth choice, after `I know the way.`:

```ts
            {
              text: 'Have we met?',
              next: (context) => (context.metMira ? 'again' : 'stranger'),
            },
```

and the node record gains a node after `again`:

```ts
        stranger: {
          speaker: 'Mira',
          portrait: 'mira',
          text: 'Not yet.',
          next: (context) => (context.metMira ? 'goodbye' : 'tour'),
        },
```

Neither parameter has an annotation: each must be inferred as `TestContext`, and each return must be
an id of the script.

In the test `dangling references are compile errors, not runtime errors`, add a fixture after
`danglingStart`:

```ts
let danglingFunction = defineDialogueScript<TestContext>()({
  start: 'greeting',
  nodes: {
    greeting: {
      text: 'hi',
      // @ts-expect-error -- a dangling id returned by a function `next` errors at the function
      next: () => 'missing',
    },
  },
});
```

and, after the test's two existing `expect` lines:

```ts
expect(danglingFunction.nodes?.greeting.next).toBeTypeOf('function');
```

The error lands on the `next:` line (TS2322 at the property), so the directive must sit directly
above it and the function must stay on that one line.

- [ ] **Step 4: Run the typecheck to see it fail**

Run: `cd packages/tellurion && npx tsc --project tsconfig.typecheck.json`

Expected: FAIL. Among the errors: TS7006 "Parameter 'context' implicitly has an 'any' type." at the
two new fixtures in `tests/dialogueScript.test.ts`, and TS2322 "Type '(context: any) => …' is not
assignable to type '… | DialogueNode<TestContext, …> | undefined'." at each.
`tests/Dialogue.test.ts` reports TS2322 at each function `next` as well (and, once Step 5 is in, so
does `tests/DialogueBox.browser.test.ts`). The `danglingFunction` fixture does not go red here:
before the change any function is an error at `next`, so its directive is used either way. Step 8
proves it.

- [ ] **Step 5: Write the failing box test**

In `packages/tellurion/tests/DialogueBox.browser.test.ts`, at the end of
`describe('DialogueBox focus integration', …)`, after the test
`a choice confirmed in the box runs its onChoose through the runner`:

```ts
test('a choice confirmed in the box follows its function next through the runner', async () => {
  let {ui} = await createUiWithOutsideButton();
  let dialogue = new Dialogue({
    script: {
      start: 'q',
      nodes: {
        q: {text: 'Q', choices: [{text: 'Yes', next: () => 'yes'}, {text: 'No'}]},
        yes: {text: 'Went yes.'},
      },
    },
    context: {},
  });
  let {box} = createBox({
    onChooseTap: (index) => {
      dialogue.choose(index);
    },
  });

  box.resize(10, 100);
  ui.addOverlay(box);
  box.showNode({page: dialogue.pageText});
  dialogue.advance();
  box.setChoices(
    dialogue.visibleChoices.map((choice) => choice.text),
    dialogue.selectedIndex,
  );
  ui.activate();

  expect(dialogue.pageText).toBe('Went yes.');
});
```

`Dialogue` is already imported at the top of the file.

Run: `cd packages/tellurion && npx vitest run --project browser tests/DialogueBox.browser.test.ts`

Expected: FAIL on the new test only, with `TypeError: text is not iterable`.

- [ ] **Step 6: Declare the alias and the two fields**

In `packages/tellurion/source/dialogue/DialogueScript.ts`, replace the three types above
`defineDialogueScript`'s doc comment (lines 1-24) with:

```ts
/** Where a dialogue goes: a node, an id or a function of the context that returns either. */
export type DialogueReference<TContext, TNodeId extends string> =
  | DialogueNode<TContext, TNodeId>
  | TNodeId
  | ((context: TContext) => DialogueNode<TContext, TNodeId> | TNodeId);

export type DialogueChoice<TContext, TNodeId extends string> = {
  text: string;
  // A function is evaluated with the context each time the choice is taken, after onChoose.
  next?: DialogueReference<TContext, TNodeId>; // absent = choosing ends the dialogue
  isVisible?: (context: TContext) => boolean; // evaluated once on node entry
  onChoose?: (context: TContext) => void; // effects; runs when taken, before next is followed
};

export type DialogueNode<TContext, TNodeId extends string> = {
  speaker?: string; // name label; omitted = no label (signs, narration)
  portrait?: string; // game-resolved texture name; omitted = collapsed portrait panel
  // One page or several; a function is evaluated once on node entry, after onEnter.
  text: string[] | ((context: TContext) => string[] | string) | string;
  choices?: Array<DialogueChoice<TContext, TNodeId>>; // a node with both choices and next DEV-throws
  // A function is evaluated with the context each time the last page is advanced past.
  next?: DialogueReference<TContext, TNodeId>; // absent + no choices = dialogue ends
  onEnter?: (context: TContext) => void; // effects: set flags, give items
};

export type DialogueScript<TContext, TNodeId extends string> = {
  start: DialogueReference<TContext, TNodeId>;
  nodes?: Record<TNodeId, DialogueNode<TContext, TNodeId>>; // optional: inline-only scripts skip it
};
```

`defineDialogueScript` and its doc comment do not change: its `start` already spells out the
function form with `NoInfer<TNodeId>`, and a `next` inside a node takes its type from
`DialogueNode`.

- [ ] **Step 7: Resolve a function in `#enterNode()`**

In `packages/tellurion/source/dialogue/Dialogue.ts`, the import on line 2 becomes:

```ts
import {type DialogueChoice, type DialogueNode, type DialogueReference} from './DialogueScript.js';
```

`RunnableDialogueScript`'s `start` (lines 11-14) becomes one line; its doc comment and `nodes` stay:

```ts
export type RunnableDialogueScript<TContext> = {
  start: DialogueReference<TContext, string>;
  nodes?: Readonly<Partial<Record<string, DialogueNode<TContext, string>>>>;
};
```

In `#enterNode`, the signature and the lookup (lines 247-251) become the following; the `/** TBD */`
above it and everything after the `if` block stay as they are:

```ts
  #enterNode(reference: DialogueReference<TContext, string>): void {
    let target = typeof reference === 'function' ? reference(this.#context) : reference;
    let node = typeof target === 'string' ? this.#script.nodes?.[target] : target;

    if (node === undefined) {
      failUnsupported(`Dialogue node "${String(target)}" wasn't found in the script!`);
      this.#end();

      return;
    }
```

The constructor, `advance()` and `choose()` do not change: they pass `start`, a node's `next` and a
choice's `next` through as they do today.

- [ ] **Step 8: Run the engine's tests and typecheck**

Run:
`cd packages/tellurion && npx prettier --write source/dialogue/DialogueScript.ts source/dialogue/Dialogue.ts tests/Dialogue.test.ts tests/dialogueScript.test.ts tests/DialogueBox.browser.test.ts && git diff --stat`

Expected: the five files and Jakub's `apps/foam/docs/direction.md`, nothing else. If prettier
changed lines outside the ones this task wrote, look at them before going on.

Run:
`cd packages/tellurion && npx vitest run --project unit tests/Dialogue.test.ts tests/dialogueScript.test.ts && npx vitest run --project browser tests/DialogueBox.browser.test.ts && npx tsc --project tsconfig.typecheck.json`

Expected: all PASS, typecheck exits 0.

Then see the `danglingFunction` fixture fail: in `tests/dialogueScript.test.ts`, change its
`() => 'missing'` to `() => 'greeting'` and run
`cd packages/tellurion && npx tsc --project tsconfig.typecheck.json`. Expected: FAIL with TS2578
"Unused '@ts-expect-error' directive." on that fixture. Change it back to `'missing'` and run the
typecheck again; it exits 0.

- [ ] **Step 9: Run the three packages**

Run (from the repository root):
`npx turbo run typecheck lint test --filter=tellurion --filter=somewhere --filter=foam --concurrency=1`

Expected: every task succeeds; lint reports 0 errors (known warnings may print). Turbo builds
Tellurion first, so Somewhere and Foam typecheck against the new types.

Then: `git diff --stat -- apps/` prints only `apps/foam/docs/direction.md`, Jakub's uncommitted
edit, which this task does not touch.

- [ ] **Step 10: Commit**

```bash
git add packages/tellurion/source/dialogue/DialogueScript.ts packages/tellurion/source/dialogue/Dialogue.ts \
  packages/tellurion/tests/Dialogue.test.ts packages/tellurion/tests/dialogueScript.test.ts \
  packages/tellurion/tests/DialogueBox.browser.test.ts
git commit -m "Let a dialogue next be a function of the context"
```
