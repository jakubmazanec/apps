# Dialogue next as a function: design

Date: 2026-10-08. Package: `packages/tellurion`. Status: designed. It is the first of phase 5's four
specs in Foam's [direction document](../../../apps/foam/docs/direction.md).

## Background

A dialogue script has three places that read the context. A script's `start` may be a function of
the context that returns a node or an id. A node's `text` may be a function of the context that
returns its pages. A choice's `isVisible` is a function of the context, evaluated once when its node
is entered. Where the dialogue goes after a node or a choice is not one of them: a node's `next` and
a choice's `next` are a node or an id, fixed when the script is written.

```ts
export type DialogueChoice<TContext, TNodeId extends string> = {
  text: string;
  next?: DialogueNode<TContext, TNodeId> | TNodeId; // absent = choosing ends the dialogue
  isVisible?: (context: TContext) => boolean; // evaluated once on node entry
  onChoose?: (context: TContext) => void; // effects; runs when taken, before next is followed
};

export type DialogueNode<TContext, TNodeId extends string> = {
  speaker?: string;
  portrait?: string;
  text: string[] | ((context: TContext) => string[] | string) | string;
  choices?: Array<DialogueChoice<TContext, TNodeId>>;
  next?: DialogueNode<TContext, TNodeId> | TNodeId; // absent + no choices = dialogue ends
  onEnter?: (context: TContext) => void;
};
```

Foam's rules of the night need the dialogue to go one way or another on the player's state. A choice
that rolls dice leads to the node of success or the node of failure. A choice that depends on how
drunk the player is leads to one node or another. A text can branch after its last page. With a
fixed `next`, each of these is two choices with the same text and complementary `isVisible`, and a
roll has to be made when the node is entered, before the press, so that both `isVisible` tests read
it.

The [choice effect spec](2026-10-06-dialogue-choice-effect-design.md) rejected "a function as a
choice's `next`" because "it mixes where the dialogue goes with what happens": a function `next` was
then the proposed way to give a choice an effect. That spec gave choices `onChoose` for effects. A
function `next` that reads the context and returns where to go does routing only, and the spec's
invariant that `next` alone decides where the dialogue goes still holds.

`Dialogue.#enterNode()` is the one place that resolves a `next`: `advance()` passes it a node's
`next` and `choose()` a choice's.

## Decisions

- A choice's `next` and a node's `next` may be a function of the context that returns a node or an
  id, as `start` may be.
- The runner evaluates it once each time it is followed, with the context only: no node, no index.
- It does routing only. A roll or a change of state happens in `onChoose` or `onEnter`, is written
  into the context, and `next` reads it there.
- It cannot end the dialogue: it returns a node or an id, never nothing. A choice that may end or go
  on ends through a node of text.
- The order on a choice is the choice's `onChoose`, then its `next` with the context, then the next
  node's `onEnter`, then the next node's text. The order on a node is its last page, then its `next`
  with the context, then the next node's `onEnter`.
- It is optional. A script with fixed references behaves as before.

Rejected:

- **A function `next` that may return `undefined` to end the dialogue.** A choice would then end the
  dialogue in two ways, through an absent `next` and through a function's answer, and a node reached
  by a function could end a dialogue that reads as if it went on.
- **A function `next` that is given the choice or its index.** `onChoose`, `onEnter` and `isVisible`
  receive the context only. What a function needs to decide is in the context.
- **Resolving a function `next` when the node is entered, as `isVisible` is.** A roll made in
  `onChoose` would not be read. The function runs when it is followed.
- **Pairs of choices with complementary `isVisible`, with no engine change.** The author writes
  every branching choice twice, and a roll is made before the press rather than on it.

## Engine

### `source/dialogue/DialogueScript.ts`

One alias names a reference to a node, and both `next` fields and `start` are declared through it.
`start`'s type does not change.

```ts
/** Where a dialogue goes: a node, an id, or a function of the context that returns either. */
export type DialogueReference<TContext, TNodeId extends string> =
  | DialogueNode<TContext, TNodeId>
  | TNodeId
  | ((context: TContext) => DialogueNode<TContext, TNodeId> | TNodeId);

export type DialogueChoice<TContext, TNodeId extends string> = {
  text: string;
  next?: DialogueReference<TContext, TNodeId>; // absent = choosing ends the dialogue; evaluated when followed
  isVisible?: (context: TContext) => boolean; // evaluated once on node entry
  onChoose?: (context: TContext) => void; // effects; runs when taken, before next is followed
};

export type DialogueNode<TContext, TNodeId extends string> = {
  speaker?: string;
  portrait?: string;
  text: string[] | ((context: TContext) => string[] | string) | string;
  choices?: Array<DialogueChoice<TContext, TNodeId>>;
  next?: DialogueReference<TContext, TNodeId>; // absent + no choices = dialogue ends; evaluated when followed
  onEnter?: (context: TContext) => void;
};

export type DialogueScript<TContext, TNodeId extends string> = {
  start: DialogueReference<TContext, TNodeId>;
  nodes?: Record<TNodeId, DialogueNode<TContext, TNodeId>>;
};
```

