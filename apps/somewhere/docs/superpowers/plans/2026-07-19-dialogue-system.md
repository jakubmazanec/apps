# Dialogue System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** World-owned typewriter dialogue boxes with portraits, speaker names, branching choices, a TypeScript authoring format, one NPC (Mira), a sign zone and dialogue flags persisted through the save blob, per `docs/superpowers/specs/2026-07-19-dialogue-system-design.md`.

**Architecture:** The engine ships a layout-blind runner (`Dialogue`), the authoring types (`DialogueScript`) and the display widget (`DialogueBox`); it has no channel, no `Input` reference and no action names. All ECS state and policy are game code: a singleton `DialogueComponent` entity, a game-owned `DialogueCommand` channel with exactly one deciding consumer (`dialogueSystem`), an input translator (`dialogueInputSystem`) and a render system (`dialogueBoxSystem`) that owns a screen-fixed layer above the map inside `World.view`. Dialogue runs on world time, so the pause menu freezes it for free.

**Tech Stack:** TypeScript 5.9.2 (strict, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`), pixi.js 8, @pixi/layout 3.2.0, zod 4, vitest 4 (happy-dom), no new dependencies.

## Global Constraints

- Run every command from `D:\projects\apps\apps\somewhere` (the app package root; npm workspace hoists `node_modules` to the repo root).
- Engine code (`source/engine/**`) must never import game code (`source/game/**`); the reverse is fine.
- JS private fields (`#name`), never `_name` or TS `private`.
- Composition only: flat classes owning a `view`, `System`/`Entity`/`EntityQuery` instances; no inheritance hierarchies.
- Constructor injection with a single options object (`new X({...})`); no factory wrappers, no positional args.
- Locals use `let` (the codebase style); module constants use `const` with UPPER_CASE only for true constants.
- `exactOptionalPropertyTypes` is on: producers omit optional fields instead of passing `undefined`, and optional fields that receive an explicit `undefined` must be typed `| undefined`.
- Bitmap fonts render at native size 12 only (`monogram`, `monogram-outline`); never below native.
- Comments: keep all existing comments; world.ts ordering comments are load-bearing convention. Avoid em-dashes in new comments; prefer semicolons, colons and commas.
- DEV-throw / prod-warn uses `failUnsupported` (`source/engine/utilities/failUnsupported.ts`); vitest runs with `import.meta.env.DEV` true, so DEV-throws are testable with `expect(...).toThrow()`.
- Test commands: `npx vitest run tests/<file>.test.ts` per file, `npm test` for the full suite, `npm run typecheck`, `npm run lint`. If lint flags import order, run `npx eslint --fix <files>`.
- Commit messages are plain imperative sentences (repo style, e.g. "Add the dialogue runner"), no conventional-commit prefixes.
- One dialogue at a time: `DialogueComponent.active: Dialogue | null` on a singleton entity; component sets stay fixed at construction, so start assigns `active` and end clears it.

## Design decisions locked into this plan

These interpret or refine the spec where it is silent; they are final for this plan:

- `DialogueBox.showNode` takes the current page (`page: string`), not the whole page array; the owner calls `showNode` again on page turns. This is what makes "showNode and setChoices are called only on node or page change" coherent with `setRevealed` counting characters of the runner's current `pageText`.
- The runner drops the `TNodeId` type parameter at runtime: `Dialogue<TContext>` accepts any `RunnableDialogueScript<TContext>` (node ids as plain strings). Compile-time id safety lives entirely in `defineDialogueScript`; this also makes every authored script assignable to `Dialogue<Flags>` regardless of its id union.
- `DialogueBox` takes an optional `measure?: (text: string) => number` (art-px string width), defaulting to `pixi.BitmapFontManager.measureText` over the injected font. Tests inject a fixed-width fake; this is the injection point the spec's "fake measurer" tests require.
- `DialogueBox` exposes a read-only `isCollapsed` getter so tests and consumers can observe the collapsed layout without walking the view tree.
- Choice hover uses `button.view.on('pointerover', ...)`; `Button` has no hover callback option and adding one is out of scope.
- Blip policy in `dialogueBoxSystem`: one `PlaySound({name: 'blip'})` per third newly revealed non-space glyph; a frame that reveals 4+ characters is an advance-skip and plays at most one blip. Spaces and injected newlines never count.
- Portrait, NPC and prompt-bubble art are generated placeholders (`scripts/generate-dialogue-assets.mjs`, the `generate-spark-assets.mjs` precedent) so the demo is fully buildable; hand-authored art can overwrite the same `public/` files later without code changes.
- The demo scripts live in `source/game/dialogueRegistry.ts` together with the registry record (one file for authored dialogue content).

## File structure

Create (engine):
- `source/engine/dialogue/DialogueScript.ts` - authoring types + `defineDialogueScript`
- `source/engine/dialogue/Dialogue.ts` - the runner (no pixi, no world)
- `source/engine/dialogue/wrapText.ts` - pure length-preserving wrapper
- `source/engine/dialogue/DialogueBox.ts` - the widget (Modal idiom, composed from Panel/Button/Text)

Create (game):
- `source/game/flags.ts` - typed mutable flags object + reset
- `source/game/DialogueComponent.ts`, `source/game/dialogueQuery.ts`, `source/game/dialogue.ts` - singleton component, query, entity
- `source/game/DialogueCommand.ts`, `source/game/dialogueCommandChannel.ts` - command event + channel
- `source/game/dialogueRegistry.ts` - Mira + sign scripts, registry record
- `source/game/dialogueSystem.ts` - the one deciding consumer
- `source/game/dialogueInputSystem.ts` - action edges to commands
- `source/game/dialogueBoxSystem.ts` - render layer, box sync, prompt bubble, blips

Modify (game):
- `source/game/input.ts` - `interact: {keys: ['KeyE']}`
- `source/game/playerSystem.ts` - movement lock (one early return)
- `source/game/objectFactories.ts` - `npc` factory
- `source/game/save.ts` - `flags` schema field
- `source/game/world.ts` - ordering, registration, flags reset, `active` clear
- `source/game/assets.ts` - new spritesheets and blip sound

Modify (assets):
- `scripts/generate-ui-atlas.mjs` - `advance-marker` frame
- `scripts/generate-placeholder-audio.mjs` - `blip.wav`
- `scripts/generate-dialogue-assets.mjs` (new) - portraits, npc, prompt-bubble sheets
- `assets/map.tmx` + re-export - Mira npc object, sign zone

Tests:
- `tests/dialogueScript.test.ts`, `tests/Dialogue.test.ts`, `tests/wrapText.test.ts`, `tests/DialogueBox.test.ts`
- `tests/flags.test.ts`, `tests/dialogueRegistry.test.ts`, `tests/dialogueSystem.test.ts`, `tests/dialogueInputSystem.test.ts`, `tests/dialogueBoxSystem.test.ts`
- Extend: `tests/playerSystem.test.ts`, `tests/objectFactories.test.ts`, `tests/save.test.ts`, `tests/worldSpawn.test.ts`

---

### Task 1: Authoring format (`DialogueScript.ts`)

**Files:**
- Create: `source/engine/dialogue/DialogueScript.ts`
- Test: `tests/dialogueScript.test.ts`

**Interfaces:**
- Consumes: nothing (pure types).
- Produces: `DialogueNode<TContext, TNodeId extends string>`, `DialogueChoice<TContext, TNodeId extends string>`, `DialogueScript<TContext, TNodeId extends string>`, `defineDialogueScript<TContext>(): <TNodeId>(script) => DialogueScript<TContext, TNodeId>`. Task 2's runner consumes `DialogueNode`/`DialogueChoice`; Task 5's registry consumes `defineDialogueScript`.

- [ ] **Step 1: Write the failing test**

Create `tests/dialogueScript.test.ts`. The runtime assertions are thin (the function is an identity); the file's real job is the committed type fixtures: dangling references must be compile errors (`@ts-expect-error`), valid fixtures must compile. `npm run typecheck` covers `tests/**` via `tests/tsconfig.json`.

```ts
import {describe, expect, test} from 'vitest';

import {defineDialogueScript} from '../source/engine/dialogue/DialogueScript.js';

type TestContext = {metMira: boolean};

describe('defineDialogueScript', () => {
  test('returns the script unchanged and keeps the node record typed', () => {
    let script = defineDialogueScript<TestContext>()({
      start: (context) => (context.metMira ? 'again' : 'greeting'),
      nodes: {
        greeting: {
          speaker: 'Mira',
          portrait: 'mira',
          text: 'Welcome to Somewhere.',
          choices: [
            {text: 'Sure, show me around.', next: 'tour'},
            {text: 'Maybe later.', next: {speaker: 'Mira', portrait: 'mira', text: 'Suit yourself.'}},
          ],
        },
        tour: {
          speaker: 'Mira',
          portrait: 'mira',
          text: ['This way.', 'Mind the well.'],
          next: 'goodbye',
        },
        again: {speaker: 'Mira', portrait: 'mira', text: 'Back already?', next: 'goodbye'},
        goodbye: {
          speaker: 'Mira',
          portrait: 'mira',
          text: 'Bye.',
          onEnter: (context) => {
            context.metMira = true;
          },
        },
      },
    });

    expect(script.nodes?.tour.next).toBe('goodbye');
    expect(typeof script.start).toBe('function');
  });

  test('inline-only scripts skip the node record', () => {
    let script = defineDialogueScript<TestContext>()({start: {text: 'KEEP OUT.'}});

    expect(script.nodes).toBeUndefined();
  });

  test('dangling references are compile errors, not runtime errors', () => {
    // The fixtures below exist for the @ts-expect-error assertions; the
    // function itself never validates at runtime.
    let dangling = defineDialogueScript<TestContext>()({
      start: 'greeting',
      nodes: {
        greeting: {
          text: 'hi',
          // @ts-expect-error -- a dangling `next` errors at the offending literal, not on the valid nodes
          next: 'missing',
        },
      },
    });

    let danglingStart = defineDialogueScript<TestContext>()({
      // @ts-expect-error -- a dangling `start` id errors here
      start: 'missing',
      nodes: {greeting: {text: 'hi'}},
    });

    expect(dangling.start).toBe('greeting');
    expect(danglingStart.nodes?.greeting.text).toBe('hi');
  });

  test('inline nodes recurse with the same id union', () => {
    let script = defineDialogueScript<TestContext>()({
      start: 'a',
      nodes: {
        a: {
          text: 'x',
          next: {
            text: 'inline',
            // @ts-expect-error -- string references inside inline nodes are checked too
            next: 'missing',
          },
        },
      },
    });

    expect(script.start).toBe('a');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/dialogueScript.test.ts`
Expected: FAIL - cannot resolve `../source/engine/dialogue/DialogueScript.js`.

- [ ] **Step 3: Write the implementation**

Create `source/engine/dialogue/DialogueScript.ts`:

```ts
export type DialogueChoice<TContext, TNodeId extends string> = {
  text: string;
  next?: TNodeId | DialogueNode<TContext, TNodeId>; // absent = choosing ends the dialogue
  isVisible?: (context: TContext) => boolean; // evaluated once on node entry
};

export type DialogueNode<TContext, TNodeId extends string> = {
  speaker?: string; // name label; omitted = no label (signs, narration)
  portrait?: string; // game-resolved texture name; omitted = collapsed portrait panel
  // One page or several; a function is evaluated once on node entry, after onEnter.
  text: string | string[] | ((context: TContext) => string | string[]);
  choices?: Array<DialogueChoice<TContext, TNodeId>>; // a node with both choices and next DEV-throws
  next?: TNodeId | DialogueNode<TContext, TNodeId>; // absent + no choices = dialogue ends
  onEnter?: (context: TContext) => void; // effects: set flags, give items
};

export type DialogueScript<TContext, TNodeId extends string> = {
  start:
    | TNodeId
    | DialogueNode<TContext, TNodeId>
    | ((context: TContext) => TNodeId | DialogueNode<TContext, TNodeId>);
  nodes?: Record<TNodeId, DialogueNode<TContext, TNodeId>>; // optional: inline-only scripts skip it
};

/**
 * Curried so the node record infers while the context type stays explicit (the
 * defineComponent/defineEvent precedent; there is no context value to infer
 * from). TNodeId's only inference site is the `nodes` keys; every reference
 * position is wrapped in NoInfer so a dangling id errors at the offending
 * literal instead of widening the union. There is no runtime graph validator;
 * the committed type fixtures in tests/dialogueScript.test.ts hold the
 * guarantee.
 */
export function defineDialogueScript<TContext>() {
  return function <TNodeId extends string>(script: {
    start:
      | NoInfer<TNodeId>
      | DialogueNode<TContext, NoInfer<TNodeId>>
      | ((context: TContext) => NoInfer<TNodeId> | DialogueNode<TContext, NoInfer<TNodeId>>);
    nodes?: Record<TNodeId, DialogueNode<TContext, NoInfer<TNodeId>>>;
  }): DialogueScript<TContext, TNodeId> {
    return script;
  };
}
```

- [ ] **Step 4: Run the test and typecheck to verify they pass**

Run: `npx vitest run tests/dialogueScript.test.ts && npm run typecheck`
Expected: PASS, typecheck clean. If an `@ts-expect-error` line reports "Unused '@ts-expect-error' directive", the NoInfer wiring is wrong; fix the implementation, not the fixture.

- [ ] **Step 5: Commit**

```powershell
git add source/engine/dialogue/DialogueScript.ts tests/dialogueScript.test.ts
git commit -m "Add the dialogue authoring format"
```

### Task 2: The runner (`Dialogue.ts`)

**Files:**
- Create: `source/engine/dialogue/Dialogue.ts`
- Test: `tests/Dialogue.test.ts`

**Interfaces:**
- Consumes: `DialogueNode`, `DialogueChoice` from Task 1; `failUnsupported` from `source/engine/utilities/failUnsupported.ts`.
- Produces: `class Dialogue<TContext = unknown>` with `new Dialogue({script: RunnableDialogueScript<TContext>, context: TContext, revealSpeed?: number})`; read-only getters `phase: 'choosing' | 'ended' | 'idle' | 'revealing'`, `node: DialogueNode<TContext, string> | null`, `pageIndex: number`, `pageText: string`, `revealedCount: number`, `visibleChoices: ReadonlyArray<DialogueChoice<TContext, string>>`, `selectedIndex: number`; methods `tick(deltaMS: number): void`, `advance(): void`, `moveSelection(delta: number): void`, `select(index: number): void`, `choose(index: number): void`, `setBreaks(offsets: readonly number[]): void`. Also exports `type RunnableDialogueScript<TContext>` and `type DialoguePhase`. Tasks 3-9 rely on these exact names.

- [ ] **Step 1: Write the failing test**

Create `tests/Dialogue.test.ts`:

```ts
import {describe, expect, test, vi} from 'vitest';

import {Dialogue} from '../source/engine/dialogue/Dialogue.js';

type TestContext = {calls: string[]; metMira: boolean};

function createContext(): TestContext {
  return {calls: [], metMira: false};
}

describe('Dialogue node entry', () => {
  test('enters the start node revealing from zero', () => {
    let dialogue = new Dialogue({script: {start: {text: 'Hello.'}}, context: createContext()});

    expect(dialogue.phase).toBe('revealing');
    expect(dialogue.pageText).toBe('Hello.');
    expect(dialogue.pageIndex).toBe(0);
    expect(dialogue.revealedCount).toBe(0);
  });

  test('a callable start resolves against the context', () => {
    let dialogue = new Dialogue({
      script: {
        start: (context: TestContext) => (context.metMira ? 'again' : 'greeting'),
        nodes: {greeting: {text: 'First time.'}, again: {text: 'Back already?'}},
      },
      context: {...createContext(), metMira: true},
    });

    expect(dialogue.pageText).toBe('Back already?');
  });

  test('node entry runs onEnter, then the text function, then isVisible, each once', () => {
    let context = createContext();

    void new Dialogue({
      script: {
        start: {
          onEnter: (c: TestContext) => {
            c.calls.push('onEnter');
          },
          text: (c: TestContext) => {
            c.calls.push('text');

            return 'Hi.';
          },
          choices: [
            {
              text: 'Ok',
              isVisible: (c: TestContext) => {
                c.calls.push('isVisible');

                return true;
              },
            },
          ],
        },
      },
      context,
    });

    expect(context.calls).toEqual(['onEnter', 'text', 'isVisible']);
  });
});

describe('Dialogue tick and advance', () => {
  test('tick accumulates fractional characters at revealSpeed per second', () => {
    let dialogue = new Dialogue({
      script: {start: {text: 'abcdef'}},
      context: createContext(),
      revealSpeed: 10,
    });

    dialogue.tick(50); // 0.5 characters: nothing visible yet
    expect(dialogue.revealedCount).toBe(0);

    dialogue.tick(50); // 1.0 accumulated
    expect(dialogue.revealedCount).toBe(1);

    dialogue.tick(500); // +5, page complete
    expect(dialogue.revealedCount).toBe(6);
    expect(dialogue.phase).toBe('idle');
  });

  test('the fully revealed last page of a node with visible choices becomes choosing', () => {
    let dialogue = new Dialogue({
      script: {start: {text: 'Hi.', choices: [{text: 'A'}, {text: 'B'}]}},
      context: createContext(),
    });

    dialogue.tick(1000);

    expect(dialogue.phase).toBe('choosing');
    expect(dialogue.visibleChoices).toHaveLength(2);
    expect(dialogue.selectedIndex).toBe(0);
  });

  test('advance while revealing skips to the stop and enters the same phase a tick would', () => {
    let plain = new Dialogue({script: {start: {text: 'abcdef'}}, context: createContext()});

    plain.advance();
    expect(plain.revealedCount).toBe(6);
    expect(plain.phase).toBe('idle');

    let choosing = new Dialogue({
      script: {start: {text: 'Hi.', choices: [{text: 'A'}]}},
      context: createContext(),
    });

    choosing.advance();
    expect(choosing.phase).toBe('choosing');
  });

  test('string[] pages turn on advance and end after the last one', () => {
    let dialogue = new Dialogue({
      script: {start: {text: ['One.', 'Two.']}},
      context: createContext(),
    });

    dialogue.advance(); // skip page 0
    expect(dialogue.phase).toBe('idle');

    dialogue.advance(); // page turn
    expect(dialogue.pageIndex).toBe(1);
    expect(dialogue.pageText).toBe('Two.');
    expect(dialogue.phase).toBe('revealing');
    expect(dialogue.revealedCount).toBe(0);

    dialogue.advance(); // skip page 1
    dialogue.advance(); // no next, no choices: ends
    expect(dialogue.phase).toBe('ended');
  });

  test('advance follows next by id and by inline node', () => {
    let dialogue = new Dialogue({
      script: {
        start: 'a',
        nodes: {a: {text: 'A', next: {text: 'B', next: 'c'}}, c: {text: 'C'}},
      },
      context: createContext(),
    });

    dialogue.advance();
    dialogue.advance();
    expect(dialogue.pageText).toBe('B');

    dialogue.advance();
    dialogue.advance();
    expect(dialogue.pageText).toBe('C');
  });
});

describe('Dialogue breaks', () => {
  test('the reveal pauses at breaks, advance resumes inside the page', () => {
    let dialogue = new Dialogue({
      script: {start: {text: 'abcdefgh'}},
      context: createContext(),
      revealSpeed: 1000,
    });

    dialogue.setBreaks([3, 6]);
    dialogue.tick(1000);
    expect(dialogue.revealedCount).toBe(3);
    expect(dialogue.phase).toBe('idle');

    dialogue.advance(); // resume, not page turn
    expect(dialogue.phase).toBe('revealing');
    dialogue.tick(1000);
    expect(dialogue.revealedCount).toBe(6);

    dialogue.advance();
    dialogue.tick(1000);
    expect(dialogue.revealedCount).toBe(8);
    expect(dialogue.phase).toBe('idle');
  });

  test('advance while revealing completes only the current stretch', () => {
    let dialogue = new Dialogue({script: {start: {text: 'abcdefgh'}}, context: createContext()});

    dialogue.setBreaks([3]);
    dialogue.advance();
    expect(dialogue.revealedCount).toBe(3);
    expect(dialogue.phase).toBe('idle');
  });

  test('offsets at or before revealedCount are ignored', () => {
    let dialogue = new Dialogue({
      script: {start: {text: 'abcdefgh'}},
      context: createContext(),
      revealSpeed: 1000,
    });

    dialogue.setBreaks([5]);
    dialogue.tick(1000); // paused at 5
    dialogue.advance(); // resume
    dialogue.setBreaks([3, 5, 7]); // 3 and 5 are stale, 7 holds
    dialogue.tick(1000);

    expect(dialogue.revealedCount).toBe(7);
    expect(dialogue.phase).toBe('idle');
  });

  test('breaks clear on a page turn', () => {
    let dialogue = new Dialogue({
      script: {start: {text: ['abcdef', 'ghijkl']}},
      context: createContext(),
      revealSpeed: 1000,
    });

    dialogue.setBreaks([3]);
    dialogue.advance(); // to 3
    dialogue.advance(); // resume
    dialogue.tick(1000); // page 0 complete
    dialogue.advance(); // page turn clears the breaks
    dialogue.tick(1000);

    expect(dialogue.revealedCount).toBe(6); // no pause at 3 on the new page
    expect(dialogue.phase).toBe('idle');
  });
});

describe('Dialogue choices', () => {
  test('moveSelection wraps in both directions', () => {
    let dialogue = new Dialogue({
      script: {start: {text: 'Q', choices: [{text: 'A'}, {text: 'B'}, {text: 'C'}]}},
      context: createContext(),
    });

    dialogue.advance();
    dialogue.moveSelection(-1);
    expect(dialogue.selectedIndex).toBe(2);

    dialogue.moveSelection(1);
    expect(dialogue.selectedIndex).toBe(0);
  });

  test('select sets the index only while choosing and in bounds', () => {
    let dialogue = new Dialogue({
      script: {start: {text: 'Q', choices: [{text: 'A'}, {text: 'B'}]}},
      context: createContext(),
    });

    dialogue.select(1); // still revealing: ignored
    expect(dialogue.selectedIndex).toBe(0);

    dialogue.advance();
    dialogue.select(1);
    expect(dialogue.selectedIndex).toBe(1);

    dialogue.select(5);
    dialogue.select(-1);
    expect(dialogue.selectedIndex).toBe(1);
  });

  test('choose follows the choice next and out-of-bounds is ignored', () => {
    let dialogue = new Dialogue({
      script: {
        start: 'q',
        nodes: {q: {text: 'Q', choices: [{text: 'A', next: 'a'}, {text: 'B'}]}, a: {text: 'Went A.'}},
      },
      context: createContext(),
    });

    dialogue.advance();
    dialogue.choose(5); // ignored
    expect(dialogue.phase).toBe('choosing');

    dialogue.choose(0);
    expect(dialogue.pageText).toBe('Went A.');
  });

  test('choosing a choice without next ends the dialogue', () => {
    let dialogue = new Dialogue({
      script: {start: {text: 'Q', choices: [{text: 'Bye'}]}},
      context: createContext(),
    });

    dialogue.advance();
    dialogue.advance(); // confirms the selected choice
    expect(dialogue.phase).toBe('ended');
  });

  test('isVisible filters once on entry and indices address visibleChoices', () => {
    let dialogue = new Dialogue({
      script: {
        start: 'q',
        nodes: {
          q: {
            text: 'Q',
            choices: [
              {text: 'Hidden', isVisible: () => false, next: 'wrong'},
              {text: 'Shown', next: 'right'},
            ],
          },
          wrong: {text: 'Wrong.'},
          right: {text: 'Right.'},
        },
      },
      context: createContext(),
    });

    dialogue.advance();
    expect(dialogue.visibleChoices).toHaveLength(1);
    expect(dialogue.visibleChoices[0]?.text).toBe('Shown');

    dialogue.choose(0);
    expect(dialogue.pageText).toBe('Right.');
  });

  test('a node whose choices all filter invisible is choice-less, with a DEV warning', () => {
    let warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    let dialogue = new Dialogue({
      script: {start: {text: 'Q', choices: [{text: 'A', isVisible: () => false}]}},
      context: createContext(),
    });

    expect(warn).toHaveBeenCalledTimes(1);

    dialogue.advance();
    expect(dialogue.phase).toBe('idle'); // not choosing

    dialogue.advance(); // no next: ends
    expect(dialogue.phase).toBe('ended');

    warn.mockRestore();
  });
});

describe('Dialogue termination and inertness', () => {
  test('ended is inert: every method is a no-op', () => {
    let dialogue = new Dialogue({script: {start: {text: 'x'}}, context: createContext()});

    dialogue.advance();
    dialogue.advance();
    expect(dialogue.phase).toBe('ended');

    dialogue.tick(1000);
    dialogue.advance();
    dialogue.moveSelection(1);
    dialogue.select(0);
    dialogue.choose(0);
    dialogue.setBreaks([1]);

    expect(dialogue.phase).toBe('ended');
    expect(dialogue.revealedCount).toBe(1);
  });
});

describe('Dialogue DEV invariants', () => {
  test('an empty page list throws on construction', () => {
    expect(
      () => new Dialogue({script: {start: {text: []}}, context: createContext()}),
    ).toThrow(/empty page list/);
  });

  test('an empty page list throws on every entry, not only at construction', () => {
    let dialogue = new Dialogue({
      script: {start: {text: 'ok', next: {text: []}}},
      context: createContext(),
    });

    dialogue.advance();
    expect(() => {
      dialogue.advance();
    }).toThrow(/empty page list/);
  });

  test('a node carrying both choices and next throws', () => {
    expect(
      () =>
        new Dialogue({
          script: {start: {text: 'x', choices: [{text: 'A'}], next: {text: 'y'}}},
          context: createContext(),
        }),
    ).toThrow(/both choices and next/);
  });

  test('a non-positive revealSpeed throws', () => {
    expect(
      () => new Dialogue({script: {start: {text: 'x'}}, context: createContext(), revealSpeed: 0}),
    ).toThrow(/revealSpeed/);
  });

  test('a dangling node id throws (untyped data escape hatch)', () => {
    expect(
      () => new Dialogue({script: {start: 'missing'}, context: createContext()}),
    ).toThrow(/wasn't found/);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/Dialogue.test.ts`
Expected: FAIL - cannot resolve `../source/engine/dialogue/Dialogue.js`.

- [ ] **Step 3: Write the implementation**

Create `source/engine/dialogue/Dialogue.ts`:

```ts
import {failUnsupported} from '../utilities/failUnsupported.js';
import {type DialogueChoice, type DialogueNode} from './DialogueScript.js';

/**
 * The runtime shape of an authored script. TNodeId is a compile-time guarantee
 * (defineDialogueScript); at runtime node ids are plain strings, and `nodes`
 * is read through an optional-key record so any authored
 * Record<'a' | 'b', ...> is assignable via its implicit index signature.
 */
export type RunnableDialogueScript<TContext> = {
  start:
    | string
    | DialogueNode<TContext, string>
    | ((context: TContext) => string | DialogueNode<TContext, string>);
  nodes?: Readonly<Partial<Record<string, DialogueNode<TContext, string>>>>;
};

export type DialoguePhase = 'choosing' | 'ended' | 'idle' | 'revealing';

export type DialogueOptions<TContext> = {
  script: RunnableDialogueScript<TContext>;
  context: TContext;
  /** Characters per second, > 0 (DEV-throw). */
  revealSpeed?: number;
};

const DEFAULT_REVEAL_SPEED = 40;

/**
 * The dialogue runner: a plain class, no pixi and no world dependency. The
 * owner ticks it on world time; setBreaks lets the owner window long pages
 * (the runner stays layout-blind, it only honors offsets).
 */
export class Dialogue<TContext = unknown> {
  readonly #script: RunnableDialogueScript<TContext>;
  readonly #context: TContext;
  readonly #revealSpeed: number;

  #phase: DialoguePhase = 'revealing';
  #node: DialogueNode<TContext, string> | null = null;
  #pages: string[] = [];
  #pageIndex = 0;
  #revealedCount = 0;
  #revealBudget = 0; // fractional characters carried between ticks
  #breaks: number[] = [];
  #visibleChoices: Array<DialogueChoice<TContext, string>> = [];
  #selectedIndex = 0;

  constructor({script, context, revealSpeed = DEFAULT_REVEAL_SPEED}: DialogueOptions<TContext>) {
    if (revealSpeed <= 0) {
      failUnsupported(
        `Dialogue revealSpeed must be > 0, got ${revealSpeed}! Falling back to ${DEFAULT_REVEAL_SPEED}.`,
      );
    }

    this.#script = script;
    this.#context = context;
    this.#revealSpeed = revealSpeed > 0 ? revealSpeed : DEFAULT_REVEAL_SPEED;

    let start = typeof script.start === 'function' ? script.start(context) : script.start;

    this.#enterNode(start);
  }

  get phase(): DialoguePhase {
    return this.#phase;
  }

  get node(): DialogueNode<TContext, string> | null {
    return this.#node;
  }

  get pageIndex(): number {
    return this.#pageIndex;
  }

  get pageText(): string {
    return this.#pages[this.#pageIndex] ?? '';
  }

  get revealedCount(): number {
    return this.#revealedCount;
  }

  get visibleChoices(): ReadonlyArray<DialogueChoice<TContext, string>> {
    return this.#visibleChoices;
  }

  get selectedIndex(): number {
    return this.#selectedIndex;
  }

  /** Advance the reveal on world time; a paused world simply stops calling this. */
  tick(deltaMS: number): void {
    if (this.#phase !== 'revealing') {
      return;
    }

    this.#revealBudget += (this.#revealSpeed * deltaMS) / 1000;

    let count = Math.floor(this.#revealBudget);

    if (count <= 0) {
      return;
    }

    this.#revealBudget -= count;

    let stop = this.#nextStop();

    this.#revealedCount = Math.min(this.#revealedCount + count, stop);

    if (this.#revealedCount >= stop) {
      this.#revealBudget = 0; // a pause discards the surplus; resume types from zero
      this.#pauseAtStop();
    }
  }

  /**
   * The one-button action: while revealing, completes the current stretch
   * instantly; while idle at a break, resumes; while idle at page end, shows
   * the next page, else follows next, else ends; while choosing, confirms the
   * selected choice.
   */
  advance(): void {
    if (this.#phase === 'revealing') {
      this.#revealedCount = this.#nextStop();
      this.#revealBudget = 0;
      this.#pauseAtStop();

      return;
    }

    if (this.#phase === 'idle') {
      if (this.#revealedCount < this.pageText.length) {
        this.#phase = 'revealing'; // resume from a break
      } else if (this.#pageIndex < this.#pages.length - 1) {
        this.#pageIndex += 1;
        this.#enterPage();
      } else if (this.#node?.next === undefined) {
        this.#end();
      } else {
        this.#enterNode(this.#node.next);
      }

      return;
    }

    if (this.#phase === 'choosing') {
      this.choose(this.#selectedIndex);
    }
  }

  /** Move the selection through visibleChoices, wrapping. */
  moveSelection(delta: number): void {
    let count = this.#visibleChoices.length;

    if (this.#phase !== 'choosing' || count === 0) {
      return;
    }

    this.#selectedIndex = (((this.#selectedIndex + delta) % count) + count) % count;
  }

  /** Set the selection directly (pointer hover); ignored unless choosing and valid. */
  select(index: number): void {
    if (!this.#isValidChoiceIndex(index)) {
      return;
    }

    this.#selectedIndex = index;
  }

  /** Confirm a choice directly (pointer tap); indices address visibleChoices. */
  choose(index: number): void {
    if (!this.#isValidChoiceIndex(index)) {
      return;
    }

    let choice = this.#visibleChoices[index];

    if (choice === undefined) {
      return;
    }

    if (choice.next === undefined) {
      this.#end();
    } else {
      this.#enterNode(choice.next);
    }
  }

  /**
   * Pause offsets inside the current page, ascending, in page-character
   * space. Offsets at or before revealedCount are ignored; node and page
   * changes clear them.
   */
  setBreaks(offsets: readonly number[]): void {
    if (this.#phase === 'ended') {
      return;
    }

    this.#breaks = offsets.filter((offset) => offset > this.#revealedCount);
  }

  #isValidChoiceIndex(index: number): boolean {
    return (
      this.#phase === 'choosing' &&
      Number.isInteger(index) &&
      index >= 0 &&
      index < this.#visibleChoices.length
    );
  }

  #nextStop(): number {
    for (let offset of this.#breaks) {
      if (offset > this.#revealedCount) {
        return Math.min(offset, this.pageText.length);
      }
    }

    return this.pageText.length;
  }

  #pauseAtStop(): void {
    let isPageEnd = this.#revealedCount >= this.pageText.length;
    let isLastPage = this.#pageIndex === this.#pages.length - 1;

    this.#phase =
      isPageEnd && isLastPage && this.#visibleChoices.length > 0 ? 'choosing' : 'idle';
  }

  #enterPage(): void {
    this.#phase = 'revealing';
    this.#revealedCount = 0;
    this.#revealBudget = 0;
    this.#breaks = [];
  }

  #enterNode(reference: DialogueNode<TContext, string> | string): void {
    let node = typeof reference === 'string' ? this.#script.nodes?.[reference] : reference;

    if (node === undefined) {
      failUnsupported(`Dialogue node "${String(reference)}" wasn't found in the script!`);
      this.#end();

      return;
    }

    this.#node = node;
    node.onEnter?.(this.#context);

    let text = typeof node.text === 'function' ? node.text(this.#context) : node.text;

    this.#pages = typeof text === 'string' ? [text] : [...text];

    if (this.#pages.length === 0) {
      failUnsupported('Dialogue node entered with an empty page list!');
      this.#end();

      return;
    }

    if (node.choices !== undefined && node.next !== undefined) {
      failUnsupported(
        'A dialogue node cannot carry both choices and next; its next could never be followed!',
      );
    }

    this.#visibleChoices = (node.choices ?? []).filter(
      (choice) => choice.isVisible?.(this.#context) ?? true,
    );

    if ((node.choices?.length ?? 0) > 0 && this.#visibleChoices.length === 0) {
      if (import.meta.env.DEV) {
        // eslint-disable-next-line no-console -- authoring-hole warning; the node degrades to choice-less
        console.warn(
          'Every choice on a dialogue node filtered invisible; the node is treated as choice-less.',
        );
      }
    }

    this.#selectedIndex = 0;
    this.#pageIndex = 0;
    this.#enterPage();
  }

  #end(): void {
    this.#phase = 'ended';
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/Dialogue.test.ts && npx vitest run tests/dialogueScript.test.ts && npm run typecheck`
Expected: PASS, typecheck clean.

- [ ] **Step 5: Commit**

```powershell
git add source/engine/dialogue/Dialogue.ts tests/Dialogue.test.ts
git commit -m "Add the dialogue runner"
```

### Task 3: Text wrapping (`wrapText.ts`)

**Files:**
- Create: `source/engine/dialogue/wrapText.ts`
- Test: `tests/wrapText.test.ts`

**Interfaces:**
- Consumes: `failUnsupported`.
- Produces: `wrapText(text: string, width: number, measure: (text: string) => number): string`. Task 4's box consumes it; `measure` returns the rendered width of a string in art px.

- [ ] **Step 1: Write the failing test**

Create `tests/wrapText.test.ts`. The fake measurer is fixed-width: 1 art px per character.

```ts
import {describe, expect, test} from 'vitest';

import {wrapText} from '../source/engine/dialogue/wrapText.js';

let measure = (text: string) => text.length;

describe('wrapText', () => {
  test('replaces break spaces with newlines and preserves length', () => {
    let wrapped = wrapText('aaa bbb ccc ddd', 7, measure);

    expect(wrapped).toBe('aaa bbb\nccc ddd');
    expect(wrapped).toHaveLength('aaa bbb ccc ddd'.length);
  });

  test('a line that fits is untouched', () => {
    expect(wrapText('short', 10, measure)).toBe('short');
  });

  test('authored newlines are kept as hard breaks', () => {
    let wrapped = wrapText('aaa bbb\nccc ddd eee', 7, measure);

    expect(wrapped).toBe('aaa bbb\nccc ddd\neee');
  });

  test('no reflow: wrapping any prefix never breaks earlier than the full text', () => {
    let full = 'aaa bbb ccc ddd eee';
    let wrapped = wrapText(full, 7, measure);

    for (let end = 1; end <= full.length; end++) {
      let prefix = wrapText(full, 7, measure).slice(0, end);
      let independent = wrapText(full.slice(0, end), 7, measure);

      // Every break the prefix wrap makes, the full wrap already made at the
      // same offset (greedy wrapping decides from earlier content only).
      for (let [index, character] of [...independent].entries()) {
        if (character === '\n') {
          expect(wrapped[index]).toBe('\n');
        }
      }

      expect(prefix).toHaveLength(independent.length);
    }
  });

  test('a runner substring of pre-wrapped text stays aligned with the authored text', () => {
    let authored = 'aaa bbb ccc';
    let wrapped = wrapText(authored, 7, measure);

    for (let count = 0; count <= authored.length; count++) {
      expect(wrapped.slice(0, count).replaceAll('\n', ' ')).toBe(authored.slice(0, count));
    }
  });

  test('a single word wider than the panel DEV-throws', () => {
    expect(() => wrapText('tiny unbreakableword', 7, measure)).toThrow(/wider than/);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/wrapText.test.ts`
Expected: FAIL - cannot resolve `../source/engine/dialogue/wrapText.js`.

- [ ] **Step 3: Write the implementation**

Create `source/engine/dialogue/wrapText.ts`:

```ts
import {failUnsupported} from '../utilities/failUnsupported.js';

/**
 * Wrap text to a pixel width by replacing break spaces with newlines. Pure and
 * length-preserving: it never inserts or deletes a character, so a substring
 * of the result stays aligned with the same offsets in the input (the
 * typewriter's no-reflow guarantee). Authored newlines are kept as hard
 * breaks. `measure` returns the rendered width of a string in art px.
 */
export function wrapText(
  text: string,
  width: number,
  measure: (text: string) => number,
): string {
  return text
    .split('\n')
    .map((line) => wrapLine(line, width, measure))
    .join('\n');
}

function wrapLine(line: string, width: number, measure: (text: string) => number): string {
  let wrapped = '';
  let current = '';

  for (let [index, word] of line.split(' ').entries()) {
    if (word.length > 0 && measure(word) > width) {
      failUnsupported(
        `The word "${word}" is wider than the dialogue text panel (${measure(word)} > ${width} art px)! Shorten the word; everything else fits by wrapping and windowing.`,
      );
    }

    if (index === 0) {
      current = word;

      continue;
    }

    let candidate = `${current} ${word}`;

    if (measure(candidate) > width) {
      wrapped += `${current}\n`;
      current = word;
    } else {
      current = candidate;
    }
  }

  return wrapped + current;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/wrapText.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add source/engine/dialogue/wrapText.ts tests/wrapText.test.ts
git commit -m "Add the length-preserving dialogue text wrapper"
```

### Task 4: The box (`DialogueBox.ts`)

**Files:**
- Create: `source/engine/dialogue/DialogueBox.ts`
- Test: `tests/DialogueBox.test.ts`

**Interfaces:**
- Consumes: `wrapText` (Task 3); engine widgets `Panel`, `Button` (+`ButtonOptions`), `Text`, `attachHitArea`, `UiChild`.
- Produces: `class DialogueBox` with the constructor options shown below and methods `showNode(node: DialogueBoxNode): void`, `setRevealed(count: number): void`, `setChoices(texts: string[], selectedIndex: number): void`, `setSelected(index: number): void`, `setAdvanceMarker(visible: boolean): void`, `resize(width: number, height: number): void`, `destroy(): void`; getters `breaks: readonly number[]`, `isCollapsed: boolean`; `readonly view: pixi.Container`. Also exports `type DialogueBoxMetrics`, `type DialogueBoxNode`, `type DialogueBoxOptions`. Task 9's `dialogueBoxSystem` consumes all of these.

Contract notes the implementation must honor (they are asserted by the tests):

- Change detection is part of the contract: `showNode` (and `resize`) do the expensive work (wrap, rebuild panels); `setChoices` rebuilds only the button column; `setSelected` touches only the prefix labels; `setRevealed`/`setAdvanceMarker` are per-frame calls that mutate only on an actual change. Buttons are never rebuilt within a node.
- `breaks` are window boundaries in page-character space: the offset just after the newline that ends each full window of `lineBudget` lines. Wrapping is length-preserving, so these offsets are valid runner offsets.
- The window shown by `setRevealed(count)` starts at the largest break strictly below `count`; at the pause moment (`count === break`) the completed window stays on screen, the flip happens after resume.
- `resize` re-wraps the current page, recomputes remaining breaks and re-applies the revealed substring; the revealed count survives.
- Below `metrics.collapseWidth`, or without a portrait texture, the layout collapses to the text panel alone; a collapsed node with a speaker renders the name as a header row (which costs one line of budget).
- Line height is the font size (bitmap fonts at native size); `lineBudget = max(1, floor((height - 2*padding) / fontSize) - 1 - (header ? 1 : 0))`.

- [ ] **Step 1: Write the failing test**

Create `tests/DialogueBox.test.ts`. `@pixi/layout/components` is mocked with a `LayoutContainer` that extends `pixi.Container` (so real child trees and events work headlessly), and the engine `Text` widget is mocked (constructing a `pixi.BitmapText` needs an installed font, which headless tests don't have).

```ts
import * as pixi from 'pixi.js';
import {beforeEach, describe, expect, test, vi} from 'vitest';

import {wrapText} from '../source/engine/dialogue/wrapText.js';

vi.mock('@pixi/layout/components', async () => {
  let {Container} = await import('pixi.js');

  class LayoutContainer extends Container {
    background: unknown;
    layout: unknown;

    constructor(options?: {background?: unknown}) {
      super();
      this.background = options?.background;
    }
  }

  return {LayoutContainer};
});

const mockTexts = vi.hoisted(() => [] as Array<{text: string}>);

vi.mock('../source/engine/ui/Text.js', async () => {
  let {Container} = await import('pixi.js');

  class Text {
    view = new Container();
    text: string;

    constructor({text}: {text: string}) {
      this.text = text;
      mockTexts.push(this);
    }

    setText(value: string) {
      this.text = value;

      return this;
    }

    setAnchor() {
      return this;
    }

    destroy() {
      this.view.destroy();
    }
  }

  return {Text};
});

const {DialogueBox} = await import('../source/engine/dialogue/DialogueBox.js');

// 1 art px per character makes every width a character count.
let measure = (text: string) => text.length;

// margin/padding/gap zero so the numbers stay literal: with height 36 and
// fontSize 12 the budget is floor(36/12) - 1 = 2 lines per window (1 with a
// header row).
const METRICS = {
  margin: 0,
  padding: 0,
  gap: 0,
  portraitSize: 4,
  choiceGap: 0,
  choiceMinHeight: 0,
  height: 36,
  collapseWidth: 100,
};

function createBox(overrides: {
  onAdvanceTap?: () => void;
  onChooseTap?: (index: number) => void;
  onChoiceHover?: (index: number) => void;
} = {}) {
  let backgroundCalls = {count: 0};
  let box = new DialogueBox({
    panelBackground: () => new pixi.Container(),
    choiceBackgrounds: () => {
      backgroundCalls.count += 1;

      return {normal: new pixi.Container()};
    },
    font: {fontFamily: 'monogram', fontSize: 12, fill: 0xffffff},
    metrics: METRICS,
    markerTexture: pixi.Texture.WHITE,
    measure,
    onAdvanceTap: overrides.onAdvanceTap ?? (() => {}),
    onChooseTap: overrides.onChooseTap ?? (() => {}),
    onChoiceHover: overrides.onChoiceHover ?? (() => {}),
  });

  return {box, backgroundCalls};
}

function findTapSurfaces(root: pixi.Container): pixi.Container[] {
  let surfaces: pixi.Container[] = [];
  let walk = (container: pixi.Container) => {
    if (container.listenerCount('pointertap') > 0) {
      surfaces.push(container);
    }

    for (let child of container.children) {
      walk(child as pixi.Container);
    }
  };

  walk(root);

  return surfaces;
}

const PAGE = 'aaa bbb ccc ddd eee'; // wraps at width 10 into 'aaa bbb' / 'ccc ddd' / 'eee'

describe('DialogueBox windowing', () => {
  beforeEach(() => {
    mockTexts.length = 0;
  });

  test('showNode wraps the page and exposes window breaks', () => {
    let {box} = createBox();

    box.resize(10, 100);
    box.showNode({page: PAGE});

    // Two lines per window; the break sits just after 'aaa bbb\nccc ddd\n'.
    expect(box.breaks).toEqual([16]);
    expect(box.isCollapsed).toBe(true); // no portrait
  });

  test('setRevealed windows the wrapped substring', () => {
    let {box} = createBox();

    box.resize(10, 100);
    box.showNode({page: PAGE});

    box.setRevealed(5);
    expect(mockTexts.some((text) => text.text === 'aaa b')).toBe(true);

    box.setRevealed(16); // the pause moment: the full first window stays
    expect(mockTexts.some((text) => text.text === 'aaa bbb\nccc ddd\n')).toBe(true);

    box.setRevealed(17); // past the break: the second window begins
    expect(mockTexts.some((text) => text.text === 'e')).toBe(true);
  });

  test('a collapsed speaker header costs one line of budget', () => {
    let {box} = createBox();

    box.resize(10, 100);
    box.showNode({speaker: 'Mira', page: PAGE});

    // Budget 1: a break after every full window line except the last.
    expect(box.breaks).toEqual([8, 16]);
    expect(mockTexts.some((text) => text.text === 'Mira')).toBe(true);
  });

  test('resize re-wraps and preserves the revealed count', () => {
    let {box} = createBox();

    box.resize(10, 100);
    box.showNode({page: PAGE});
    box.setRevealed(5);

    box.resize(4, 100); // 'aaa' / 'bbb' / 'ccc' / 'ddd' / 'eee'

    let rewrapped = wrapText(PAGE, 4, measure);

    expect(box.breaks).toEqual([8, 16]);
    expect(mockTexts.some((text) => text.text === rewrapped.slice(0, 5))).toBe(true);
  });

  test('the portrait collapses below collapseWidth and expands above it', () => {
    let {box} = createBox();

    box.resize(300, 100);
    box.showNode({page: PAGE, portraitTexture: pixi.Texture.WHITE});
    expect(box.isCollapsed).toBe(false);

    box.resize(50, 100);
    expect(box.isCollapsed).toBe(true);
  });
});

describe('DialogueBox choices and marker', () => {
  beforeEach(() => {
    mockTexts.length = 0;
  });

  test('setChoices builds prefixed labels and setSelected flips them without rebuilding', () => {
    let {box, backgroundCalls} = createBox();

    box.resize(10, 100);
    box.showNode({page: 'Q'});
    box.setChoices(['Yes', 'No'], 0);

    expect(backgroundCalls.count).toBe(2);
    expect(mockTexts.some((text) => text.text === '▶ Yes')).toBe(true);
    expect(mockTexts.some((text) => text.text === '  No')).toBe(true);

    box.setSelected(1);

    expect(backgroundCalls.count).toBe(2); // no button rebuild
    expect(mockTexts.some((text) => text.text === '  Yes')).toBe(true);
    expect(mockTexts.some((text) => text.text === '▶ No')).toBe(true);
  });

  test('taps reach the advance and choose callbacks', () => {
    let advanced = vi.fn();
    let chosen = vi.fn();
    let {box} = createBox({onAdvanceTap: advanced, onChooseTap: chosen});

    box.resize(10, 100);
    box.showNode({page: 'Q'});
    box.setChoices(['A', 'B'], 0);

    let surfaces = findTapSurfaces(box.view);

    // The text panel plus one surface per choice button.
    expect(surfaces).toHaveLength(3);

    for (let surface of surfaces) {
      surface.emit('pointertap', {stopPropagation: () => {}} as never);
    }

    expect(advanced).toHaveBeenCalledTimes(1);
    expect(chosen).toHaveBeenCalledWith(0);
    expect(chosen).toHaveBeenCalledWith(1);
  });

  test('the advance marker toggles visibility', () => {
    let {box} = createBox();

    box.resize(10, 100);
    box.showNode({page: 'Q'});

    let marker = box.view.children.find(
      (child) => child instanceof pixi.Sprite && child.texture === pixi.Texture.WHITE,
    ) as pixi.Sprite;

    expect(marker.visible).toBe(false);

    box.setAdvanceMarker(true);
    expect(marker.visible).toBe(true);

    box.setAdvanceMarker(false);
    expect(marker.visible).toBe(false);
  });

  test('destroy tears the whole tree down', () => {
    let {box} = createBox();

    box.resize(10, 100);
    box.showNode({page: 'Q'});
    box.destroy();

    expect(box.view.destroyed).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/DialogueBox.test.ts`
Expected: FAIL - cannot resolve `../source/engine/dialogue/DialogueBox.js`.

- [ ] **Step 3: Write the implementation**

Create `source/engine/dialogue/DialogueBox.ts`:

```ts
import * as pixi from 'pixi.js';

import {attachHitArea} from '../ui/attachHitArea.js';
import {Button, type ButtonOptions} from '../ui/Button.js';
import {Panel} from '../ui/Panel.js';
import {Text} from '../ui/Text.js';
import {type UiChild} from '../ui/UiChild.js';
import {wrapText} from './wrapText.js';

export type DialogueBoxMetrics = {
  /** Box inset from the screen edges, art px (all metrics are art px). */
  margin: number;
  /** Inner padding of both panels. */
  padding: number;
  /** Gap between the portrait panel and the text panel, and inside the text column. */
  gap: number;
  /** Edge of the square portrait sprite. */
  portraitSize: number;
  /** Gap between choice buttons; generous keeps adjacent choices tappable. */
  choiceGap: number;
  /** Tap-target floor per choice button. */
  choiceMinHeight: number;
  /** Fixed box height; the box is a bottom bar. */
  height: number;
  /** Below this screen width the layout always collapses to the text panel alone. */
  collapseWidth: number;
};

export type DialogueBoxNode = {
  speaker?: string | undefined;
  portraitTexture?: pixi.Texture | undefined;
  /** The current page's authored text; the owner calls showNode again on page turns. */
  page: string;
};

export type DialogueBoxOptions = {
  /** Fresh instance per call: widgets own and destroy their backgrounds. */
  panelBackground: () => pixi.Container;
  choiceBackgrounds: () => ButtonOptions['backgrounds'];
  font: {fontFamily: string; fontSize: number; fill: pixi.ColorSource};
  metrics: DialogueBoxMetrics;
  markerTexture: pixi.Texture;
  /**
   * Rendered width of a string in art px; injectable for headless tests.
   * Defaults to bitmap-font measurement of `font`.
   */
  measure?: (text: string) => number;
  onAdvanceTap: () => void;
  onChooseTap: (index: number) => void;
  onChoiceHover: (index: number) => void;
};

const SELECTED_PREFIX = '▶ ';
const UNSELECTED_PREFIX = '  ';

/**
 * The dialogue display widget in the Modal idiom: a flat class owning a view,
 * composed from the existing UI widgets, no inheritance, no ECS and no
 * channels. The root positions itself as a bottom bar in screen art px; a
 * LayoutContainer subtree under a plain container computes as an independent
 * layout root because its width and height are numbers.
 */
export class DialogueBox {
  readonly view: pixi.Container = new pixi.Container();

  readonly #panelBackground: () => pixi.Container;
  readonly #choiceBackgrounds: () => ButtonOptions['backgrounds'];
  readonly #font: {fontFamily: string; fontSize: number; fill: pixi.ColorSource};
  readonly #metrics: DialogueBoxMetrics;
  readonly #marker: pixi.Sprite;
  readonly #measure: (text: string) => number;
  readonly #onAdvanceTap: () => void;
  readonly #onChooseTap: (index: number) => void;
  readonly #onChoiceHover: (index: number) => void;

  #screenWidth = 0;
  #screenHeight = 0;
  #node: DialogueBoxNode | null = null;
  #box: Panel | null = null;
  #textPanel: Panel | null = null;
  #content: Text | null = null;
  #choicesPanel: Panel | null = null;
  #choiceLabels: Text[] = [];
  #choiceTexts: string[] = [];
  #selectedIndex = 0;
  #isCollapsed = false;
  #wrapped = '';
  #breaks: number[] = [];
  #revealedCount = 0;

  constructor({
    panelBackground,
    choiceBackgrounds,
    font,
    metrics,
    markerTexture,
    measure,
    onAdvanceTap,
    onChooseTap,
    onChoiceHover,
  }: DialogueBoxOptions) {
    this.#panelBackground = panelBackground;
    this.#choiceBackgrounds = choiceBackgrounds;
    this.#font = font;
    this.#metrics = metrics;
    this.#onAdvanceTap = onAdvanceTap;
    this.#onChooseTap = onChooseTap;
    this.#onChoiceHover = onChoiceHover;

    this.#marker = new pixi.Sprite({texture: markerTexture});
    this.#marker.visible = false;

    if (measure === undefined) {
      let style = new pixi.TextStyle({fontFamily: font.fontFamily, fontSize: font.fontSize});

      this.#measure = (value) => {
        let measured = pixi.BitmapFontManager.measureText(value, style);

        return measured.width * measured.scale;
      };
    } else {
      this.#measure = measure;
    }
  }

  /** Pause offsets for the current page (window boundaries), in page-character space. */
  get breaks(): readonly number[] {
    return this.#breaks;
  }

  /** Whether the current layout dropped the portrait panel. */
  get isCollapsed(): boolean {
    return this.#isCollapsed;
  }

  /** The expensive call: wraps the page and rebuilds the panel row. Node or page change only. */
  showNode(node: DialogueBoxNode): void {
    this.#node = node;
    this.#revealedCount = 0;
    this.#choiceTexts = [];
    this.#choiceLabels = [];
    this.#choicesPanel = null;
    this.#selectedIndex = 0;
    this.#rebuild();
  }

  /** Per-frame call; mutates only on an actual change. */
  setRevealed(count: number): void {
    if (this.#node === null || count === this.#revealedCount) {
      return;
    }

    this.#revealedCount = count;
    this.#applyRevealed();
  }

  /** Rebuilds the button column. Node change only; hover and press state survive per-frame sync. */
  setChoices(texts: string[], selectedIndex: number): void {
    this.#choiceTexts = [...texts];
    this.#selectedIndex = selectedIndex;
    this.#buildChoices();
  }

  /** Touches only the prefix labels; monospaced fonts make the swap jitter-free. */
  setSelected(index: number): void {
    if (index === this.#selectedIndex) {
      return;
    }

    this.#selectedIndex = index;
    this.#applySelected();
  }

  /** Per-frame call; mutates only on an actual change. */
  setAdvanceMarker(visible: boolean): void {
    if (this.#marker.visible !== visible) {
      this.#marker.visible = visible;
    }
  }

  /**
   * Screen art-px dimensions. Re-wraps the current page, recomputes the
   * remaining breaks and re-applies the revealed substring, so rotation or a
   * window resize mid-reveal cannot strand stale wrapping.
   */
  resize(width: number, height: number): void {
    this.#screenWidth = width;
    this.#screenHeight = height;
    this.view.position.set(
      this.#metrics.margin,
      height - this.#metrics.height - this.#metrics.margin,
    );

    if (this.#node !== null) {
      this.#rebuild();
    }
  }

  destroy(): void {
    this.#box?.destroy();
    this.#box = null;
    this.view.destroy({children: true});
  }

  #rebuild(): void {
    let node = this.#node;

    if (node === null) {
      return;
    }

    let {padding, gap, portraitSize, height, collapseWidth, margin} = this.#metrics;
    let boxWidth = Math.max(1, this.#screenWidth - 2 * margin);
    let portraitPanelWidth = portraitSize + 2 * padding;

    this.#isCollapsed =
      node.portraitTexture === undefined || this.#screenWidth < collapseWidth;

    let textPanelWidth = this.#isCollapsed ? boxWidth : boxWidth - portraitPanelWidth - gap;
    let textWidth = Math.max(1, textPanelWidth - 2 * padding);

    this.#wrapped = wrapText(node.page, textWidth, this.#measure);

    // Window the wrapped lines into the panel's line budget; the offset just
    // after the newline ending each full window becomes a runner break (the
    // newline is an authored character because wrapping is length-preserving).
    let lines = this.#wrapped.split('\n');
    let lineHeight = this.#font.fontSize; // bitmap fonts render at native size
    let hasHeader = this.#isCollapsed && node.speaker !== undefined;
    let lineBudget = Math.max(
      1,
      Math.floor((height - 2 * padding) / lineHeight) - 1 - (hasHeader ? 1 : 0),
    );

    this.#breaks = [];

    let offset = 0;

    for (let [index, line] of lines.entries()) {
      offset += line.length + 1; // + the following newline; the last line has none but is never a break

      if ((index + 1) % lineBudget === 0 && index < lines.length - 1) {
        this.#breaks.push(offset);
      }
    }

    this.#buildPanels(node, boxWidth, textPanelWidth);
    this.#applyRevealed();

    if (this.#choiceTexts.length > 0) {
      this.#buildChoices();
    }
  }

  #buildPanels(node: DialogueBoxNode, boxWidth: number, textPanelWidth: number): void {
    let {padding, gap, height} = this.#metrics;
    let font = this.#font;

    this.#box?.destroy();
    this.#choicesPanel = null;
    this.#choiceLabels = [];

    let textChildren: UiChild[] = [];

    if (this.#isCollapsed && node.speaker !== undefined) {
      textChildren.push(
        new Text({
          text: node.speaker,
          fontFamily: font.fontFamily,
          fontSize: font.fontSize,
          fill: font.fill,
          layout: true,
        }),
      );
    }

    this.#content = new Text({
      text: '',
      fontFamily: font.fontFamily,
      fontSize: font.fontSize,
      fill: font.fill,
      layout: true,
    });
    textChildren.push(this.#content);

    this.#textPanel = new Panel({
      background: this.#panelBackground(),
      children: textChildren,
      layout: {flexDirection: 'column', padding, gap, width: textPanelWidth, height},
    });

    // The tap surface: a bare Panel has no eventMode and no hit area, so the
    // advance tap installs both; stopPropagation keeps dialogue taps away
    // from the view-level move-to listener.
    let textView = this.#textPanel.view;

    textView.eventMode = 'static';
    attachHitArea(textView);
    textView.on('pointertap', (event) => {
      event.stopPropagation();
      this.#onAdvanceTap();
    });

    let boxChildren: UiChild[] = [];

    if (!this.#isCollapsed) {
      let portrait = new pixi.Sprite({texture: node.portraitTexture});

      portrait.layout = {
        isLeaf: true,
        width: this.#metrics.portraitSize,
        height: this.#metrics.portraitSize,
      };

      let portraitChildren: UiChild[] = [portrait];

      if (node.speaker !== undefined) {
        portraitChildren.push(
          new Text({
            text: node.speaker,
            fontFamily: font.fontFamily,
            fontSize: font.fontSize,
            fill: font.fill,
            layout: true,
          }),
        );
      }

      boxChildren.push(
        new Panel({
          background: this.#panelBackground(),
          children: portraitChildren,
          layout: {flexDirection: 'column', alignItems: 'center', padding, gap: 1, height},
        }),
      );
    }

    boxChildren.push(this.#textPanel);

    this.#box = new Panel({
      children: boxChildren,
      layout: {flexDirection: 'row', gap, width: boxWidth, height},
    });

    this.view.addChild(this.#box.view);

    // The marker sits out of flow at the box's bottom-right corner, re-added
    // on top after each rebuild.
    this.#marker.position.set(
      boxWidth - padding - this.#marker.width,
      height - padding - this.#marker.height,
    );
    this.view.addChild(this.#marker);
  }

  #buildChoices(): void {
    if (this.#textPanel === null) {
      return;
    }

    if (this.#choicesPanel !== null) {
      this.#textPanel.removeChild(this.#choicesPanel);
      this.#choicesPanel.destroy();
    }

    this.#choiceLabels = [];

    let buttons = this.#choiceTexts.map((text, index) => {
      let label = new Text({
        text: UNSELECTED_PREFIX + text,
        fontFamily: this.#font.fontFamily,
        fontSize: this.#font.fontSize,
        fill: this.#font.fill,
        layout: true,
      });

      this.#choiceLabels.push(label);

      let button = new Button({
        backgrounds: this.#choiceBackgrounds(),
        children: [label],
        onClick: () => {
          this.#onChooseTap(index);
        },
        layout: {
          padding: 1,
          minHeight: this.#metrics.choiceMinHeight,
          justifyContent: 'flex-start',
        },
      });

      // Hover feeds the selection channel, so the highlight and the confirmed
      // row can never disagree.
      button.view.on('pointerover', () => {
        this.#onChoiceHover(index);
      });

      return button;
    });

    this.#choicesPanel = new Panel({
      children: buttons,
      layout: {flexDirection: 'column', gap: this.#metrics.choiceGap},
    });
    this.#textPanel.addChild(this.#choicesPanel);
    this.#applySelected();
  }

  #applySelected(): void {
    for (let [index, label] of this.#choiceLabels.entries()) {
      let prefix = index === this.#selectedIndex ? SELECTED_PREFIX : UNSELECTED_PREFIX;

      label.setText(prefix + (this.#choiceTexts[index] ?? ''));
    }
  }

  #applyRevealed(): void {
    let windowStart = 0;

    for (let offset of this.#breaks) {
      // Strictly below: at the pause moment (revealedCount === offset) the
      // completed window stays on screen; the flip happens on resume.
      if (offset < this.#revealedCount) {
        windowStart = offset;
      }
    }

    this.#content?.setText(this.#wrapped.slice(windowStart, this.#revealedCount));
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/DialogueBox.test.ts && npm run typecheck`
Expected: PASS, typecheck clean. If `portrait.layout = ...` fails to typecheck, add `import '@pixi/layout';` is NOT the fix (side effects belong to `Game.ts`); the augmentation is ambient through the package types already used by `Modal.ts`, so a failure here means a typo, not a missing import.

- [ ] **Step 5: Commit**

```powershell
git add source/engine/dialogue/DialogueBox.ts tests/DialogueBox.test.ts
git commit -m "Add the dialogue box widget"
```

### Task 5: Game dialogue state and content

**Files:**
- Create: `source/game/flags.ts`, `source/game/DialogueComponent.ts`, `source/game/dialogueQuery.ts`, `source/game/dialogue.ts`, `source/game/DialogueCommand.ts`, `source/game/dialogueCommandChannel.ts`, `source/game/dialogueRegistry.ts`
- Test: `tests/flags.test.ts`, `tests/dialogueRegistry.test.ts`

**Interfaces:**
- Consumes: `defineDialogueScript` (Task 1), `Dialogue` type (Task 2), `defineComponent`, `defineEvent`, `Entity`, `EntityQuery`, `EventChannel`.
- Produces:
  - `type Flags = {metMira: boolean}`, `const flags: Flags`, `resetFlags(): void`
  - `const DialogueComponent = defineComponent<{active: Dialogue<Flags> | null}>()`
  - `const dialogueQuery: EntityQuery` (components `[DialogueComponent]`)
  - `const dialogueEntity: Entity` (file `source/game/dialogue.ts`)
  - `type DialogueCommandType = 'advance' | 'choose' | 'down' | 'interact' | 'select' | 'up'`, `const DialogueCommand = defineEvent<{type: DialogueCommandType; index?: number}>()`
  - `const dialogueCommandChannel: EventChannel`
  - `const miraScript`, `const signScript`, `const dialogueRegistry = {mira: miraScript, sign: signScript}`, `type DialogueRegistryName = keyof typeof dialogueRegistry`

Tasks 6-12 rely on these exact names.

- [ ] **Step 1: Write the failing tests**

Create `tests/flags.test.ts`:

```ts
import {describe, expect, test} from 'vitest';

import {flags, resetFlags} from '../source/game/flags.js';

describe('flags', () => {
  test('resetFlags restores the defaults', () => {
    flags.metMira = true;
    resetFlags();

    expect(flags.metMira).toBe(false);
  });
});
```

Create `tests/dialogueRegistry.test.ts`:

```ts
import {describe, expect, test} from 'vitest';

import {dialogueRegistry, miraScript} from '../source/game/dialogueRegistry.js';

describe('dialogueRegistry', () => {
  test('exposes exactly the demo scripts', () => {
    expect(Object.keys(dialogueRegistry)).toEqual(['mira', 'sign']);
  });

  test('the mira script greets by the metMira flag', () => {
    expect(typeof miraScript.start).toBe('function');

    if (typeof miraScript.start === 'function') {
      expect(miraScript.start({metMira: false})).toBe('greeting');
      expect(miraScript.start({metMira: true})).toBe('again');
    }
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/flags.test.ts tests/dialogueRegistry.test.ts`
Expected: FAIL - cannot resolve the game modules.

- [ ] **Step 3: Write the implementations**

Create `source/game/flags.ts`:

```ts
// The typed mutable flags object: the dialogue context and a save-blob field.
// Module state outlives the world, so world.onStart resets it to defaults
// before applyStagedSave runs; New Game after a finished playthrough starts
// clean and Continue still restores the saved values.
export type Flags = {
  metMira: boolean;
};

function createDefaults(): Flags {
  return {metMira: false};
}

export const flags: Flags = createDefaults();

export function resetFlags(): void {
  Object.assign(flags, createDefaults());
}
```

Create `source/game/DialogueComponent.ts`:

```ts
import {type Dialogue} from '../engine/dialogue/Dialogue.js';
import {defineComponent} from '../engine/ecs/Component.js';
import {type Flags} from './flags.js';

// One dialogue at a time, structurally: the singleton entity carries the
// active runner (the camera/input/audio pattern). Component sets stay fixed
// at construction; starting a dialogue assigns `active`, ending clears it.
export const DialogueComponent = defineComponent<{active: Dialogue<Flags> | null}>();
```

Create `source/game/dialogueQuery.ts`:

```ts
import {EntityQuery} from '../engine/ecs/EntityQuery.js';
import {DialogueComponent} from './DialogueComponent.js';

export const dialogueQuery = new EntityQuery({
  components: [DialogueComponent],
});
```

Create `source/game/dialogue.ts`:

```ts
import {Entity} from '../engine/ecs/Entity.js';
import {DialogueComponent} from './DialogueComponent.js';

// The dialogue singleton (query-per-singleton boilerplate; T2.15 world
// resources kills it later). The entity outlives the run, so world.onStart
// clears `active`: a mid-dialogue Quit leaves it set.
export const dialogueEntity = new Entity({
  components: [new DialogueComponent({active: null})],
});
```

Create `source/game/DialogueCommand.ts`:

```ts
import {defineEvent} from '../engine/ecs/Event.js';

export type DialogueCommandType = 'advance' | 'choose' | 'down' | 'interact' | 'select' | 'up';

// `index` rides only `select` and `choose`; producers omit it otherwise
// (exactOptionalPropertyTypes rejects an explicit `index: undefined`).
export const DialogueCommand = defineEvent<{type: DialogueCommandType; index?: number}>();
```

Create `source/game/dialogueCommandChannel.ts`:

```ts
import {EventChannel} from '../engine/ecs/EventChannel.js';
import {DialogueCommand} from './DialogueCommand.js';

// One game-owned channel, multiple producers (dialogueInputSystem, pointer
// handlers in dialogueBoxSystem), exactly one deciding consumer
// (dialogueSystem): that is what makes one command mean exactly one thing.
export const dialogueCommandChannel = new EventChannel({
  event: DialogueCommand,
  displayName: 'Dialogue command',
});
```

Create `source/game/dialogueRegistry.ts`:

```ts
import {defineDialogueScript} from '../engine/dialogue/DialogueScript.js';
import {type Flags} from './flags.js';

// Authored dialogue content. Naming guideline: ids for nodes referenced more
// than once, looped to or asserted on in tests; inline nodes for dead-end
// tails and one-off responses.
export const miraScript = defineDialogueScript<Flags>()({
  start: (flags) => (flags.metMira ? 'again' : 'greeting'),
  nodes: {
    greeting: {
      speaker: 'Mira',
      portrait: 'mira',
      text: 'Welcome to Somewhere.',
      choices: [
        {text: 'Sure, show me around.', next: 'tour'},
        {
          text: 'Maybe later.',
          next: {speaker: 'Mira', portrait: 'mira', text: 'Suit yourself.'},
        },
      ],
    },
    tour: {
      speaker: 'Mira',
      portrait: 'mira',
      text: ['This way.', 'Mind the well.'],
      next: 'goodbye',
    },
    again: {speaker: 'Mira', portrait: 'mira', text: 'Back already?', next: 'goodbye'},
    goodbye: {
      speaker: 'Mira',
      portrait: 'mira',
      text: 'Bye.',
      onEnter: (flags) => {
        flags.metMira = true;
      },
    },
  },
});

// Inline-only: no speaker, no portrait; proves the collapsed layout and the
// auto-start entry point.
export const signScript = defineDialogueScript<Flags>()({
  start: {text: 'KEEP OUT.'},
});

// Tiled `dialogue` properties resolve against these keys at spawn (the keys
// are static, so there is no forward-reference problem).
export const dialogueRegistry = {mira: miraScript, sign: signScript};

export type DialogueRegistryName = keyof typeof dialogueRegistry;
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/flags.test.ts tests/dialogueRegistry.test.ts && npm run typecheck`
Expected: PASS, typecheck clean.

- [ ] **Step 5: Commit**

```powershell
git add source/game/flags.ts source/game/DialogueComponent.ts source/game/dialogueQuery.ts source/game/dialogue.ts source/game/DialogueCommand.ts source/game/dialogueCommandChannel.ts source/game/dialogueRegistry.ts tests/flags.test.ts tests/dialogueRegistry.test.ts
git commit -m "Add the game dialogue state, commands and demo scripts"
```

### Task 6: The deciding system (`dialogueSystem.ts`)

**Files:**
- Create: `source/game/dialogueSystem.ts`
- Test: `tests/dialogueSystem.test.ts`

**Interfaces:**
- Consumes: `Dialogue` (Task 2), everything from Task 5, `playersQuery`, `MotionComponent`, `TriggerComponent`, `triggerEnterChannel`, `System`.
- Produces: `const dialogueSystem: System` (components `[TriggerComponent]`). Every dialogue state decision lives here; Task 12 registers it before `playerSystem`.

Behavior contract (each bullet has a test):

- `interact` with a dialogue active calls `advance()`; with none active it starts the script of the `npc` trigger the player stands in (first match wins) and moves on, so the starting press can never also advance.
- `advance` (the tap command) calls `advance()` only while `revealing` or `idle` and is dropped while `choosing`.
- `up`/`down` call `moveSelection(∓1)`; `select` calls `select(index)`; `choose` calls `choose(index)`. Dialogue-scoped commands are dropped while none is active; stale-phase commands are dropped silently (buffered-input reality).
- A `zone` trigger enter with a `dialogue` property auto-starts when none is active; an enter arriving while one is active is dropped for good.
- Both start paths clear the player's `motion.target` AND `motion.velocity`.
- After command handling it ticks `active` with the world delta (a dialogue started this frame starts revealing this frame) and clears `active` when the runner reaches `ended`. Pause needs no code.

- [ ] **Step 1: Write the failing test**

Create `tests/dialogueSystem.test.ts`:

```ts
import * as pixi from 'pixi.js';
import {afterEach, beforeEach, describe, expect, test} from 'vitest';

import {Entity} from '../source/engine/ecs/Entity.js';
import {World} from '../source/engine/ecs/World.js';
import {Vector} from '../source/engine/utilities/Vector.js';
import {DialogueCommand, type DialogueCommandType} from '../source/game/DialogueCommand.js';
import {dialogueCommandChannel} from '../source/game/dialogueCommandChannel.js';
import {DialogueComponent} from '../source/game/DialogueComponent.js';
import {dialogueQuery} from '../source/game/dialogueQuery.js';
import {dialogueSystem} from '../source/game/dialogueSystem.js';
import {flags, resetFlags} from '../source/game/flags.js';
import {MotionComponent} from '../source/game/MotionComponent.js';
import {PlayerComponent} from '../source/game/PlayerComponent.js';
import {playersQuery} from '../source/game/playersQuery.js';
import {TriggerComponent} from '../source/game/TriggerComponent.js';
import {TriggerEnter} from '../source/game/TriggerEnter.js';
import {triggerEnterChannel} from '../source/game/triggerEnterChannel.js';

function tick(deltaMS = 0): pixi.Ticker {
  return {deltaMS} as unknown as pixi.Ticker;
}

function createNpc(properties: Record<string, boolean | number | string> = {dialogue: 'mira'}) {
  let entity = new Entity({
    components: [
      new TriggerComponent({
        id: 1,
        name: 'mira',
        type: 'npc',
        rect: new pixi.Rectangle(0, 0, 16, 16),
        properties,
      }),
    ],
  });

  entity.getComponent(TriggerComponent).isPlayerInside = true;

  return entity;
}

function createSignZone() {
  return new Entity({
    components: [
      new TriggerComponent({
        id: 2,
        name: 'keep-out-sign',
        type: 'zone',
        rect: new pixi.Rectangle(0, 32, 16, 8),
        properties: {dialogue: 'sign'},
      }),
    ],
  });
}

let activeWorld: World | null = null;

function createHarness(triggers: Entity[]) {
  let dialogueEntity = new Entity({components: [new DialogueComponent({active: null})]});
  let motion = new MotionComponent({position: new Vector(0, 0), velocity: new Vector(0, 0)});
  let player = new Entity({components: [new PlayerComponent({name: 'Test'}), motion]});
  let world = new World({
    onStart: (w) => {
      w.addEventChannel(dialogueCommandChannel)
        .addEventChannel(triggerEnterChannel)
        .addEntityQuery(dialogueQuery)
        .addEntityQuery(playersQuery)
        .addSystem(dialogueSystem)
        .addEntity(dialogueEntity)
        .addEntity(player);

      for (let trigger of triggers) {
        w.addEntity(trigger);
      }
    },
  });

  activeWorld = world;

  let component = dialogueEntity.getComponent(DialogueComponent);

  return {world, component, motion, player};
}

// Commands pushed outside an update land in the write buffer; the manual swap
// makes them current for the next update (the zoneSystem test pattern). Push
// all same-frame commands before one swap.
function pushCommands(...commands: Array<{type: DialogueCommandType; index?: number}>) {
  for (let command of commands) {
    dialogueCommandChannel.push(new DialogueCommand(command));
  }

  dialogueCommandChannel.swap();
}

describe('dialogueSystem', () => {
  beforeEach(() => {
    resetFlags();
  });

  afterEach(() => {
    activeWorld?.stop();
    activeWorld = null;
  });

  test('one interact starts the standing NPC script without advancing it', () => {
    let {world, component} = createHarness([createNpc()]);

    world.start();
    pushCommands({type: 'interact'});
    world.update(tick());

    expect(component.active).not.toBeNull();
    expect(component.active?.phase).toBe('revealing');
    expect(component.active?.revealedCount).toBe(0); // zero delta: started, not advanced
    expect(component.active?.pageText).toBe('Welcome to Somewhere.');
  });

  test('interact advances while a dialogue is active', () => {
    let {world, component} = createHarness([createNpc()]);

    world.start();
    pushCommands({type: 'interact'});
    world.update(tick());
    pushCommands({type: 'interact'});
    world.update(tick());

    // The greeting node has choices, so the skip lands in choosing.
    expect(component.active?.phase).toBe('choosing');
    expect(component.active?.revealedCount).toBe('Welcome to Somewhere.'.length);
  });

  test('the interact start clears the tap target and the velocity', () => {
    let {world, motion} = createHarness([createNpc()]);

    world.start();
    motion.target = new Vector(50, 50);
    motion.velocity.set(2, 0);
    pushCommands({type: 'interact'});
    world.update(tick());

    expect(motion.target).toBeUndefined();
    expect(motion.velocity.x).toBe(0);
    expect(motion.velocity.y).toBe(0);
  });

  test('a zone enter with a dialogue property auto-starts and stops the walking player', () => {
    let sign = createSignZone();
    let {world, component, motion, player} = createHarness([sign]);

    world.start();
    motion.velocity.set(2, 0);
    triggerEnterChannel.push(new TriggerEnter({entity: player, trigger: sign}));
    triggerEnterChannel.swap();
    world.update(tick());

    expect(component.active?.pageText).toBe('KEEP OUT.');
    expect(motion.velocity.x).toBe(0);
  });

  test('an enter arriving while a dialogue is active is dropped for good', () => {
    let sign = createSignZone();
    let {world, component, player} = createHarness([sign]);

    world.start();
    triggerEnterChannel.push(new TriggerEnter({entity: player, trigger: sign}));
    triggerEnterChannel.swap();
    world.update(tick());

    let first = component.active;

    triggerEnterChannel.push(new TriggerEnter({entity: player, trigger: sign}));
    triggerEnterChannel.swap();
    world.update(tick());

    expect(component.active).toBe(first); // not restarted
  });

  test('dialogue-scoped commands are dropped while none is active', () => {
    let {world, component} = createHarness([]);

    world.start();
    pushCommands({type: 'advance'}, {type: 'up'}, {type: 'down'}, {type: 'select', index: 0}, {type: 'choose', index: 0});
    world.update(tick());

    expect(component.active).toBeNull();
  });

  test('a text-panel tap (advance) is dropped while choosing', () => {
    let {world, component} = createHarness([createNpc()]);

    world.start();
    pushCommands({type: 'interact'});
    world.update(tick());
    pushCommands({type: 'interact'});
    world.update(tick()); // choosing

    pushCommands({type: 'advance'});
    world.update(tick());

    expect(component.active?.phase).toBe('choosing'); // a stray tap cannot confirm
  });

  test('up/down move the selection, select hovers, choose confirms', () => {
    let {world, component} = createHarness([createNpc()]);

    world.start();
    pushCommands({type: 'interact'});
    world.update(tick());
    pushCommands({type: 'interact'});
    world.update(tick()); // choosing, index 0

    pushCommands({type: 'down'});
    world.update(tick());
    expect(component.active?.selectedIndex).toBe(1);

    pushCommands({type: 'select', index: 0});
    world.update(tick());
    expect(component.active?.selectedIndex).toBe(0);

    pushCommands({type: 'choose', index: 1});
    world.update(tick());
    expect(component.active?.pageText).toBe('Suit yourself.'); // the inline dead-end tail
  });

  test('a started dialogue ticks the same frame', () => {
    let {world, component} = createHarness([createNpc()]);

    world.start();
    pushCommands({type: 'interact'});
    world.update(tick(1000)); // 40 chars/s x 1s covers the whole first page

    expect(component.active?.revealedCount).toBe('Welcome to Somewhere.'.length);
  });

  test('active clears when the dialogue ends, and terminal onEnter flags stick', () => {
    let sign = createSignZone();
    let {world, component, player} = createHarness([sign]);

    world.start();
    triggerEnterChannel.push(new TriggerEnter({entity: player, trigger: sign}));
    triggerEnterChannel.swap();
    world.update(tick());

    pushCommands({type: 'interact'}); // skip the reveal
    world.update(tick());
    pushCommands({type: 'interact'}); // idle at last page, no next: ends
    world.update(tick());

    expect(component.active).toBeNull();
    expect(flags.metMira).toBe(false); // the sign never touches flags
  });

  test('a paused world freezes the reveal', () => {
    let {world, component} = createHarness([createNpc()]);

    world.start();
    pushCommands({type: 'interact'});
    world.update(tick());
    world.pause();
    world.update(tick(1000));

    expect(component.active?.revealedCount).toBe(0);

    world.resume();
    world.update(tick(1000));
    expect(component.active?.revealedCount).toBe('Welcome to Somewhere.'.length);
  });

  test('an unregistered npc dialogue name never starts (inert NPC)', () => {
    let {world, component} = createHarness([createNpc({dialogue: 'nope'})]);

    world.start();
    pushCommands({type: 'interact'});
    world.update(tick());

    expect(component.active).toBeNull();
  });

  test('interact outside any npc trigger does nothing', () => {
    let npc = createNpc();

    npc.getComponent(TriggerComponent).isPlayerInside = false;

    let {world, component} = createHarness([npc]);

    world.start();
    pushCommands({type: 'interact'});
    world.update(tick());

    expect(component.active).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/dialogueSystem.test.ts`
Expected: FAIL - cannot resolve `../source/game/dialogueSystem.js`.

- [ ] **Step 3: Write the implementation**

Create `source/game/dialogueSystem.ts`:

```ts
import {Dialogue} from '../engine/dialogue/Dialogue.js';
import {System} from '../engine/ecs/System.js';
import {DialogueComponent} from './DialogueComponent.js';
import {dialogueCommandChannel} from './dialogueCommandChannel.js';
import {dialogueQuery} from './dialogueQuery.js';
import {dialogueRegistry, type DialogueRegistryName} from './dialogueRegistry.js';
import {flags} from './flags.js';
import {MotionComponent} from './MotionComponent.js';
import {playersQuery} from './playersQuery.js';
import {TriggerComponent} from './TriggerComponent.js';
import {triggerEnterChannel} from './triggerEnterChannel.js';

const REVEAL_SPEED = 40; // characters per second

function startDialogue(component: InstanceType<typeof DialogueComponent>, name: string): void {
  // Spawn-time validation already failed loud on a bad name; here it means an
  // inert NPC or sign, so the start silently no-ops.
  if (!Object.hasOwn(dialogueRegistry, name)) {
    return;
  }

  component.active = new Dialogue({
    script: dialogueRegistry[name as DialogueRegistryName],
    context: flags,
    revealSpeed: REVEAL_SPEED,
  });

  // Stop the player dead on every start, both paths (the doorSystem pattern).
  // The sign path needs it most: its enter edge fires precisely because the
  // player was walking, and the playerSystem lock stops input handling, not
  // already-set velocity; without this, motionSystem slides the locked player
  // through the whole conversation.
  let motion = playersQuery.getFirst().getComponent(MotionComponent);

  motion.target = undefined;
  motion.velocity.set(0, 0);
}

export const dialogueSystem = new System({
  displayName: 'Dialogue system',
  // The component filter gives this system the trigger entities: the set the
  // interact command resolves the standing NPC against.
  components: [TriggerComponent],
  onUpdate: (ticker, system) => {
    let component = dialogueQuery.getFirst().getComponent(DialogueComponent);

    // Every dialogue state decision lives in this one system; channel reads
    // are shared snapshots, so a second deciding consumer would double-fire
    // commands (start a dialogue and instantly skip its first page).
    for (let command of dialogueCommandChannel.events) {
      let {active} = component;

      switch (command.type) {
        case 'interact': {
          if (active === null) {
            // Start the script of the npc trigger the player stands in, if
            // any, then move on: the starting press can never also advance.
            for (let entity of system.entities) {
              let trigger = entity.getComponent(TriggerComponent);

              if (trigger.type === 'npc' && trigger.isPlayerInside === true) {
                let {dialogue} = trigger.properties;

                if (typeof dialogue === 'string') {
                  startDialogue(component, dialogue);
                }

                break; // several overlapping zones: first match wins
              }
            }
          } else {
            active.advance();
          }

          break;
        }

        case 'advance': {
          // The tap command: dropped while choosing, so a stray tap on the
          // text panel can never confirm a choice. Stale-phase drops are
          // silent; with one-frame channel latency that is buffered-input
          // reality, not an error.
          if (active !== null && (active.phase === 'revealing' || active.phase === 'idle')) {
            active.advance();
          }

          break;
        }

        case 'up': {
          active?.moveSelection(-1);

          break;
        }

        case 'down': {
          active?.moveSelection(1);

          break;
        }

        case 'select': {
          if (active !== null && command.index !== undefined) {
            active.select(command.index);
          }

          break;
        }

        case 'choose': {
          if (active !== null && command.index !== undefined) {
            active.choose(command.index);
          }

          break;
        }
      }
    }

    // Sign auto-start: a zone with a dialogue property starts on the enter
    // edge when none is active (re-entering re-shows, correct for a sign); an
    // enter arriving while a dialogue is active is dropped for good, and only
    // exit-and-re-enter brings it back. Zone sound and dialogue properties
    // compose; zoneSystem is untouched.
    for (let {trigger} of triggerEnterChannel.events) {
      let zone = trigger.getComponent(TriggerComponent);

      if (zone === undefined || zone.type !== 'zone' || component.active !== null) {
        continue;
      }

      let {dialogue} = zone.properties;

      if (typeof dialogue === 'string') {
        startDialogue(component, dialogue);
      }
    }

    // Tick on world time after command handling, so a dialogue started this
    // frame starts revealing this frame; a paused world never runs this
    // system, which is the whole pause story.
    if (component.active !== null) {
      component.active.tick(ticker.deltaMS);

      if (component.active.phase === 'ended') {
        component.active = null;
      }
    }
  },
});
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/dialogueSystem.test.ts && npm run typecheck`
Expected: PASS, typecheck clean.

- [ ] **Step 5: Commit**

```powershell
git add source/game/dialogueSystem.ts tests/dialogueSystem.test.ts
git commit -m "Add the dialogue system as the one deciding command consumer"
```

### Task 7: Input (`interact` binding + `dialogueInputSystem.ts`)

**Files:**
- Modify: `source/game/input.ts`
- Create: `source/game/dialogueInputSystem.ts`
- Test: `tests/dialogueInputSystem.test.ts`

**Interfaces:**
- Consumes: `inputQuery`, `InputComponent`, Task 5's channel/command/query/component.
- Produces: the `interact` action (`KeyE` only; `Space`/`Enter` stay with the focus layer, no `pointerTap` on the binding) and `const dialogueInputSystem: System` (components `[]`). Task 12 registers it right after `inputSystem`.

- [ ] **Step 1: Write the failing test**

Create `tests/dialogueInputSystem.test.ts`. Events pushed during an update become readable after that update's end-of-frame swap, so assertions read `dialogueCommandChannel.events` after `world.update` returns.

```ts
import type * as pixi from 'pixi.js';
import {afterEach, describe, expect, test} from 'vitest';

import {Entity} from '../source/engine/ecs/Entity.js';
import {World} from '../source/engine/ecs/World.js';
import {Dialogue} from '../source/engine/dialogue/Dialogue.js';
import {type Input} from '../source/engine/input/Input.js';
import {InputComponent} from '../source/engine/input/InputComponent.js';
import {dialogueCommandChannel} from '../source/game/dialogueCommandChannel.js';
import {DialogueComponent} from '../source/game/DialogueComponent.js';
import {dialogueInputSystem} from '../source/game/dialogueInputSystem.js';
import {dialogueQuery} from '../source/game/dialogueQuery.js';
import {flags} from '../source/game/flags.js';
import {inputQuery} from '../source/game/inputQuery.js';

function tick(): pixi.Ticker {
  return {deltaMS: 0} as unknown as pixi.Ticker;
}

function createFakeInput(pressedActions: string[]): Input {
  return {
    held: () => false,
    pressed: (action: string) => pressedActions.includes(action),
    released: () => false,
  } as unknown as Input;
}

let activeWorld: World | null = null;

function createWorld(pressedActions: string[]) {
  let dialogueEntity = new Entity({components: [new DialogueComponent({active: null})]});
  let inputEntity = new Entity({
    components: [new InputComponent({input: createFakeInput(pressedActions)})],
  });
  let world = new World({
    onStart: (w) => {
      w.addEventChannel(dialogueCommandChannel)
        .addEntityQuery(dialogueQuery)
        .addEntityQuery(inputQuery)
        .addSystem(dialogueInputSystem)
        .addEntity(dialogueEntity)
        .addEntity(inputEntity);
    },
  });

  activeWorld = world;

  return {world, component: dialogueEntity.getComponent(DialogueComponent)};
}

describe('dialogueInputSystem', () => {
  afterEach(() => {
    activeWorld?.stop();
    activeWorld = null;
  });

  test('an interact press always pushes the interact command', () => {
    let {world} = createWorld(['interact']);

    world.start();
    world.update(tick());

    expect(dialogueCommandChannel.events).toHaveLength(1);
    expect(dialogueCommandChannel.events[0]?.type).toBe('interact');
  });

  test('movement presses push nothing while no dialogue is active', () => {
    let {world} = createWorld(['move-up', 'move-down']);

    world.start();
    world.update(tick());

    expect(dialogueCommandChannel.events).toHaveLength(0);
  });

  test('movement presses become up/down commands while a dialogue is active', () => {
    let {world, component} = createWorld(['move-up', 'move-down']);

    world.start();
    component.active = new Dialogue({script: {start: {text: 'Hi.'}}, context: flags});
    world.update(tick());

    expect(dialogueCommandChannel.events.map((event) => event.type)).toEqual(['up', 'down']);
  });

  test('no presses push nothing', () => {
    let {world} = createWorld([]);

    world.start();
    world.update(tick());

    expect(dialogueCommandChannel.events).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/dialogueInputSystem.test.ts`
Expected: FAIL - cannot resolve `../source/game/dialogueInputSystem.js`.

- [ ] **Step 3: Add the binding and the system**

In `source/game/input.ts`, extend the bindings record (keep the existing comment block above `input` untouched):

```ts
export const input = new Input({
  bindings: {
    'move-up': {keys: ['KeyW']},
    'move-down': {keys: ['KeyS']},
    'move-left': {keys: ['KeyA']},
    'move-right': {keys: ['KeyD']},
    'move-to': {pointerTap: true},
    // KeyE only (the arbitration precedent): Space and Enter stay with the
    // focus layer. No pointerTap here; all pointer input reaches dialogue
    // through pixi objects on the box and the prompt.
    interact: {keys: ['KeyE']},
  },
});
```

Create `source/game/dialogueInputSystem.ts`:

```ts
import {System} from '../engine/ecs/System.js';
import {InputComponent} from '../engine/input/InputComponent.js';
import {DialogueCommand} from './DialogueCommand.js';
import {DialogueComponent} from './DialogueComponent.js';
import {dialogueCommandChannel} from './dialogueCommandChannel.js';
import {dialogueQuery} from './dialogueQuery.js';
import {inputQuery} from './inputQuery.js';

// Translates action edges into dialogue commands; pointer paths push the same
// commands from pixi handlers in dialogueBoxSystem. This system only
// produces; dialogueSystem is the one deciding consumer.
export const dialogueInputSystem = new System({
  components: [],
  displayName: 'Dialogue input system',
  onUpdate: () => {
    let {input} = inputQuery.getFirst().getComponent(InputComponent);

    // Pushed even with no dialogue and no NPC in range (cheap, rare);
    // dialogueSystem drops it when it means nothing.
    if (input.pressed('interact')) {
      dialogueCommandChannel.push(new DialogueCommand({type: 'interact'}));
    }

    // Gate on an active dialogue so plain walking causes no channel churn.
    if (dialogueQuery.getFirst().getComponent(DialogueComponent).active === null) {
      return;
    }

    if (input.pressed('move-up')) {
      dialogueCommandChannel.push(new DialogueCommand({type: 'up'}));
    }

    if (input.pressed('move-down')) {
      dialogueCommandChannel.push(new DialogueCommand({type: 'down'}));
    }
  },
});
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/dialogueInputSystem.test.ts tests/Input.test.ts tests/inputSystem.test.ts && npm run typecheck`
Expected: PASS (the existing input tests confirm the new binding broke nothing), typecheck clean.

- [ ] **Step 5: Commit**

```powershell
git add source/game/input.ts source/game/dialogueInputSystem.ts tests/dialogueInputSystem.test.ts
git commit -m "Add the interact action and the dialogue input translator"
```

### Task 8: Movement lock (`playerSystem.ts`)

**Files:**
- Modify: `source/game/playerSystem.ts`
- Test: `tests/playerSystem.test.ts` (extend)

**Interfaces:**
- Consumes: `dialogueQuery`, `DialogueComponent` (Task 5).
- Produces: one early return; no API change. The lock also neutralizes view-level `move-to` taps during dialogue because the whole body is skipped.

- [ ] **Step 1: Extend the test file**

In `tests/playerSystem.test.ts`, add these imports:

```ts
import {Dialogue} from '../source/engine/dialogue/Dialogue.js';
import {DialogueComponent} from '../source/game/DialogueComponent.js';
import {dialogueQuery} from '../source/game/dialogueQuery.js';
import {flags} from '../source/game/flags.js';
```

Replace the `createWorld` helper with this version (the dialogue singleton is now a hard dependency of `playerSystem`; every existing test keeps passing because `active` starts null):

```ts
// cameraQuery/inputQuery/dialogueQuery/playerSystem are module singletons:
// every test must world.stop() so the next test can register them again.
function createWorld(state: FakeInputState) {
  let motion = new MotionComponent({position: new Vector(0, 0), velocity: new Vector(0, 0)});
  let player = new Entity({
    components: [
      new PlayerComponent({name: 'Test'}),
      motion,
      stubComponent(GraphicsComponent, {boundingBox: {x: 0, y: 10, width: 16, height: 10}}),
    ],
  });
  let inputEntity = new Entity({
    components: [new InputComponent({input: createFakeInput(state)})],
  });
  let camera = new Entity({components: [new CameraComponent({position: new Vector(100, 50)})]});
  let dialogueEntity = new Entity({components: [new DialogueComponent({active: null})]});
  let world = new World({
    onStart: (w) => {
      w.addEntityQuery(inputQuery)
        .addEntityQuery(cameraQuery)
        .addEntityQuery(dialogueQuery)
        .addSystem(playerSystem)
        .addEntity(inputEntity)
        .addEntity(camera)
        .addEntity(dialogueEntity)
        .addEntity(player);
    },
  });

  return {world, motion, dialogueComponent: dialogueEntity.getComponent(DialogueComponent)};
}
```

Add the new test at the end of the `describe('playerSystem', ...)` block:

```ts
  test('an active dialogue locks movement: keys and taps are ignored', () => {
    let {world, motion, dialogueComponent} = createWorld({
      heldActions: ['move-right'],
      pressedActions: ['move-to'],
      tapPosition: new Vector(10, 20),
    });

    world.start();
    dialogueComponent.active = new Dialogue({script: {start: {text: 'Hi.'}}, context: flags});
    world.update(tick());

    expect(motion.velocity.x).toBe(0);
    expect(motion.velocity.y).toBe(0);
    expect(motion.target).toBeUndefined();

    world.stop();
  });
```

- [ ] **Step 2: Run the test to verify the new case fails**

Run: `npx vitest run tests/playerSystem.test.ts`
Expected: the new test FAILS (velocity becomes MAX_SPEED, the lock does not exist yet); existing tests pass.

- [ ] **Step 3: Add the lock**

In `source/game/playerSystem.ts`, add imports:

```ts
import {DialogueComponent} from './DialogueComponent.js';
import {dialogueQuery} from './dialogueQuery.js';
```

Make the lock the first statement of `onUpdate` so it covers the whole body:

```ts
  onUpdate: (delta, system) => {
    // Dialogue movement lock, game policy: skipping the whole body also
    // neutralizes view-level move-to taps during dialogue. Velocity was
    // already zeroed by dialogueSystem on start.
    if (dialogueQuery.getFirst().getComponent(DialogueComponent).active !== null) {
      return;
    }

    let {input} = inputQuery.getFirst().getComponent(InputComponent);
    // ... (rest unchanged)
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/playerSystem.test.ts && npm run typecheck`
Expected: PASS, typecheck clean.

- [ ] **Step 5: Commit**

```powershell
git add source/game/playerSystem.ts tests/playerSystem.test.ts
git commit -m "Lock player movement while a dialogue is active"
```

### Task 9: The render system (`dialogueBoxSystem.ts`)

**Files:**
- Create: `source/game/dialogueBoxSystem.ts`
- Test: `tests/dialogueBoxSystem.test.ts`

**Interfaces:**
- Consumes: `DialogueBox`, `DialogueBoxNode` (Task 4), `Dialogue`'s read-only state (Task 2), Task 5's channel/command/query/component, `game` (screen size: `game.app.screen.width / game.pixelScale`), `assets`, `nineSlice` from `widgets.ts`, `playSoundChannel` + `PlaySound`, `cameraQuery`/`CameraComponent`, `MotionComponent`, `GraphicsComponent`, `TriggerComponent`.
- Produces: `const dialogueBoxSystem: System` (components `[TriggerComponent]`). Task 12 registers it after `graphicsSystem`.

Behavior contract:

- Owns a render layer attached to `World.view` lazily on first update (`map.view` is attached at world start, after every `addSystem`, so a container attached in `onAdd` would land underneath the map). The layer is screen-fixed for free: nothing translates `World.view`.
- Creates a `DialogueBox` when `active` flips non-null (tap and hover callbacks push channel commands) and destroys it when `active` clears. Portraits resolve through an existence probe with a loud warning and collapsed fallback.
- Syncs `showNode` on node or page change (also detected by a reveal-count decrease, which covers re-entering the same node), `setChoices` when choosing begins, `setSelected` on selection change, `setRevealed`/`setAdvanceMarker` per frame; passes `box.breaks` to `active.setBreaks` after `showNode` and `resize`; blinks the marker on accumulated world time (500 ms period, accumulator reset on box creation).
- Pushes `PlaySound({name: 'blip'})` per third newly revealed non-space glyph; a 4+ character frame is an advance-skip and plays at most one blip.
- Reads screen art-px dimensions each frame and calls `resize` on change.
- Draws one shared prompt-bubble sprite above the in-range NPC's head (position minus `cameraPosition` only; the layer is not inside `map.view`, so there is no map offset), visible while the player is inside an `npc` trigger and no dialogue is active; taps on it push `interact`; first match wins.
- `onRemove` destroys the box, the prompt and the layer and resets all module state: `World.view` is reused across runs and a mid-dialogue Quit must not orphan them.

- [ ] **Step 1: Write the failing test**

Create `tests/dialogueBoxSystem.test.ts`. The `game` module is mocked (its `app` getter throws before `Game.init`, which never runs headlessly); asset-dependent paths (box creation, prompt texture) are exercised by the manual harness checklist in Task 15, not here.

```ts
import type * as pixi from 'pixi.js';
import {afterEach, describe, expect, test, vi} from 'vitest';

import {Entity} from '../source/engine/ecs/Entity.js';
import {World} from '../source/engine/ecs/World.js';

vi.mock('../source/game/game.js', () => ({
  game: {app: {screen: {width: 480, height: 270}}, pixelScale: 2},
}));

const {DialogueComponent} = await import('../source/game/DialogueComponent.js');
const {dialogueBoxSystem} = await import('../source/game/dialogueBoxSystem.js');
const {dialogueQuery} = await import('../source/game/dialogueQuery.js');

function tick(deltaMS = 0): pixi.Ticker {
  return {deltaMS} as unknown as pixi.Ticker;
}

let activeWorld: World | null = null;

function createWorld() {
  let dialogueEntity = new Entity({components: [new DialogueComponent({active: null})]});
  let world = new World({
    onStart: (w) => {
      w.addEntityQuery(dialogueQuery).addSystem(dialogueBoxSystem).addEntity(dialogueEntity);
    },
  });

  activeWorld = world;

  return {world};
}

describe('dialogueBoxSystem', () => {
  afterEach(() => {
    activeWorld?.stop();
    activeWorld = null;
  });

  test('attaches its layer to the world view lazily on first update', () => {
    let {world} = createWorld();

    world.start();
    expect(world.view.children).toHaveLength(0); // nothing in onAdd

    world.update(tick());
    expect(world.view.children).toHaveLength(1);

    world.update(tick());
    expect(world.view.children).toHaveLength(1); // still one layer
  });

  test('onRemove destroys the layer and survives a rerun (World.view is reused)', () => {
    let {world} = createWorld();

    world.start();
    world.update(tick());

    let layer = world.view.children[0];

    world.stop();

    expect(world.view.children).toHaveLength(0);
    expect(layer?.destroyed).toBe(true);

    // A fresh run must re-create the layer from scratch.
    let second = createWorld();

    second.world.start();
    second.world.update(tick());
    expect(second.world.view.children).toHaveLength(1);
  });

  test('an update with no active dialogue and no npc in range creates no box', () => {
    let {world} = createWorld();

    world.start();
    world.update(tick());

    let layer = world.view.children[0] as pixi.Container;

    expect(layer.children).toHaveLength(0); // no box view, no prompt sprite
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/dialogueBoxSystem.test.ts`
Expected: FAIL - cannot resolve `../source/game/dialogueBoxSystem.js`.

- [ ] **Step 3: Write the implementation**

Create `source/game/dialogueBoxSystem.ts`:

```ts
import * as pixi from 'pixi.js';

import {PlaySound} from '../engine/audio/PlaySound.js';
import {DialogueBox} from '../engine/dialogue/DialogueBox.js';
import {type DialogueNode} from '../engine/dialogue/DialogueScript.js';
import {System} from '../engine/ecs/System.js';
import {assets} from './assets.js';
import {playSoundChannel} from './audio.js';
import {CameraComponent} from './CameraComponent.js';
import {cameraQuery} from './cameraQuery.js';
import {DialogueCommand} from './DialogueCommand.js';
import {DialogueComponent} from './DialogueComponent.js';
import {dialogueCommandChannel} from './dialogueCommandChannel.js';
import {dialogueQuery} from './dialogueQuery.js';
import {type Flags} from './flags.js';
import {game} from './game.js';
import {GraphicsComponent} from './GraphicsComponent.js';
import {MotionComponent} from './MotionComponent.js';
import {TriggerComponent} from './TriggerComponent.js';
import {nineSlice} from './widgets.js';

const MARKER_BLINK_MS = 500;
const BLIP_EVERY_GLYPHS = 3;
// A frame revealing this many characters is an advance-skip: one blip at most.
const SKIP_THRESHOLD = 4;

const BOX_METRICS = {
  margin: 4,
  padding: 3,
  gap: 3,
  portraitSize: 32,
  choiceGap: 2,
  choiceMinHeight: 10,
  height: 64,
  collapseWidth: 200,
};

// Module state, reset in onRemove (the world.ts mapEntity precedent).
let layer: pixi.Container | null = null;
let box: DialogueBox | null = null;
let prompt: pixi.Sprite | null = null;
let shownNode: DialogueNode<Flags, string> | null = null;
let shownPageIndex = -1;
let hasBuiltChoices = false;
let shownSelectedIndex = -1;
let lastRevealedCount = 0;
let blipGlyphCounter = 0;
let markerAccumulator = 0;
let lastScreenWidth = 0;
let lastScreenHeight = 0;

function resetSyncState(): void {
  shownNode = null;
  shownPageIndex = -1;
  hasBuiltChoices = false;
  shownSelectedIndex = -1;
  lastRevealedCount = 0;
  blipGlyphCounter = 0;
  markerAccumulator = 0;
  lastScreenWidth = 0;
  lastScreenHeight = 0;
}

function createBox(): DialogueBox {
  return new DialogueBox({
    panelBackground: () => nineSlice('banner'),
    choiceBackgrounds: () => ({
      normal: nineSlice('button-normal'),
      hovered: nineSlice('button-hovered'),
      active: nineSlice('button-active'),
      disabled: nineSlice('button-disabled'),
    }),
    font: {fontFamily: 'monogram', fontSize: 12, fill: 0xffffff},
    metrics: BOX_METRICS,
    markerTexture: assets.texture('ui', 'advance-marker'),
    onAdvanceTap: () => {
      dialogueCommandChannel.push(new DialogueCommand({type: 'advance'}));
    },
    onChooseTap: (index) => {
      dialogueCommandChannel.push(new DialogueCommand({type: 'choose', index}));
    },
    onChoiceHover: (index) => {
      dialogueCommandChannel.push(new DialogueCommand({type: 'select', index}));
    },
  });
}

function resolvePortrait(name: string | undefined): pixi.Texture | undefined {
  if (name === undefined) {
    return undefined;
  }

  // Existence probe: GameAssets.texture throws on a missing frame in dev and
  // prod alike, so the probe comes first; a miss warns loud and the box
  // renders collapsed.
  let sheet = pixi.Assets.get<pixi.Spritesheet | undefined>('portraits');
  let texture = sheet?.textures[name];

  if (texture === undefined) {
    // eslint-disable-next-line no-console -- loud show-time failure with a prod fallback (collapsed layout)
    console.warn(`Portrait "${name}" is missing from the portraits sheet! Rendering collapsed.`);

    return undefined;
  }

  return texture;
}

function countGlyphs(page: string, from: number, to: number): number {
  let count = 0;

  for (let index = from; index < to; index++) {
    let character = page[index];

    // Spaces never blip; the box's injected newlines replace spaces, so this
    // also covers them (counts run over the authored page text).
    if (character !== ' ' && character !== '\n') {
      count += 1;
    }
  }

  return count;
}

export const dialogueBoxSystem = new System({
  displayName: 'Dialogue box system',
  // The trigger entities: the set the interact prompt resolves against.
  components: [TriggerComponent],
  onUpdate: (ticker, system) => {
    let {active} = dialogueQuery.getFirst().getComponent(DialogueComponent);
    let screenWidth = game.app.screen.width / game.pixelScale;
    let screenHeight = game.app.screen.height / game.pixelScale;

    if (layer === null) {
      // Lazy: attached on first update so it lands above map.view, which is
      // added in world.onStart after every addSystem has run.
      layer = new pixi.Container();
      system.view.addChild(layer);
    }

    if (active === null) {
      if (box !== null) {
        box.destroy();
        box = null;
        resetSyncState();
      }

      // The prompt shows only while no dialogue is active.
      let npcEntity = null;

      for (let entity of system.entities) {
        let trigger = entity.getComponent(TriggerComponent);

        if (trigger.type === 'npc' && trigger.isPlayerInside === true) {
          npcEntity = entity; // several overlapping zones: first match wins

          break;
        }
      }

      if (npcEntity === null) {
        if (prompt !== null) {
          prompt.visible = false;
        }

        return;
      }

      let motion = npcEntity.getComponent(MotionComponent);
      let graphics = npcEntity.getComponent(GraphicsComponent);

      if (motion === undefined || graphics === undefined) {
        return; // not a renderable NPC; nothing to point at
      }

      if (prompt === null) {
        prompt = new pixi.Sprite({texture: assets.texture('prompt-bubble', 'bubble')});
        prompt.eventMode = 'static';
        prompt.cursor = 'pointer';
        prompt.on('pointertap', (event) => {
          event.stopPropagation();
          dialogueCommandChannel.push(new DialogueCommand({type: 'interact'}));
        });
        layer.addChild(prompt);
      }

      let {position: cameraPosition} = cameraQuery.getFirst().getComponent(CameraComponent);
      let {boundingBox} = graphics;

      // The layer is not inside map.view, so unlike graphicsSystem sprites
      // there is no map offset to subtract; camera only.
      prompt.visible = true;
      prompt.position.set(
        motion.position.x + boundingBox.x + boundingBox.width / 2 - prompt.width / 2 - cameraPosition.x,
        motion.position.y + boundingBox.y - prompt.height - 1 - cameraPosition.y,
      );

      return;
    }

    if (prompt !== null) {
      prompt.visible = false;
    }

    if (box === null) {
      box = createBox();
      layer.addChild(box.view);
      resetSyncState();
    }

    if (screenWidth !== lastScreenWidth || screenHeight !== lastScreenHeight) {
      lastScreenWidth = screenWidth;
      lastScreenHeight = screenHeight;
      box.resize(screenWidth, screenHeight);
      active.setBreaks(box.breaks);
    }

    // Node or page change; a reveal-count decrease covers re-entering the
    // same node (its object reference would not change).
    if (
      active.node !== shownNode ||
      active.pageIndex !== shownPageIndex ||
      active.revealedCount < lastRevealedCount
    ) {
      shownNode = active.node;
      shownPageIndex = active.pageIndex;
      hasBuiltChoices = false;
      shownSelectedIndex = -1;
      lastRevealedCount = 0;
      blipGlyphCounter = 0;
      box.showNode({
        speaker: active.node?.speaker,
        portraitTexture: resolvePortrait(active.node?.portrait),
        page: active.pageText,
      });
      active.setBreaks(box.breaks);
    }

    if (active.phase === 'choosing') {
      if (hasBuiltChoices) {
        if (shownSelectedIndex !== active.selectedIndex) {
          shownSelectedIndex = active.selectedIndex;
          box.setSelected(active.selectedIndex);
        }
      } else {
        hasBuiltChoices = true;
        shownSelectedIndex = active.selectedIndex;
        box.setChoices(
          active.visibleChoices.map((choice) => choice.text),
          active.selectedIndex,
        );
      }
    }

    let revealed = active.revealedCount;
    let newlyRevealed = revealed - lastRevealedCount;

    if (newlyRevealed > 0) {
      box.setRevealed(revealed);

      let glyphs = countGlyphs(active.pageText, lastRevealedCount, revealed);

      if (newlyRevealed >= SKIP_THRESHOLD) {
        // An advance-skip reveals a whole stretch in one frame: at most one blip.
        if (glyphs > 0) {
          playSoundChannel.push(new PlaySound({name: 'blip'}));
        }

        blipGlyphCounter = 0;
      } else {
        blipGlyphCounter += glyphs;

        if (blipGlyphCounter >= BLIP_EVERY_GLYPHS) {
          blipGlyphCounter %= BLIP_EVERY_GLYPHS;
          playSoundChannel.push(new PlaySound({name: 'blip'}));
        }
      }

      lastRevealedCount = revealed;
    }

    // Marker blink on accumulated world time; a paused world freezes it
    // because this system simply does not run.
    markerAccumulator += ticker.deltaMS;
    box.setAdvanceMarker(
      active.phase === 'idle' && Math.floor(markerAccumulator / MARKER_BLINK_MS) % 2 === 0,
    );
  },
  onRemove: (system) => {
    // World.view is reused across runs; a mid-dialogue Quit must not orphan
    // the layer, the box or the prompt. box.destroy detaches its view, so the
    // layer teardown never double-destroys it; the prompt dies with the layer.
    box?.destroy();
    box = null;
    prompt = null;

    if (layer !== null) {
      system.view.removeChild(layer);
      layer.destroy({children: true});
      layer = null;
    }

    resetSyncState();
  },
});
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/dialogueBoxSystem.test.ts && npm run typecheck`
Expected: PASS, typecheck clean.

- [ ] **Step 5: Commit**

```powershell
git add source/game/dialogueBoxSystem.ts tests/dialogueBoxSystem.test.ts
git commit -m "Add the dialogue box render system with prompt and blips"
```

### Task 10: The `npc` object factory (`objectFactories.ts`)

**Files:**
- Modify: `source/game/objectFactories.ts`
- Test: `tests/objectFactories.test.ts` (extend)

**Interfaces:**
- Consumes: `dialogueRegistry` (Task 5), `failUnsupported`, existing factory imports.
- Produces: `objectFactories.npc` building an entity with `TriggerComponent` (type `npc`, the Tiled rect as interaction zone), `MotionComponent` (zero velocity, sprite centered on the rect via `getPositionForBoundingBoxCenter`) and `GraphicsComponent` (the `npc` spritesheet under all eight clip names; bounding box 16x20).

- [ ] **Step 1: Extend the test file**

In `tests/objectFactories.test.ts`, generalize the asset stub so it serves both the `character` and `npc` sheets (replace `stubCharacterAsset` and its one call site; the animations bag shape is identical):

```ts
// playerPool and the npc factory build real Sprites from a spritesheet; a
// minimal animations bag satisfies the Sprite constructor for any sheet name.
function stubSpritesheetAssets() {
  let sheet = {
    animations: Object.fromEntries(SPRITE_NAMES.map((name) => [name, [pixi.Texture.WHITE]])),
  };

  vi.spyOn(pixi.Assets, 'get').mockImplementation((() => sheet) as never);
}
```

Update the factory-count test and add the npc cases:

```ts
  test('the record has exactly the four factories', () => {
    expect(Object.keys(objectFactories)).toEqual(['spawn', 'door', 'zone', 'npc']);
  });

  test('npc builds the trigger zone plus a sprite centered on the rect', () => {
    stubSpritesheetAssets();

    let npc = objectFactories.npc!(
      createObject({
        id: 9,
        name: 'mira',
        type: 'npc',
        x: 240,
        y: 176,
        width: 24,
        height: 28,
        properties: {dialogue: 'mira'},
      }),
    );
    let trigger = npc.getComponent(TriggerComponent);
    let motion = npc.getComponent(MotionComponent);

    expect(trigger.type).toBe('npc');
    expect(trigger.rect).toMatchObject({x: 240, y: 176, width: 24, height: 28});
    expect(trigger.properties).toEqual({dialogue: 'mira'});

    // Rect center (252, 190) minus the 16x20 box center offsets (8, 10).
    expect(motion.position.x).toBe(244);
    expect(motion.position.y).toBe(180);
    expect(motion.velocity.x).toBe(0);
    expect(motion.velocity.y).toBe(0);
  });

  test('npc with a missing dialogue property throws in DEV (spawns inert in prod)', () => {
    stubSpritesheetAssets();

    expect(() =>
      objectFactories.npc!(createObject({id: 9, name: 'mira', type: 'npc', properties: {}})),
    ).toThrow(/dialogue/);
  });

  test('npc with an unregistered dialogue name throws in DEV', () => {
    stubSpritesheetAssets();

    expect(() =>
      objectFactories.npc!(
        createObject({id: 9, name: 'mira', type: 'npc', properties: {dialogue: 'ghost'}}),
      ),
    ).toThrow(/unregistered/);
  });
```

Also rename the call in the existing spawn test from `stubCharacterAsset()` to `stubSpritesheetAssets()`. `MotionComponent` and `TriggerComponent` are already imported at the top of the file; no new imports are needed.

- [ ] **Step 2: Run the test to verify the new cases fail**

Run: `npx vitest run tests/objectFactories.test.ts`
Expected: the four new/updated tests FAIL (`npc` factory missing, key list is still three); the rest pass.

- [ ] **Step 3: Add the factory**

In `source/game/objectFactories.ts`, add imports:

```ts
import {failUnsupported} from '../engine/utilities/failUnsupported.js';
import {dialogueRegistry} from './dialogueRegistry.js';
import {GraphicsComponent} from './GraphicsComponent.js';
```

(`Entity`, `pixi`, `Vector`, `getPositionForBoundingBoxCenter`, `MotionComponent`, `TriggerComponent` are already imported.)

Add above the record:

```ts
// All eight names so graphicsSystem's directional sprite.show always
// resolves: the npc sheet lists its one frame under every clip name (the
// documented duplicated-clip-names workaround until T1.3); the zero-velocity
// path shows 'standing-right'.
const NPC_SPRITE_NAMES = [
  'standing-down',
  'walking-down',
  'standing-left',
  'walking-left',
  'standing-up',
  'walking-up',
  'standing-right',
  'walking-right',
] as const;

// The npc placeholder frame is 16x20 (see public/npc.json).
const NPC_WIDTH = 16;
const NPC_HEIGHT = 20;
```

Add the `npc` entry to `objectFactories` (after `zone`):

```ts
  npc: (object) => {
    // The Tiled rect is the interaction zone; the sprite renders at its
    // center. Validation is spawn-time and loud (the door-target precedent):
    // a bad dialogue name leaves the NPC inert; dialogueSystem re-checks at
    // start and no-ops, so an inert NPC can never start a script.
    let {dialogue} = object.properties;

    if (typeof dialogue !== 'string' || !Object.hasOwn(dialogueRegistry, dialogue)) {
      failUnsupported(
        `NPC "${object.name}" (id ${object.id}) has a missing or unregistered "dialogue" property! Register the script in dialogueRegistry or fix the property in Tiled. The NPC is inert.`,
      );
    }

    let entity = new Entity({
      components: [
        new TriggerComponent({
          id: object.id,
          name: object.name,
          type: object.type,
          rect: new pixi.Rectangle(object.x, object.y, object.width, object.height),
          properties: object.properties,
        }),
        new MotionComponent({position: new Vector(0, 0), velocity: new Vector(0, 0)}),
        new GraphicsComponent({
          spriteOptions: {assetName: 'npc', spriteNames: [...NPC_SPRITE_NAMES]},
          boundingBox: new pixi.Rectangle(0, 0, NPC_WIDTH, NPC_HEIGHT),
        }),
      ],
    });
    let position = getPositionForBoundingBoxCenter(
      new Vector(object.x + object.width / 2, object.y + object.height / 2),
      entity.getComponent(GraphicsComponent).boundingBox,
    );

    entity.getComponent(MotionComponent).position.set(position.x, position.y);

    return entity;
  },
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/objectFactories.test.ts tests/worldSpawn.test.ts && npm run typecheck`
Expected: PASS, typecheck clean.

- [ ] **Step 5: Commit**

```powershell
git add source/game/objectFactories.ts tests/objectFactories.test.ts
git commit -m "Add the npc object factory with spawn-time dialogue validation"
```

### Task 11: Persist flags in the save blob (`save.ts`)

**Files:**
- Modify: `source/game/save.ts`
- Test: `tests/save.test.ts` (extend and update)

**Interfaces:**
- Consumes: `flags`, `type Flags` (Task 5).
- Produces: `saveSchema` grows `flags: z.object({metMira: z.boolean()})`; `writeSave` captures a copy of `flags`; `applyStagedSave` restores it. An old save failing the extended schema resets to defaults (documented policy). Mid-dialogue state is never persisted; completion flags go on terminal nodes' `onEnter` (authoring rule, Task 5's `goodbye` node follows it).

- [ ] **Step 1: Update the test file**

In `tests/save.test.ts`:

Add imports:

```ts
import {flags, resetFlags} from '../source/game/flags.js';
```

Add `resetFlags()` to the `afterEach`:

```ts
  afterEach(() => {
    clearStagedSave();
    resetFlags();
    localStorage.clear();
    activeWorld?.stop();
    activeWorld = null;
  });
```

Update every stored/expected payload to carry flags. Exact replacements:

- In `writeSave writes the player position...`: both assertions become

```ts
    expect(JSON.parse(localStorage.getItem(SAVE_KEY) ?? '')).toEqual({
      player: {x: 42, y: 27},
      flags: {metMira: false},
    });
    expect(loadSave()).toEqual({player: {x: 42, y: 27}, flags: {metMira: false}});
```

- In `writeSave works on a paused world`:

```ts
    expect(loadSave()).toEqual({player: {x: 3, y: 4}, flags: {metMira: false}});
```

- In `stageContinue then applyStagedSave...` and `clearStagedSave prevents a later apply`, the seeded payloads become:

```ts
    localStorage.setItem(SAVE_KEY, JSON.stringify({player: {x: 5, y: 6}, flags: {metMira: false}}));
```

Add two new tests at the end of the describe block:

```ts
  test('flags round-trip through the save blob', () => {
    let {world} = createWorld(1, 2);

    world.start();
    flags.metMira = true;
    writeSave();

    resetFlags();
    stageContinue();
    applyStagedSave();

    expect(flags.metMira).toBe(true);
  });

  test('an old save without flags is schema-rejected and resets', () => {
    let warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    localStorage.setItem(SAVE_KEY, JSON.stringify({player: {x: 5, y: 6}}));

    expect(loadSave()).toBeNull();

    warn.mockRestore();
  });
```

- [ ] **Step 2: Run the test to verify the new expectations fail**

Run: `npx vitest run tests/save.test.ts`
Expected: FAIL - stored payloads lack `flags`, the schema does not know the field yet.

- [ ] **Step 3: Extend the schema and the capture/apply paths**

In `source/game/save.ts`:

Add the import:

```ts
import {flags} from './flags.js';
```

Extend the schema (keep the existing comment above `player`):

```ts
const saveSchema = z.object({
  // Art px (the pixelScale transform lives on the root container), so a saved
  // position is device-independent across per-device pixel scales. A
  // hand-edited save can place the player out of bounds; accepted — zod 4
  // numbers are finite-only, the camera clamps to the map, and the worst case
  // is walking back out.
  player: z.object({x: z.number(), y: z.number()}),
  // Dialogue flags. Mid-dialogue state is never persisted: completion flags
  // go on terminal nodes' onEnter, so quitting mid-conversation only loses
  // what was not reached, never records what did not happen.
  flags: z.object({metMira: z.boolean()}),
});
```

In `writeSave`, capture a copy:

```ts
export function writeSave(): void {
  let {position} = playersQuery.getFirst().getComponent(MotionComponent);

  saveStore.save({player: {x: position.x, y: position.y}, flags: {...flags}});
}
```

In `applyStagedSave`, restore before consuming the stage:

```ts
export function applyStagedSave(): void {
  if (stagedSave === null) {
    return;
  }

  let {position} = playersQuery.getFirst().getComponent(MotionComponent);

  position.set(stagedSave.player.x, stagedSave.player.y);
  Object.assign(flags, stagedSave.flags);
  stagedSave = null;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/save.test.ts && npm run typecheck`
Expected: PASS, typecheck clean.

- [ ] **Step 5: Commit**

```powershell
git add source/game/save.ts tests/save.test.ts
git commit -m "Persist dialogue flags through the save blob"
```

### Task 12: World wiring (`world.ts`)

**Files:**
- Modify: `source/game/world.ts`
- Test: `tests/worldSpawn.test.ts` (extend)

**Interfaces:**
- Consumes: everything from Tasks 5-9.
- Produces: registered channel/query/entity/systems in the load-bearing order. The ordering comments are part of the deliverable (the existing convention).

- [ ] **Step 1: Extend the test file**

In `tests/worldSpawn.test.ts`, add imports:

```ts
import {Dialogue} from '../source/engine/dialogue/Dialogue.js';
import {dialogueEntity} from '../source/game/dialogue.js';
import {DialogueComponent} from '../source/game/DialogueComponent.js';
import {flags} from '../source/game/flags.js';
```

Add a test at the end of the describe block:

```ts
  test('world start resets flags and clears a leftover active dialogue', () => {
    stubAssets([spawnObject()]);

    // Module state outliving the previous run: a finished playthrough set the
    // flag, a mid-dialogue Quit left the runner assigned.
    flags.metMira = true;
    dialogueEntity.getComponent(DialogueComponent).active = new Dialogue({
      script: {start: {text: 'stale'}},
      context: flags,
    });

    world.start();

    expect(flags.metMira).toBe(false);
    expect(dialogueEntity.getComponent(DialogueComponent).active).toBeNull();
  });
```

- [ ] **Step 2: Run the test to verify the new case fails**

Run: `npx vitest run tests/worldSpawn.test.ts`
Expected: the new test FAILS (nothing resets flags or `active` yet); the rest pass.

- [ ] **Step 3: Wire the world**

In `source/game/world.ts`:

Add imports (alphabetical among the existing game imports):

```ts
import {dialogueEntity} from './dialogue.js';
import {dialogueBoxSystem} from './dialogueBoxSystem.js';
import {dialogueCommandChannel} from './dialogueCommandChannel.js';
import {DialogueComponent} from './DialogueComponent.js';
import {dialogueInputSystem} from './dialogueInputSystem.js';
import {dialogueQuery} from './dialogueQuery.js';
import {dialogueSystem} from './dialogueSystem.js';
import {resetFlags} from './flags.js';
```

At the top of `onStart`, before the channel registrations, reset the run-scoped module state (New Game starts clean; `applyStagedSave` runs later, in `gameScreen.onShow`, and restores Continue's values):

```ts
  onStart: (world) => {
    camera.getComponent(CameraComponent).position.set(0, 0);

    // Module state outlives the world: flags reset to defaults before
    // applyStagedSave runs, and a mid-dialogue Quit left `active` set on the
    // singleton that outlives the run.
    resetFlags();
    dialogueEntity.getComponent(DialogueComponent).active = null;
```

Register the channel and the query with their siblings:

```ts
    world.addEventChannel(triggerExitChannel);
    world.addEventChannel(dialogueCommandChannel);

    world.addEntityQuery(cameraQuery);
    world.addEntityQuery(dialogueQuery);
```

Update the system block; the three new lines carry their ordering comments:

```ts
    world.addSystem(inputSystem); // first: every system this frame reads the same freshly-advanced input
    world.addSystem(dialogueInputSystem); // right after inputSystem: translates the freshly advanced edges into commands
    world.addSystem(dialogueSystem); // before playerSystem: starts/advances on last frame's commands and enters, ticks, and playerSystem sees `active` and locks the same frame
    world.addSystem(mapSystem);
    world.addSystem(playerSystem); // before motionSystem: it writes velocity that motionSystem consumes this frame
    world.addSystem(motionSystem);
    world.addSystem(triggerSystem); // right after motionSystem: overlap tests read the just-resolved position
    world.addSystem(doorSystem); // consumes last frame's trigger enters (buffered, one-frame delay)
    world.addSystem(zoneSystem); // like doorSystem: last frame's enters, before wallHitPopupSystem
    world.addSystem(wallHitPopupSystem); // spawn popups from the previous frame's wall hits
    world.addSystem(audioSystem); // placement is free: PlaySound events are buffered, seen next frame
    world.addSystem(popupCleanupSystem); // remove popups whose lifetime timer has expired
    world.addSystem(timerSystem); // placement is free: timer events are buffered, seen next frame
    world.addSystem(uiBridge);
    world.addSystem(cameraSystem);
    world.addSystem(tweenSystem); // late, just before graphicsSystem: scripted motion is the last word
    world.addSystem(graphicsSystem);
    world.addSystem(dialogueBoxSystem); // after graphicsSystem: renders the just-ticked dialogue state into its own layer above the map
```

Add the entity with its siblings:

```ts
    world.addEntity(camera);
    world.addEntity(inputEntity);
    world.addEntity(audioEntity);
    world.addEntity(dialogueEntity);
```

- [ ] **Step 4: Run the full suite**

Run: `npm test && npm run typecheck`
Expected: PASS. `worldSpawn` covers the spawn loop against the real `world` including the new systems; `pauseFlow`, `uiBridge` and `graphicsSystem` suites confirm nothing regressed.

- [ ] **Step 5: Commit**

```powershell
git add source/game/world.ts tests/worldSpawn.test.ts
git commit -m "Wire the dialogue systems, channel and singleton into the world"
```

### Task 13: Assets and generators

**Files:**
- Modify: `scripts/generate-ui-atlas.mjs` (advance-marker frame), `scripts/generate-placeholder-audio.mjs` (blip.wav), `source/game/assets.ts`
- Create: `scripts/generate-dialogue-assets.mjs`
- Generated: `public/ui.png`, `public/ui.json`, `public/blip.wav`, `public/portraits.png`, `public/portraits.json`, `public/npc.png`, `public/npc.json`, `public/prompt-bubble.png`, `public/prompt-bubble.json`

**Interfaces:**
- Consumes: the existing generator idioms (`renderCells`, shelf packing, `blip()` helper, the `spark` sheet pattern).
- Produces: `assets.texture('ui', 'advance-marker')` (default bundle: box chrome), `assets.texture('portraits', 'mira')`, the `npc` spritesheet (its one frame under all eight clip names), `assets.texture('prompt-bubble', 'bubble')` and the `blip` sound, all in the `game` bundle except the marker. Tasks 9 and 10 reference these names at runtime.

- [ ] **Step 1: Add the advance-marker frame to the UI atlas**

In `scripts/generate-ui-atlas.mjs`, add after `buildRing()`:

```js
// Advance marker: a 5×3 down-pointing triangle; dialogue box chrome, so it
// ships in the ui sheet (default bundle) like the other widget art.
function buildMarker() {
  let cells = [];

  for (let row = 0; row < 3; row++) {
    let cols = [];

    for (let col = 0; col < 5; col++) {
      cols.push(col >= row && col <= 4 - row ? palette.icon : palette.transparent);
    }

    cells.push(cols);
  }

  return cells;
}
```

And add the frame at the end of the `frames` array, after the `focus-ring` entry:

```js
  {name: 'advance-marker', image: renderCells(buildMarker())},
```

- [ ] **Step 2: Add the blip to the audio generator**

In `scripts/generate-placeholder-audio.mjs`, add to the `files` record after `'bump.wav'`:

```js
  // Typewriter blip: short and quiet; it fires on every third revealed glyph.
  'blip.wav': blip({freq: 990, ms: 30, volume: 0.25}),
```

- [ ] **Step 3: Write the dialogue asset generator**

Create `scripts/generate-dialogue-assets.mjs`:

```js
// Generates placeholder dialogue art at 1 art px:
//   public/portraits.png + portraits.json  - one 32x32 'mira' frame
//   public/npc.png + npc.json              - one 16x20 frame under all eight
//                                            clip names (the spark-sheet
//                                            workaround until T1.3)
//   public/prompt-bubble.png + prompt-bubble.json - one 8x8 'bubble' frame
// Hand-authored art can overwrite the same files later; no code changes.
//
// Idempotent — re-running overwrites the files with identical bytes.
// Usage: node scripts/generate-dialogue-assets.mjs
import {encode} from 'fast-png';
import {writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

const CHANNELS = 4; // RGBA

let publicDir = fileURLToPath(new URL('../public/', import.meta.url));

const palette = {
  outline: [34, 32, 52, 255],
  skin: [238, 195, 154, 255],
  hair: [102, 57, 49, 255],
  shirt: [63, 118, 86, 255],
  bubble: [233, 234, 238, 255],
};

function createImage(width, height) {
  return {width, height, data: new Uint8Array(width * height * CHANNELS)};
}

function fillRect(image, x, y, width, height, color) {
  for (let row = y; row < y + height; row++) {
    for (let col = x; col < x + width; col++) {
      image.data.set(color, (row * image.width + col) * CHANNELS);
    }
  }
}

function writeSheet(name, image, json) {
  writeFileSync(join(publicDir, `${name}.png`), encode({...image, channels: CHANNELS}));
  writeFileSync(join(publicDir, `${name}.json`), `${JSON.stringify(json, null, 2)}\n`);
  // eslint-disable-next-line no-console -- one-shot generator script feedback
  console.log(`wrote public/${name}.png (${image.width}x${image.height}) and public/${name}.json`);
}

// Portrait: a framed bust, enough to read as a face at 32x32.
let portrait = createImage(32, 32);

fillRect(portrait, 0, 0, 32, 32, palette.outline);
fillRect(portrait, 1, 1, 30, 30, palette.shirt);
fillRect(portrait, 6, 4, 20, 10, palette.hair);
fillRect(portrait, 8, 10, 16, 14, palette.skin);
fillRect(portrait, 12, 16, 2, 2, palette.outline);
fillRect(portrait, 18, 16, 2, 2, palette.outline);
fillRect(portrait, 13, 21, 6, 1, palette.outline);

writeSheet('portraits', portrait, {
  frames: {mira: {frame: {x: 0, y: 0, w: 32, h: 32}}},
  meta: {image: 'portraits.png'},
});

// NPC: a 16x20 villager silhouette, character-sheet footprint.
let npc = createImage(16, 20);

fillRect(npc, 4, 0, 8, 4, palette.hair);
fillRect(npc, 4, 4, 8, 6, palette.skin);
fillRect(npc, 5, 6, 2, 1, palette.outline);
fillRect(npc, 9, 6, 2, 1, palette.outline);
fillRect(npc, 3, 10, 10, 8, palette.shirt);
fillRect(npc, 5, 18, 2, 2, palette.outline);
fillRect(npc, 9, 18, 2, 2, palette.outline);

let npcSpriteNames = [
  'standing-down',
  'walking-down',
  'standing-left',
  'walking-left',
  'standing-up',
  'walking-up',
  'standing-right',
  'walking-right',
];

writeSheet('npc', npc, {
  frames: {1: {frame: {x: 0, y: 0, w: 16, h: 20}}},
  meta: {image: 'npc.png'},
  animations: Object.fromEntries(npcSpriteNames.map((name) => [name, ['1']])),
});

// Prompt bubble: an 8x8 speech bubble with a tail and a dot.
let bubble = createImage(8, 8);

fillRect(bubble, 0, 0, 8, 6, palette.outline);
fillRect(bubble, 1, 1, 6, 4, palette.bubble);
fillRect(bubble, 3, 2, 2, 2, palette.outline);
fillRect(bubble, 3, 6, 2, 1, palette.outline);

writeSheet('prompt-bubble', bubble, {
  frames: {bubble: {frame: {x: 0, y: 0, w: 8, h: 8}}},
  meta: {image: 'prompt-bubble.png'},
});
```

- [ ] **Step 4: Run the generators**

```powershell
node scripts/generate-ui-atlas.mjs
node scripts/generate-placeholder-audio.mjs
node scripts/generate-dialogue-assets.mjs
```

Expected output includes `advance-marker` in the ui frame count (16 frames), `wrote public/blip.wav`, and the three `wrote public/...` lines from the new script. Verify: `Get-ChildItem public | Where-Object Name -Match 'portraits|npc|prompt-bubble|blip'` lists all six new files.

- [ ] **Step 5: Register the assets in the manifest**

In `source/game/assets.ts`, extend the `game` bundle (the ui sheet and its new frame are already covered by the `default` bundle entry):

```ts
    {
      name: 'game',
      spritesheets: {
        character: ['character.json'],
        spark: ['spark.json'],
        portraits: ['portraits.json'],
        npc: ['npc.json'],
        'prompt-bubble': ['prompt-bubble.json'],
      },
      tilemaps: {map: ['map.json']},
      sounds: {
        bump: ['bump.wav'],
        chime: ['chime.wav'],
        blip: ['blip.wav'],
        'game-music': ['game-music.wav'],
      },
    },
```

- [ ] **Step 6: Run the suite and commit**

Run: `npm test && npm run typecheck`
Expected: PASS (`GameAssets`/`Game` suites confirm the manifest still loads).

```powershell
git add scripts/generate-ui-atlas.mjs scripts/generate-placeholder-audio.mjs scripts/generate-dialogue-assets.mjs source/game/assets.ts public/ui.png public/ui.json public/blip.wav public/portraits.png public/portraits.json public/npc.png public/npc.json public/prompt-bubble.png public/prompt-bubble.json
git commit -m "Add dialogue placeholder assets, the advance marker and the blip"
```

### Task 14: Map content (Mira and the sign)

**Files:**
- Modify: `assets/map.tmx`
- Regenerate: `public/map.json` (via `npm run export-assets`, needs the Tiled binary; `TILED_PATH` if not on PATH)

**Interfaces:**
- Consumes: the `npc` factory (Task 10), the `sign` registry key (Task 5), the export script.
- Produces: two new Tiled objects the spawn loop dispatches at world start.

- [ ] **Step 1: Add the objects to the TMX**

In `assets/map.tmx`, inside `<objectgroup id="5" name="objects">`, add after the `chime-zone` object (before `</objectgroup>`):

```xml
  <object id="5" name="mira" type="npc" x="240" y="176" width="24" height="28">
   <properties>
    <property name="dialogue" value="mira"/>
   </properties>
  </object>
  <object id="6" name="keep-out-sign" type="zone" x="176" y="160" width="16" height="8">
   <properties>
    <property name="dialogue" value="sign"/>
   </properties>
  </object>
```

And bump the map attribute `nextobjectid="5"` to `nextobjectid="7"`.

Placement rules (verify visually in Tiled before exporting): Mira's rect is her interaction zone, keep it in open ground near the spawn at (152, 175) and clear of the doors; the sign zone must sit flush against the wall it labels, never across a walking path, because auto-start locks movement and a zone brushed mid-walk reads as a trap. The coordinates above put the sign directly above `door-hut` (176, 176); if that tile is walk-through on the current map art, slide the zone against the nearest wall face instead.

- [ ] **Step 2: Re-export**

Run: `npm run export-assets` (set `TILED_PATH` to the Tiled executable if it is not on PATH; the script also probes `%ProgramFiles%\Tiled\tiled.exe`).
Expected: the script rewrites `public/map.json` and `public/tileset.json` and its trailing vitest guard passes.

The export guard does not validate object types or properties, so eyeball `public/map.json`: the objects layer must now contain `mira` (type `npc`, a `dialogue` property with value `mira`) and `keep-out-sign` (type `zone`, `dialogue` = `sign`).

If Tiled is unavailable in this environment, stop and report it; do not hand-edit `public/map.json` (the TMX and the export must stay in sync).

- [ ] **Step 3: Run the suite**

Run: `npm test`
Expected: PASS, including `tests/exportedAssets.test.ts` against the regenerated map.

- [ ] **Step 4: Commit**

```powershell
git add assets/map.tmx public/map.json public/tileset.json
git commit -m "Place Mira and the keep-out sign on the map"
```

### Task 15: Full verification and manual acceptance

**Files:**
- No new files; runs the gates and the spec's acceptance walk.

- [ ] **Step 1: Run every gate**

```powershell
npm test
npm run typecheck
npm run lint
```

Expected: all clean. Fix import-order or style complaints with `npx eslint --fix <files>` and re-run.

- [ ] **Step 2: Review the diff**

Run: `git log --oneline development..HEAD` and `git diff development --stat`
Expected: only the files this plan names; no stray edits, no deleted comments.

- [ ] **Step 3: Manual acceptance walk**

Run: `npm run develop` and open `http://localhost:5000`. Walk the spec's acceptance list:

- Approach Mira: the prompt bubble appears above her head; walk away: it hides.
- Start with E: the first line types out; the starting press must not skip it. Start via tapping the bubble works the same.
- The world stays live during dialogue (animated tiles keep animating) while the player is locked (WASD and click-to-move do nothing).
- Text types with blips (no blip burst on an advance-skip); the advance marker blinks at rest.
- E skips the reveal, then turns pages (`tour` has two).
- Choices: W/S move the `▶` selection, mouse hover moves it too, E confirms the hovered row, tapping a choice confirms directly, tapping the text panel while choosing does nothing.
- The 'Maybe later.' branch plays its inline tail; the tour branch reaches `goodbye` and flips `metMira`.
- Talking to Mira again greets with 'Back already?'.
- The sign zone auto-shows the collapsed box (no portrait, no name) without sliding the player through it; leaving and re-entering re-shows it.
- Pause mid-typewriter: the reveal, blips and marker blink freeze; resume continues typing.
- Pause, Save, Quit to menu, Continue: `metMira` survives; New Game greets fresh.
- Resize the window mid-dialogue: the box re-wraps, nothing clips, the reveal continues.
- On a phone (or devtools portrait emulation at ~135 art px width): the box collapses, the whole flow works tap-only, choices are comfortably tappable.

- [ ] **Step 4: Finish the branch**

All gates green and the walk clean: the feature is complete on `somewhere-update`. Use the superpowers:finishing-a-development-branch skill to decide merge/PR/cleanup (the PR base is `development`).

---

## Plan self-review notes

Checked against the spec section by section:

- §1 authoring format → Task 1 (types verbatim, NoInfer fixtures committed).
- §2 runner → Task 2 (all listed semantics have tests; `RunnableDialogueScript` is the runtime-facing script type).
- §3 ECS integration → Tasks 5, 6, 12 (singleton, channel vocabulary, one deciding consumer, motion clear on both paths, same-frame tick, silent stale drops, pause-for-free).
- §4 box → Tasks 3, 4 (change-detection contract, windowing breaks, length-preserving wrap, tap surfaces, prefix selection, bottom-bar positioning, resize re-wrap).
- §5 input → Task 7 (KeyE only, edge translation, pointer paths in Task 9) and Task 8 (lock).
- §6 game wiring → Tasks 5, 9, 10, 12 (registry, npc factory validation, box system layer/prompt/blips/resize, world ordering with comments).
- §7 persistence → Task 11 plus the world-start reset in Task 12.
- §8 errors → compile-time (Task 1 fixtures), spawn-time (Task 10), show-time portrait probe (Task 9), runner DEV-throws (Task 2), wrap overflow (Task 3), silent stale commands (Task 6).
- §9 testing → every listed suite exists; the box system's asset-dependent paths (box creation, prompt rendering, blip cadence) are covered by the Task 15 manual walk because they need loaded atlases and an initialized Game.
- §10 demo → Tasks 13, 14, 15.

Known intentional deltas from the spec's sketch (see "Design decisions locked into this plan"): `showNode` takes `page`, the runner drops `TNodeId`, `DialogueBox` gains `measure` and `isCollapsed`.

