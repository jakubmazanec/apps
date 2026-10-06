# Pixel scale from width and height: design

Date: 2026-10-05. Package: `packages/tellurion`. Status: implemented by
[2026-10-05-pixel-scale.md](../plans/2026-10-05-pixel-scale.md).

This is the first of the three specs of Foam's phase 3. The other two are Foam's own:
[the look](../../../apps/foam/docs/superpowers/specs/2026-10-05-look-design.md) and
[the picture](../../../apps/foam/docs/superpowers/specs/2026-10-05-picture-design.md).

## Background

Tellurion draws every game in whole art pixels. One number, the pixel scale, says how many device
pixels one art pixel covers. A helper function chooses it:

```ts
// source/app/getPixelScale.ts
/** TBD */
export function getPixelScale(height: number) {
  // 270 art pixels on vertical axis produces ×4 scale on a 1080p DPR-1 screen
  return Math.min(8, Math.max(2, Math.round(height / 270)));
}
```

`Game` calls it once, in the initialiser of its `pixelScale` field:

```ts
// source/app/Game.ts
readonly pixelScale: number = getPixelScale(window.innerHeight * window.devicePixelRatio);
```

The helper looks at the height only. It aims at about 270 art pixels down the screen. A phone held
upright is tall, so it gets the largest scale, 8, and its width is what is left: about 146 art
pixels on a phone 1170 device pixels wide. In the monogram font, which is 6 art pixels per letter,
that is 24 letters across the screen.

Foam is a game of text, and 24 letters across is too few. Its phase 3 settled the size it wants on
an upright phone: about 33 letters across.

## Decisions

- **The helper counts the width too.** The scale is the smaller of what the height allows and what
  the width allows: `Math.min(width / 200, height / 270)`, rounded to the nearest whole number and
  kept between 2 and 8.
- **The two numbers live in the helper.** There is no option on `Game` for them. Both games get the
  same rule.
- **`getPixelScale` takes the width and the height,** in device pixels, in that order. It stays
  exported.
- **Nothing else in the engine is part of this.** `Game` chooses the scale once, when it is
  constructed, from the size of the browser window. The one line of `Game` that calls the helper
  passes the width as well, because the helper needs it.

Rejected:

- **The scale following the screen** when a window is resized or a phone is turned: a getter in
  place of the field, a setter for `adoptResize`, and the CRT filter's line width following along.
  The author does not need it. A phone that is turned keeps the scale of its first position.
- A data option on `Game`, such as `targetSize: {width: 200, height: 270}` with the height-only rule
  as the default. It would keep Somewhere on the height-only rule. One fixed rule was chosen
  instead.
- A function option, such as `getPixelScale: (width, height) => number`. Every game would write the
  rounding and the limits itself.
- A helper that reads the width from `window` itself, so that its call would not change. It would
  depend on more than its arguments, and its unit tests run without a window.

## Engine

### `source/app/getPixelScale.ts`

```ts
// The screen shows about this many art pixels across and about this many down, or more in one of
// the two directions.
const TARGET_WIDTH = 200;
const TARGET_HEIGHT = 270;

/**
 * Integer scale that turns art pixels into device pixels, from the screen size in device pixels.
 * Whichever of the two directions fits fewer times decides, so a 1920 × 1080 screen gives 4 and an
 * upright phone at 1170 × 2100 gives 6. The result is kept between 2 and 8.
 */
export function getPixelScale(width: number, height: number) {
  return Math.min(
    8,
    Math.max(2, Math.round(Math.min(width / TARGET_WIDTH, height / TARGET_HEIGHT))),
  );
}
```

The width decides the scale when `width / 200` is smaller than `height / 270`, that is on a screen
that is taller than about 4 : 3 held upright. On every wider screen the height decides.

The column "Height only" gives the scale under the rule of the Background, for comparison.

| Screen, in device pixels               | Height only | Scale | Art pixels | Letters across |
| -------------------------------------- | ----------- | ----- | ---------- | -------------- |
| Desktop, 1920 × 1080                   | 4           | 4     | 480 × 270  | 80             |
| Laptop, 2880 × 1800                    | 7           | 7     | 411 × 257  | 68             |
| Laptop, 1366 × 768                     | 3           | 3     | 455 × 256  | 75             |
| Phone upright, 1170 × 2100             | 8           | 6     | 195 × 350  | 32             |
| Phone upright, 1081 × 2402             | 8           | 5     | 216 × 480  | 36             |
| Small phone upright, 720 × 1280        | 5           | 4     | 180 × 320  | 30             |
| Phone sideways, 2100 × 1170            | 4           | 4     | 525 × 292  | 87             |
| Tablet upright, 1640 × 2360            | 8           | 8     | 205 × 295  | 34             |
| A small window, 292 × 524 (Foam tests) | 2           | 2     | 146 × 262  | 24             |