`defineDialogueScript` does not change. Its `start` and its nodes are typed with `NoInfer<TNodeId>`
in every reference position already, and a `next` inside a node takes its type from `DialogueNode`,
so a function that returns a dangling id errors at the function's literal, as a dangling id does.

### `source/dialogue/Dialogue.ts`

`RunnableDialogueScript` declares its `start` through the alias with `string` as the id type; its
type does not change. `#enterNode()` resolves a function before it looks the node up, and names the
id it looked for when none is found:

```ts
#enterNode(reference: DialogueReference<TContext, string>): void {
  let target = typeof reference === 'function' ? reference(this.#context) : reference;
  let node = typeof target === 'string' ? this.#script.nodes?.[target] : target;

  if (node === undefined) {
    failUnsupported(`Dialogue node "${String(target)}" wasn't found in the script!`);
    this.#end();

    return;
  }

  // as before
}
```

`advance()` and `choose()` do not change: they pass a node's `next` and a choice's `next` through as
they do today. The DEV check that a node cannot carry both `choices` and `next` holds for a function
`next` as well: it is a `next` that is not `undefined`.

### Behaviour

| Case                                                              | Result                                                                                                    |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| A choice's `next` is a function                                   | After `onChoose`, it is called once with the context, and its result is entered: `onEnter`, then the text |
| A node's `next` is a function                                     | When the last page is advanced past, it is called once with the context, and its result is entered        |
| The function returns an inline node                               | The node is entered                                                                                       |
| The function returns an id the script does not have               | The dangling-id DEV failure, as for a fixed id; the message names the id returned                         |
| The function throws                                               | The error reaches the caller of `choose()` or `advance()`; the runner stays on its node and in its phase  |
| A choice's function throws                                        | As above, after its `onChoose` has run                                                                    |
| `next` is a node or an id                                         | As before                                                                                                 |
| The same function `next` is followed again on a later visit       | It runs again and may return something else                                                               |
| The function changes the context                                  | Nothing stops it, but it is routing only by convention; `onChoose` and `onEnter` are where effects belong |
| The next node's `isVisible` and `text` read what `onChoose` wrote | As before: they run on that node's entry, after `onChoose` and after `next`                               |

## Games

- **Somewhere.** Its scripts use fixed ids and inline nodes. No file under `apps/somewhere` changes.
- **Foam.** Its checker (`core/checkContent.ts`) follows a `next` only when it is an object, so a
  function `next` compiles and is passed over. The second spec of phase 5 teaches the checker to
  call a function `next` with its check nights and follow what it returns, and gives Foam's content
  its dice and conditions through this addition. No file under `apps/foam` changes here.

## Invariants

1. Where the dialogue goes after a node or a choice is decided by `next` alone. A function `next`
   decides it by reading the context.
2. A node's effects are its `onEnter`, and a choice's effects are its `onChoose`. A function `next`
   has none of its own.
3. A function `next` runs once each time it is followed, after the choice's `onChoose` and before
   the next node's `onEnter`.
4. The runner stays a plain class without a view.

## Sequencing

1. Tests: add the tests listed below, and see them fail.
2. `DialogueScript.ts`: the alias and the two fields.
3. `Dialogue.ts`: the resolution in `#enterNode()`.

## Tests and verification

`packages/tellurion/tests/Dialogue.test.ts`:

- In "Dialogue tick and advance", new: `advance` past the last page follows a function `next`,
  called once with the context, by id and by inline node.
- In "Dialogue choices", new: `choose` follows a function `next`, called once with the context,
  after the choice's `onChoose` and before the next node's `onEnter`. The test records the order of
  the three calls.
- In "Dialogue choices", new: a function `next` followed again on a later visit runs again and is
  followed to what it returns this time.
- In "Dialogue choices", new: when a choice's function `next` throws, the error reaches the caller,
  `onChoose` has run, and the runner is still choosing on the same node.
- In "Dialogue DEV invariants", new: a function `next` returning a dangling id throws, and the
  message names that id.

`packages/tellurion/tests/dialogueScript.test.ts`:

- The typed script of the first test gains a choice whose `next` is a function of the context that
  returns an id, and a node whose `next` is such a function, so the parameter's type is checked as
  the context and the return as an id of the script.
- In "dangling references are compile errors", a new fixture: a function `next` that returns a
  dangling id errors at the function, with `@ts-expect-error`.

`packages/tellurion/tests/DialogueBox.browser.test.ts`:

- New: confirming a choice in the box whose `next` is a function enters the node it returns. This
  holds the path from the box to the runner.

Run from the repository root:

```sh
npx turbo run typecheck lint test --filter=tellurion --filter=somewhere --filter=foam --concurrency=1
```

It must pass for all three packages: Somewhere and Foam read the engine's build.

## Non-goals

- A function `next` that ends the dialogue.
- A choice shown as unavailable, and a choice label computed from the context. Foam draws its own
  choice buttons from the choice objects, so its second phase 5 spec does both in Foam.
- Any change to `onChoose`, `onEnter`, to when `isVisible` runs, or to `DialogueBox`.
- Any change under `apps/somewhere` or `apps/foam`.
