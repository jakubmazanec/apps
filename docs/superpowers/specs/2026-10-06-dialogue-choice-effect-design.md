# Dialogue choice effect: design

Date: 2026-10-06. Package: `packages/tellurion`. Status: designed.

## Background

A dialogue script has one place for effects: a node's `onEnter`, which the runner calls with the
context when it enters the node. A choice has a text, a next node and a visibility test:

```ts
export type DialogueChoice<TContext, TNodeId extends string> = {
  text: string;
  next?: DialogueNode<TContext, TNodeId> | TNodeId; // absent = choosing ends the dialogue
  isVisible?: (context: TContext) => boolean; // evaluated once on node entry
};
```

So a game that wants something to happen when the player takes a choice has to lead the choice to a
node and put the effect into that node's `onEnter`. A node must have text: the runner ends the
dialogue with an error when a node has no page. Two things follow:

- A choice that has an effect and ends the dialogue needs an invented node of text. The player reads
  it and presses once more before the dialogue ends.
- The effect of a choice is written away from the choice, in the node it leads to.

Foam meets this in its ways out. A place's door offers "Walk", "Take the tram", "Take a taxi" and
"Stay". Taking a way has to open Foam's travel window at once. Without an effect on the choice,
every way out carries three filler nodes, and every move costs the player one more line and one more
press.

`Dialogue.choose()` is the one method that takes a choice. `advance()` calls it while the runner is
choosing, and Tellurion's `DialogueBox` and Foam's story window both go through these two methods.

## Decisions

- A choice may carry `onChoose`, a function of the context that returns nothing, as a node's
  `onEnter` is.
- The runner calls it once each time the choice is taken, before it follows the choice's `next` or
  ends the dialogue. With a `next`, the order is: the choice's `onChoose`, the next node's
  `onEnter`, the next node's text.
- It is optional. A script without it behaves as before.
- It receives the context only, as `onEnter` and `isVisible` do: no node, no index.
- It cannot stop the choice or send the dialogue elsewhere. Where the dialogue goes stays in `next`.

Rejected:

- **A node without text that the runner passes through.** It changes the rule that a node has at
  least one page, and it needs answers for a pass-through node with choices and for a chain of such
  nodes.
- **A function as a choice's `next`.** It mixes where the dialogue goes with what happens. A script
  reads less plainly when one field does both.
- **A return value that redirects or cancels the choice.** No game needs it, and it gives a choice
  two places that decide its next node.
- **An option on `Dialogue` that the instance calls with the taken choice.** The owner would have to
  map each choice back to what it means. Effects are declared in the script, next to what causes
  them, as `onEnter` is.

## Engine

### `source/dialogue/DialogueScript.ts`

`DialogueChoice` gains one optional field:

```ts
export type DialogueChoice<TContext, TNodeId extends string> = {
  text: string;
  next?: DialogueNode<TContext, TNodeId> | TNodeId; // absent = choosing ends the dialogue
  isVisible?: (context: TContext) => boolean; // evaluated once on node entry
  onChoose?: (context: TContext) => void; // effects; runs when taken, before next is followed
};
```

`defineDialogueScript` does not change: it takes its choices through this type.

### `source/dialogue/Dialogue.ts`

`choose()` calls the function before it leaves the node:

```ts
/** Confirm a choice directly (pointer tap); indices address visibleChoices. */
choose(index: number): void {
  if (!this.#isValidChoiceIndex(index)) {
    return;
  }

  let choice = this.#visibleChoices[index];

  if (choice === undefined) {
    return;
  }

  choice.onChoose?.(this.#context);

  if (choice.next === undefined) {
    this.#end();
  } else {
    this.#enterNode(choice.next);
  }
}
```

Nothing else in the runner changes. `advance()` already calls `choose()` while the runner is
choosing.

### Behaviour

| Case                                                 | Result                                                                               |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------ |
| The choice has `onChoose` and a `next`               | `onChoose` runs, then the next node is entered: its `onEnter`, then its text         |
| The choice has `onChoose` and no `next`              | `onChoose` runs, then the dialogue ends                                              |
| The choice has no `onChoose`                         | As before                                                                            |
| `choose()` with an index out of bounds               | Nothing runs                                                                         |
| `choose()` while the runner is not choosing          | Nothing runs                                                                         |
| A choice that `isVisible` filtered out               | It cannot be taken, so its `onChoose` never runs                                     |
| The choice is taken with `advance()`                 | The same as `choose()` with the selected index                                       |
| The same choice is taken again on a later visit      | `onChoose` runs again                                                                |
| `onChoose` changes what the next node's choices read | Their `isVisible` runs on that node's entry, after `onChoose`, and sees the change   |
| `onChoose` throws                                    | The error reaches the caller of `choose()` or `advance()`; the runner stays choosing |

## Games

- **Somewhere.** None of its scripts sets `onChoose`. No file under `apps/somewhere` changes.
- **Foam.** Its ways out set it: a choice of a way of travelling records that way in the night's
  state and ends the dialogue. That belongs to Foam's own spec,
  [places and travel](../../../apps/foam/docs/superpowers/specs/2026-10-06-places-and-travel-design.md).
  No file under `apps/foam` changes here.

## Invariants

1. A node's effects are its `onEnter`, and a choice's effects are its `onChoose`. Both receive the
   context and return nothing.
2. `onChoose` runs once each time its choice is taken, before the runner leaves the node.
3. Where the dialogue goes after a choice is decided by `next` alone.
4. The runner stays a plain class without a view.

## Sequencing

1. Tests: add the tests listed below, and see them fail.
2. `DialogueScript.ts`: the optional field.
3. `Dialogue.ts`: the call in `choose()`.

## Tests and verification

`packages/tellurion/tests/Dialogue.test.ts`, in "Dialogue choices":

- New: `choose` calls the choice's `onChoose` once with the context, before the next node's
  `onEnter`. The test records the order of the two calls.
- New: a choice with `onChoose` and no `next` runs it and ends the dialogue.
- New: `advance` while choosing runs the selected choice's `onChoose`.
- New: `choose` with an index out of bounds, and `choose` while the runner is revealing, run no
  `onChoose`.
- New: when `onChoose` throws, the error reaches the caller and the runner is still choosing.

`packages/tellurion/tests/dialogueScript.test.ts`:

- The typed script of the first test gains a choice with `onChoose` that writes to the context, so
  the parameter's type is checked as the context.

`packages/tellurion/tests/DialogueBox.browser.test.ts`:

- New: confirming a choice in the box runs its `onChoose`. This holds the path from the box to the
  runner.

Run from the repository root:

```sh
npx turbo run typecheck lint test --filter=tellurion --filter=somewhere --filter=foam --concurrency=1
```

It must pass for all three packages: Somewhere and Foam read the engine's build.

## Non-goals

- A choice that is shown as unavailable, and a choice label computed from the context. Foam's rules
  of the night will ask for both; they get a spec of their own.
- A node without text, and a function as a choice's `next`.
- Any change to `onEnter`, to when `isVisible` runs, or to `DialogueBox`.
- Any change under `apps/somewhere` or `apps/foam`.