The lower limit of 2 gives fewer than 200 art pixels across in a window narrower than 300 device
pixels. Games keep their layouts for such widths.

### `source/app/Game.ts`

The one line that calls the helper:

```ts
/** Integer representing how much is the rendering scaled up. */
readonly pixelScale: number = getPixelScale(
  window.innerWidth * window.devicePixelRatio,
  window.innerHeight * window.devicePixelRatio,
);
```

The field is `readonly`, and the scale is chosen once, from the browser window, when `Game` is
constructed. `init()`, `mount()` and `adoptResize()` take no part in it.

### A phone that is turned

A phone that is turned after the page has loaded keeps the scale of its first position. Under this
rule, on a phone of 1170 × 2100 device pixels:

- loaded upright and then turned sideways, it has scale 6 and shows 350 × 195 art pixels, where the
  same phone loaded sideways has scale 4 and shows 525 × 292;
- loaded sideways and then turned upright, it has scale 4 and shows 292 × 525 art pixels, 48 letters
  across.

Both are usable, and a reload gives the scale of the new position.

## Games

- **Somewhere.** The comment above the wrap width in `source/game/screens/errorScreen.ts` says that
  the error window, 144 art pixels wide, fits an upright phone, which is about 180 to 216 art pixels
  wide under this rule. No other file under `apps/somewhere` changes. On an upright phone its scale
  is 5 or 6, where the height-only rule gives 8: the camera shows more of the map, and sprites and
  text are smaller. Its dialogue box collapses below 200 art pixels of width (`collapseWidth` in
  `dialogueBoxSystem.ts`), so it is collapsed at 195 and not at 216. On every screen that is wider
  than tall both rules give the same scale.
- **Foam.** No file under `apps/foam` changes. On an upright phone it shows 30 to 36 letters across,
  where the height-only rule gives about 24. Three comments in Foam state the scale rule; Foam's
  [look spec](../../../apps/foam/docs/superpowers/specs/2026-10-05-look-design.md) words them for
  this rule, because it edits those files anyway.

## Sequencing

1. `getPixelScale.ts`, its unit tests, and the call in `Game.ts`, together. Between them the engine
   would not compile.
2. The tests of `Game` that are listed below.

## Tests and verification

`packages/tellurion/tests/getPixelScale.test.ts` is rewritten for two arguments:

- 1920 × 1080 gives 4.
- The height decides on a wide screen: 1366 × 768 gives 3, and 1100 × 620 gives 2.
- The width decides on a tall screen: 1170 × 2100 gives 6, 1081 × 2402 gives 5 and 720 × 1280
  gives 4.
- The result is rounded to the nearest whole number: 1100 × 2100 (5.5) gives 6 and 1090 × 2100
  (5.45) gives 5.
- A tiny screen gives 2, and a huge one gives 8.

`packages/tellurion/tests/Game.browser.test.ts`:

- "init derives pixelScale from the device-px viewport size" compares with `getPixelScale` called
  with both sizes of the window.
- The "Game scaled root" block pins `window.innerHeight` to 1080 to get scale 4. It also pins
  `window.innerWidth` to 1920, because the width counts too: the test browser's own window is 414
  wide, which would give 2. The comment above the block says so. The tests inside the block keep
  their expectations, including the layout of 200 × 150 art pixels for an element of 800 × 600.

Two comments in the engine's tests, in `DialogueBoxLayout.browser.test.ts` and
`DialogueBoxReveal.browser.test.ts`, call 135 art pixels "a screen 135 art px wide", which holds
under any scale rule.

The engine's other browser tests, and those of Foam that set no size, run at the test browser's
default of 414 × 896, where the scale is 2 (3 under the height-only rule). No assertion in them
depends on the scale. Foam's tests that set a size use 960 × 540 and 292 × 524, which give scale 2
under both rules.

Run from the repository root:

```sh
npx turbo run typecheck lint test --filter=tellurion --filter=somewhere --filter=foam --concurrency=1
```

Checks in the running games, by the author:

- Foam on a phone held upright: about 32 to 36 letters fit across, and the night screen has its
  narrow layout.
- Somewhere on a phone held upright: the map, the camera and the dialogue box are right at the
  smaller scale.

## Non-goals

- A scale that changes after the page has loaded: at a resize, when a phone is turned, or when the
  browser's zoom changes.
- Any change to `Game` beyond the one call, and any change to `adoptResize`, to the CRT filter or to
  `GameInput`.
- An option that lets a game choose its own numbers or its own rule.
- A limit other than 2 and 8, or a scale that is not a whole number.
- Any change under `apps/somewhere` or `apps/foam` beyond the comments that describe the scale rule.
