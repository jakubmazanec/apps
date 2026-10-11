# Dialogue Choice Effect Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** A dialogue choice can carry `onChoose`, a function of the context that the runner calls
when the choice is taken, before it follows the choice's `next` or ends the dialogue.

**Architecture:** `DialogueChoice` gains one optional field, and `Dialogue.choose()` calls it after
its guards and before it leaves the node. `advance()` already confirms a choice through `choose()`,
so the keyboard path and the pointer path both get the effect. Nothing else in the runner, and
nothing in `DialogueBox`, changes.

**Tech Stack:** TypeScript, Vitest 4 (a `unit` project in Node and a `browser` project in
Playwright's Chromium), Turborepo.

**Spec:** `docs/superpowers/specs/2026-10-06-dialogue-choice-effect-design.md`

Foam's places-and-travel plan (`apps/foam/docs/superpowers/plans/2026-10-06-places-and-travel.md`)
runs after this one and relies on `onChoose`.

## Global Constraints

- Only files under `packages/tellurion/` change. Nothing under `apps/somewhere/` or `apps/foam/`.
- The field: `onChoose?: (context: TContext) => void;`, with the line comment
  `// effects; runs when taken, before next is followed`, after `isVisible` in `DialogueChoice`.
- `choose()` calls `choice.onChoose?.(this.#context)` after its two guards and before the
  `next === undefined` branch. No `try`/`catch`: an error from `onChoose` reaches the caller and the
  runner stays choosing.
- `defineDialogueScript`, `advance()`, `#enterNode`, `onEnter`, `isVisible` and `DialogueBox` do not
  change.
- Work on the current branch, `somewhere-update`. Commit at the end of the task; the message is one
  short imperative sentence, with no prefix and no trailer lines. Never use `git stash`.
- Code style of the repository: `let` for locals, `const` only at module level; relative imports end
  in `.js`; comments say why and stay within 100 columns (CI's lint enforces this even where the
  local one does not).
- Tests use the `vitest` object (`vitest.fn`, `vitest.spyOn`), not `vi`.

## Review Focus

- **A choice that `isVisible` filtered out.** Indices address `visibleChoices`, so `choose(0)` must
  run the first visible choice's `onChoose` and never the hidden one's. Pinned in Task 1.
- **The same choice taken on a second visit.** A choice whose `next` leads back to its own node runs
  `onChoose` each time it is taken. Pinned in Task 1.
- **An effect that the next node's choices read.** `isVisible` of the next node runs on its entry,
  after `onChoose`, so it sees the change. Pinned in Task 1.
- **An ended dialogue.** `choose()` after the end runs nothing; the phase guard covers it, and a
  test pins it with an `onChoose` spy (Task 1).
- **Foam and Somewhere read the engine's build.** A change that typechecks inside Tellurion can
  still break a game's typecheck; the three-package turbo run in Task 1 catches it.

---

### Task 1: A choice carries an effect

**Files:**

- Modify: `packages/tellurion/source/dialogue/DialogueScript.ts:1-5`
- Modify: `packages/tellurion/source/dialogue/Dialogue.ts:158-175` (`choose`)
- Test: `packages/tellurion/tests/Dialogue.test.ts` (the "Dialogue choices" block)
- Test: `packages/tellurion/tests/dialogueScript.test.ts` (the first test)
- Test: `packages/tellurion/tests/DialogueBox.browser.test.ts` (the "DialogueBox focus integration"
  block)

**Interfaces:**

- Produces: `DialogueChoice<TContext, TNodeId>.onChoose?: (context: TContext) => void`, exported
  from `tellurion` through the existing `DialogueChoice` type. Foam's way out sets it.

- [ ] **Step 1: Write the failing runner tests**

In `tests/Dialogue.test.ts`, inside `describe('Dialogue choices', …)`, add these tests. Each builds
its script inline, as the block's other tests do, and uses `createContext()`.

1. `choose runs the choice's onChoose once with the context, before the next node's onEnter`: a node
   `q` with one choice `{text: 'A', next: 'a', onChoose}`, where `onChoose` is a
   `vitest.fn((c: TestContext) => { c.calls.push('onChoose'); })`, and a node
   `a: {text: 'Went A.', onEnter: (c) => { c.calls.push('onEnter'); }}`. After `advance()` and
   `choose(0)`:

   ```ts
   expect(onChoose).toHaveBeenCalledTimes(1);
   expect(onChoose).toHaveBeenCalledWith(context);
   expect(context.calls).toEqual(['onChoose', 'onEnter']);
   expect(dialogue.pageText).toBe('Went A.');
   ```

2. `a choice with onChoose and no next runs it and ends the dialogue`:
   `start: {text: 'Q', choices: [{text: 'Bye', onChoose}]}`; after `advance()` and `choose(0)`,
   `onChoose` was called once and `phase` is `'ended'`.
3. `advance while choosing runs the selected choice's onChoose`: two choices with spies `first` and
   `second`, no `next`; `advance()`, `select(1)`, `advance()`; `second` was called once, `first`
   never.
4. `choose out of bounds or while revealing runs no onChoose`: one choice with a spy; `choose(0)`
   before any `advance()` (the runner is revealing), then `advance()` and `choose(5)`; the spy was
   never called and `phase` is `'choosing'`.
5. `an error thrown by onChoose reaches the caller and the runner stays choosing`: a choice
   `{text: 'A', next: 'a', onChoose: () => { throw new Error('No way.'); }}`; after `advance()`,
   `expect(() => { dialogue.choose(0); }).toThrow('No way.')`, then `phase` is `'choosing'` and
   `pageText` is `'Q'`.
6. `a choice filtered out by isVisible never runs its onChoose`: choices
   `[{text: 'Hidden', isVisible: () => false, onChoose: hidden}, {text: 'Shown', onChoose: shown}]`;
   `advance()`, `choose(0)`; `shown` was called once, `hidden` never.
7. `the same choice taken again runs its onChoose again`: node `q` with choices
   `[{text: 'Again', next: 'q', onChoose}, {text: 'Done'}]`; `advance()`, `choose(0)`, `advance()`,
   `choose(0)`; `onChoose` was called twice.
8. `the next node's isVisible sees what onChoose changed`: node `q` with
   `{text: 'Meet', next: 'r', onChoose: (c) => { c.metMira = true; }}`; node `r` with choices
   `[{text: 'Hi again', isVisible: (c) => c.metMira}]`; after `advance()` and `choose(0)`,
   `advance()` makes the runner choose, and `visibleChoices` has one choice, `'Hi again'`.
9. `an ended dialogue runs no onChoose`: `start: {text: 'Q', choices: [{text: 'Bye', onChoose}]}`;
   `advance()`, `choose(0)`, then `choose(0)` again; the spy was called once.

Run: `cd packages/tellurion && npx vitest run --project unit tests/Dialogue.test.ts` Expected: FAIL.
Tests 1, 2, 3, 6, 7 and 9 report the spy called 0 times, test 5 reports that nothing was thrown and
test 8 that no choice is visible. Test 4 already passes; it holds the guards.

- [ ] **Step 2: Type the field in the script test**

In `tests/dialogueScript.test.ts`, the first test's `greeting` node gains a third choice:

```ts
{
  text: 'I know the way.',
  onChoose: (context) => {
    context.metMira = true;
  },
},
```

The parameter has no annotation: it must be inferred as `TestContext`.

Run: `cd packages/tellurion && npx tsc --project tsconfig.typecheck.json` Expected: FAIL with
"Object literal may only specify known properties, and 'onChoose' does not exist in type
'DialogueChoice<…>'" (and the parameter implicitly `any`).

- [ ] **Step 3: Write the failing box test**

In `tests/DialogueBox.browser.test.ts`, import `Dialogue` from `../source/dialogue/Dialogue.js` at
the top (it does not import the mocked `Text`), and add to
`describe('DialogueBox focus integration', …)`:

`a choice confirmed in the box runs its onChoose through the runner`: create `ui` with
`createUiWithOutsideButton()`; a spy `onChoose`; a runner
`new Dialogue({script: {start: {text: 'Q', choices: [{text: 'Yes', onChoose}, {text: 'No'}]}}, context: {}})`;
a box from `createBox({onChooseTap: (index) => { dialogue.choose(index); }})`.
`box.resize(10, 100)`, `ui.addOverlay(box)`, `box.showNode({page: dialogue.pageText})`,
`dialogue.advance()`, then
`box.setChoices(dialogue.visibleChoices.map((choice) => choice.text), dialogue.selectedIndex)` and
`ui.activate()`. Expect `onChoose` called once and `dialogue.phase` to be `'ended'`.

Run: `cd packages/tellurion && npx vitest run --project browser tests/DialogueBox.browser.test.ts`
Expected: FAIL on the new test only (the spy is called 0 times).

- [ ] **Step 4: Implement**

`DialogueScript.ts`: the field as in Global Constraints.

`Dialogue.ts`: in `choose()`, the call as in Global Constraints. The method's doc comment stays.

- [ ] **Step 5: Run the engine's tests and typecheck**

Run:
`cd packages/tellurion && npx vitest run --project unit tests/Dialogue.test.ts tests/dialogueScript.test.ts && npx vitest run --project browser tests/DialogueBox.browser.test.ts && npx tsc --project tsconfig.typecheck.json`
Expected: all PASS, typecheck exits 0.

- [ ] **Step 6: Run the three packages**

Run (from the repository root):
`npx turbo run typecheck lint test --filter=tellurion --filter=somewhere --filter=foam --concurrency=1`
Expected: every task succeeds; lint reports 0 errors (known warnings may print). Turbo builds
Tellurion first, so Somewhere and Foam typecheck against the new type.

Then: `git diff --stat -- apps/` prints nothing.

- [ ] **Step 7: Commit**

```bash
git add packages/tellurion/source/dialogue/DialogueScript.ts packages/tellurion/source/dialogue/Dialogue.ts \
  packages/tellurion/tests/Dialogue.test.ts packages/tellurion/tests/dialogueScript.test.ts \
  packages/tellurion/tests/DialogueBox.browser.test.ts
git commit -m "Let a dialogue choice carry an effect"
```
