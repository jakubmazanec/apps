# Pixel Scale from Width and Height Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tellurion's `getPixelScale` counts the width of the screen as well as its height, so that
a phone held upright shows about 200 art pixels across.

**Architecture:** One pure helper changes its signature from `(height)` to `(width, height)`, and the
one line of `Game` that calls it passes both sizes of the window. The scale is still chosen once,
when `Game` is constructed.

**Tech Stack:** TypeScript, Pixi.js 8, Vitest 4 (a `unit` project in Node and a `browser` project in
Playwright's Chromium), Turborepo.

**Spec:** `docs/superpowers/specs/2026-10-05-pixel-scale-design.md`

## Global Constraints

- Only files under `packages/tellurion/` change. Nothing under `apps/somewhere/` or `apps/foam/`
  changes.
- The rule: `Math.round(Math.min(width / 200, height / 270))`, then kept between 2 and 8. The two
  numbers are module constants `TARGET_WIDTH = 200` and `TARGET_HEIGHT = 270` inside
  `getPixelScale.ts`. No option on `Game`.
- `getPixelScale(width: number, height: number): number`, both in device pixels, in that order. It
  stays exported from `source/main.ts` (it already is).
- `Game.pixelScale` stays a `readonly` field, set once from
  `window.innerWidth * window.devicePixelRatio` and `window.innerHeight * window.devicePixelRatio`.
  `init()`, `mount()`, `adoptResize()`, the CRT filter and `GameInput` do not change.
- Work on the current branch, `somewhere-update`. Commit at the end of each task; a commit message is
  one short imperative sentence, with no prefix and no trailer lines.
- Code style of the repository: `let` for locals, `const` only at module level; relative imports end
  in `.js`; comments say why and stay within 100 columns.
- Tests use the `vitest` object (`vitest.fn`, `vitest.spyOn`), not `vi`. A `describe` named after a
  function takes the function: `describe(getPixelScale, …)`.

## Review Focus

- **A screen exactly at a rounding edge** (a ratio of x.5): `Math.round` rounds half up, so 1100 ×
  2100 (5.5) gives 6. Pinned in Task 1.
- **The test browser's own window is 414 × 896.** Any engine test that expects a scale from the
  height alone now gets the width's answer (2 instead of 3). The "Game scaled root" block is the
  known case (Task 1); a run of the whole browser project in Task 1 catches any other.
- **A window narrower than 300 device pixels** keeps scale 2 and fewer than 200 art pixels across.
  This is accepted by the spec; the clamp test (a tiny screen gives 2) pins it.
- **A wide screen is unchanged.** 1920 × 1080 gives 4 and 1366 × 768 gives 3, as before. Pinned in
  Task 1, so Somewhere's desktop look cannot move.

---

### Task 1: The helper counts the width

**Files:**

- Modify: `packages/tellurion/source/app/getPixelScale.ts`
- Modify: `packages/tellurion/source/app/Game.ts:35-36` (the `pixelScale` field)
- Modify (rewrite): `packages/tellurion/tests/getPixelScale.test.ts`
- Modify: `packages/tellurion/tests/Game.browser.test.ts:869-913` (the "Game pixelScale" and "Game
  scaled root" blocks)
- Modify: `packages/tellurion/tests/DialogueBoxLayout.browser.test.ts:108-109` (comment only)
- Modify: `packages/tellurion/tests/DialogueBoxReveal.browser.test.ts:21-22` (comment only)

The helper and its caller change together: between them the engine would not compile.

**Interfaces:**

- Produces: `getPixelScale(width: number, height: number): number`, exported from `tellurion`. The
  Foam look plan relies on the scale this gives (2 for a 292 × 524 or 960 × 540 window at DPR 1).

- [ ] **Step 1: Rewrite the unit tests for two arguments**

`packages/tellurion/tests/getPixelScale.test.ts`, inside `describe(getPixelScale, …)`:

```ts
test('gives 4 on a 1920 × 1080 screen', () => {
  expect(getPixelScale(1920, 1080)).toBe(4);
});

test('lets the height decide on a wide screen', () => {
  expect(getPixelScale(1366, 768)).toBe(3); // 6.83 and 2.84
  expect(getPixelScale(1100, 620)).toBe(2); // 5.5 and 2.30
});

test('lets the width decide on a tall screen', () => {
  expect(getPixelScale(1170, 2100)).toBe(6); // 5.85 and 7.78
  expect(getPixelScale(1081, 2402)).toBe(5); // 5.41 and 8.9
  expect(getPixelScale(720, 1280)).toBe(4); // 3.6 and 4.74
});

test('rounds to the nearest whole number', () => {
  expect(getPixelScale(1100, 2100)).toBe(6); // 5.5
  expect(getPixelScale(1090, 2100)).toBe(5); // 5.45
});

test('keeps a tiny screen at 2', () => {
  expect(getPixelScale(200, 200)).toBe(2);
});

test('keeps a huge screen at 8', () => {
  expect(getPixelScale(7680, 4320)).toBe(8);
});
```

- [ ] **Step 2: Run the unit tests and see them fail**

Run: `cd packages/tellurion && npx vitest run --project unit tests/getPixelScale.test.ts`
Expected: FAIL. Typecheck is not part of vitest, so the one-argument helper runs and the tall-screen
and rounding tests fail (for example, `expected 8 to be 6`).

- [ ] **Step 3: Implement `getPixelScale(width, height)` and pass the width in `Game`**

In `getPixelScale.ts`: the two constants, the comment above them as the spec words it ("The screen
shows about this many art pixels across and about this many down, or more in one of the two
directions."), and a doc comment that replaces `/** TBD */`, naming 1920 × 1080 → 4 and an upright
phone at 1170 × 2100 → 6. The old comment about 270 art pixels goes.

In `Game.ts`, the field becomes:

```ts
/** Integer representing how much is the rendering scaled up. */
readonly pixelScale: number = getPixelScale(
  window.innerWidth * window.devicePixelRatio,
  window.innerHeight * window.devicePixelRatio,
);
```

- [ ] **Step 4: Run the unit tests and see them pass**

Run: `cd packages/tellurion && npx vitest run --project unit tests/getPixelScale.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Update the `Game` browser tests**

In `tests/Game.browser.test.ts`:

- The test "init derives pixelScale from the device-px viewport height" is renamed to "init derives
  pixelScale from the device-px viewport size", and its assertion becomes
  `expect(game.pixelScale).toBe(getPixelScale(window.innerWidth * window.devicePixelRatio, window.innerHeight * window.devicePixelRatio))`.
- The "Game scaled root" block also saves `window.innerWidth` in `beforeEach`, sets it to `1920`,
  and restores it in `afterEach`, next to `innerHeight`. Its comment is reworded to say that it pins
  a 1920 × 1080 window, which gives scale 4, because the test browser's own window is 414 wide and
  would give 2. The tests inside keep their expectations (scale 4; 200 × 150 art pixels for an
  element of 800 × 600).

- [ ] **Step 6: Reword the two dialogue box comments**

In `DialogueBoxLayout.browser.test.ts` and `DialogueBoxReveal.browser.test.ts`, the comment that
calls 135 art pixels "a Pixel-class phone at pixelScale 8" says instead that it is a screen 135 art
pixels wide, below `collapseWidth`. The constants do not change.

- [ ] **Step 7: Run the engine's whole test suite, typecheck and lint**

Run: `npx turbo run typecheck lint test --filter=tellurion --concurrency=1` (from the repository
root).
Expected: all three tasks succeed. The browser project includes every engine test that runs at the
test browser's default 414 × 896, where the scale is now 2 instead of 3; the spec found no assertion
that depends on it. If one fails, it is in scope: fix the test's setup (pin the window size, as in
Step 5), never the rule.

- [ ] **Step 8: Commit**

```bash
git add packages/tellurion/source/app/getPixelScale.ts packages/tellurion/source/app/Game.ts \
  packages/tellurion/tests/getPixelScale.test.ts packages/tellurion/tests/Game.browser.test.ts \
  packages/tellurion/tests/DialogueBoxLayout.browser.test.ts \
  packages/tellurion/tests/DialogueBoxReveal.browser.test.ts
git commit -m "Let the pixel scale count the width of the screen"
```

### Task 2: Check both games against the new rule

**Files:** none change. This task only verifies.

- [ ] **Step 1: Build Tellurion and run the three packages**

Run: `npx turbo run build --filter=tellurion && npx turbo run typecheck lint test --filter=tellurion --filter=somewhere --filter=foam --concurrency=1`
Expected: every task succeeds. Foam's tests that set a size use 960 × 540 and 292 × 524 at DPR 1,
which give scale 2 under both rules; Somewhere's tests that set none run at 414 × 896.

If a Somewhere or Foam test fails, report it with its output and stop: this plan changes no file
under `apps/`, and the spec says none needs to change.

- [ ] **Step 2: Hand over the checks in the running games to the author**

Report that these are left for the author (they are not done by the implementer):

- Foam on a phone held upright: about 32 to 36 letters fit across, and the night screen has its
  narrow layout.
- Somewhere on a phone held upright: the map, the camera and the dialogue box look right at the
  smaller scale (collapsed at 195 art pixels wide, not at 216).
