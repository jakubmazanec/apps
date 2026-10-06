# The picture (Foam phase 3): design

Date: 2026-10-05. App: `apps/foam`. Status: implemented by
[2026-10-05-picture.md](../plans/2026-10-05-picture.md). This is the third of the three specs of
phase 3 of [the direction document](../../direction.md). The first is Tellurion's
[pixel scale](../../../../../docs/superpowers/specs/2026-10-05-pixel-scale-design.md), and the
second is [the look](2026-10-05-look-design.md).

## Background

This spec starts from the result of the second one: every screen has Foam's own windows, buttons and
colours, the night screen lies on a placeholder of three colour bands, and the main menu lies on
black.

These facts shape the design:

- **A screen shows a picture through a `Renderable`.** `GameScreen.addToView()` takes an object with
  a `view` and an `update(ticker)`, adds the view under the screen's UI and calls `update` on every
  frame. `PlaceholderBackground` is such an object. The night screen calls its
  `resize(width, height)` on every layout, with the size of the screen in art pixels.
- **The engine draws in WebGL.** `Game.init()` asks Pixi for the WebGL renderer, and scales every
  texture with the nearest pixel.
- **The engine already runs a shader over the whole screen.** `Game.init()` puts a CRT filter on the
  stage, which shades every device pixel on every frame.
- **There is no shader of the repository's own yet.** Pixi has the pieces for one: `Mesh`, `Shader`
  and `RenderTexture`. A shader whose source starts with `#version 300 es` is compiled as GLSL ES
  3.00, which has whole-number arithmetic; without that line Pixi compiles it as the older GLSL ES
  1.00. Pixi logs a shader that fails to compile or link and does not throw.
- **The scene buttons are placed by fractions** of the scene area, which is the screen under the top
  row (`getSpotPosition`). A button is then moved fully onto the screen, so on a narrow screen a
  wide button ends up beside the point it was given.
- **A callback of the app's ticker that throws stops the frame loop.** A screen's `update` hooks and
  a renderable's `update` run there, outside the `try` of `Game.showScreen`.

## Decisions (from brainstorming)

1. **The picture shows the place reduced to shapes** that can still be named: lamps, a shelf, a
   counter, a door. It is not a pattern, and it is not figurative art with people and detail.
2. **It is mostly black, with hard-edged shapes in flat tones.** A checkerboard of single pixels is
   its only shading, and its colours come from the game's one list.
3. **Phase 3 makes one picture, the bar.** It is the picture the mockups and the sketch of the
   brainstorming showed.
4. **Six things move:** the lamps breathe, glints come and go on the counter, dust sinks in the
   light, the bottles brighten and fade, the street passes behind the door, and haze drifts through
   the room.
5. **The picture is drawn again 30 times a second.** While a window is open over it, its time runs
   at half speed.
6. **A shader draws it.** The game computes nothing per pixel in TypeScript.
7. **Its shapes are placed by fractions of the screen,** so that a scene button, which is placed by
   fractions too, lies on its thing on a screen of any shape.
8. **The main menu shows the same picture** behind its title and buttons.
9. **The plan starts with a proof of the pipeline,** before the bar is written.

## Design

### What the player sees

1. The night screen shows a bar at night: three hanging lamps of falling size, each with a cone of
   blue light that goes on over a shelf of bottles in plum and rose behind them, so the bottles show
   through the beam; a counter in rose that runs from the left front into the depth on the right; a
   door on the right with the street's light falling in through it; and three black tables in front.
2. More than half of the picture is black.
3. The lamps slowly get brighter and darker. The small lamp at the back flickers now and then.
4. Short bright dashes come and go on the counter.
5. Dots of dust sink through the light under each lamp.
6. Single bottles on the shelf brighten and fade, each at its own pace.
7. The light behind the door drifts sideways. Every 16 seconds a tram passes: a bright band crosses
   the door, and the light on the floor gets brighter for a moment.
8. Dark smoke drifts slowly through the black parts of the room.
9. While a story window, the menu or the options window is open, all of this moves at half speed.
10. The main menu shows the same picture, moving, behind the name and the two buttons. The name
    stands on a black plate.
11. Each scene button lies on a thing of the picture: "The bartender" in the light of the first lamp
    at the counter, "Two women talking" on the table on the right, "A patron" on the table on the
    left, and "The door" on the door.
12. On a phone held upright the bar is squeezed sideways, and every scene button still lies on its
    thing.

### How a picture is built

These rules hold for every picture of the game:

- More than half of a picture is black, and the black is mostly one connected mass.
- Shapes have hard edges and no outlines. A lit side gets a rim line of one pixel.
- All shading is a checkerboard of single pixels between two colours. It is used as a flat tone with
  a hard border, not as a gradient. At the border of a tone lies a fringe of single dots, 2 to 6
  pixels wide.
- A light is a white core with stepped rings around it, and a lamp's light is a hard cone.
- A picture without figures needs depth to hold together: a horizon, shapes that overlap, and a
  shape that runs into the distance.
- The checkerboard stays fixed to the screen. A dithered shape that moves makes its dots "swim",
  which is tiring to look at, so movement changes only the brightness under the pattern.
- A light only adds colour: it never puts black on a pixel.
- Movement is small and slow.

### Files

| File                                           | Change                                                         |
| ---------------------------------------------- | -------------------------------------------------------------- |
| `source/game/core/palette.ts`                  | Six more colours                                               |
| `source/game/core/pictureShader.ts`            | New. The GLSL every picture shares                             |
| `source/game/core/getPictureStep.ts`           | New. The picture's clock, as a pure function                   |
| `source/game/content/barPicture.ts`            | New. The GLSL that draws the bar                               |
| `source/game/content/samplePlace.ts`           | The place names its picture; new positions of its four spots   |
| `source/game/screens/placePicture.ts`          | New. The `Renderable` that runs a picture                      |
| `source/game/screens/placeholderBackground.ts` | Removed                                                        |
| `source/game/screens/nightScreen.ts`           | Uses `PlacePicture`; sets its speed                            |
| `source/game/screens/mainMenuScreen.ts`        | Shows the picture and sets its speed; a plate behind the title |
| `tests/`                                       | See Testing                                                    |

No file under `apps/somewhere/` or `packages/tellurion/` changes.

### Palette (`core/palette.ts`)

| Name      | Value     | Used for                                      |
| --------- | --------- | --------------------------------------------- |
| `pink`    | `#ff6281` | The brightest tone of the counter; glints     |
| `plum`    | `#5e0960` | The shelf and the haze                        |
| `magenta` | `#c20265` | The shelf, the counter, a table's rim         |
| `blue`    | `#004cec` | The darkest tone of light                     |
| `cyan`    | `#00c9ff` | Light, the door's edge, glints, a table's rim |
| `mint`    | `#00ffb3` | The brightest tone of light; dust             |

The picture also uses `black`, `white` and `rose` of the second spec. The sketch of the
brainstorming used a second rose, `#ff0065`; the picture uses the palette's one rose, `#ff1b64`, so
that the list stays short. The two are close.

### The pipeline (`screens/placePicture.ts`)

```ts
export type PlacePictureOptions = {
  /** GLSL of the place: the function that draws it. */
  picture: string;
};

export class PlacePicture implements Renderable {
  readonly view: pixi.Container;

  /** How fast the picture's time runs: 1, or 0.5 while a window is open over it. */
  speed: number;

  constructor(options: PlacePictureOptions);
  destroy(): void;
  resize(width: number, height: number): void;
  update(ticker: pixi.Ticker): void;
}
```

How it works:

1. **A check of the shader.** The constructor compiles and links the picture's vertex and fragment
   source itself, through the renderer's WebGL context, and throws an error that names the stage and
   carries the compiler's message when that fails: `Picture shader failed to compile (vertex): …`,
   `Picture shader failed to compile (fragment): …` or `Picture shader failed to link: …`. On a
   renderer without WebGL 2 it throws `Picture needs WebGL 2!`. Pixi would only log the failure and
   draw nothing. The check runs before Pixi sees the shader.
2. **A texture of art size.** The class owns a `RenderTexture` as large as the screen in art pixels,
   rounded up, for example 480 × 270. Its `view` holds one sprite that shows this texture at 0, 0.
   The game scales the sprite up like everything else, and the CRT filter runs over it as over the
   rest of the screen.
3. **One mesh with the shader.** The class owns a rectangle mesh of the texture's size with the
   picture's shader. The mesh is never added to a screen; it is only drawn into the texture.
4. **A clock.** `update` adds the frame's time, times `speed`, to the picture's time. The picture's
   step is that time times 30, rounded down.
5. **One draw per step.** When the step differs from the last one drawn, or the size has changed,
   `update` gives the shader the step and the size and draws the mesh into the texture once, with
   `game.app.renderer.render({container, target})`. On a frame with the same step nothing is drawn,
   and the sprite shows the texture as it is.
6. **Resize.** `resize(width, height)` resizes the texture and the mesh and marks the picture for a
   draw.
7. **Destroy.** `destroy()` destroys the view with its sprite, the mesh, its geometry, the shader
   and the texture. The shader's program stays, because Pixi shares it between pictures of the same
   source.

`update` runs from the app's ticker at normal priority, and Pixi renders the stage at low priority,
so the texture is drawn before the frame that shows it. `update` must not throw: an error there
would stop the frame loop. Everything that can fail, which is the shader, has failed in the
constructor.

The clock is a pure function in `core/getPictureStep.ts`, so that it is tested without a renderer:

```ts
export const PICTURE_STEPS_PER_SECOND = 30;

/** Returns the picture's time after a frame of `deltaMs`, in seconds. */
export function advancePictureTime(time: number, deltaMs: number, speed: number): number;

/** Returns the step that a time belongs to. */
export function getPictureStep(time: number): number;
```

The shader gets the step as a whole number and computes its own time from it, `step / 30`. A whole
number stays exact for any length of play.

### The shared shader code (`core/pictureShader.ts`)

The module holds the GLSL every picture shares and exports `createPictureShaderSource`, which joins
it with a place's own GLSL into the vertex and fragment source of one shader. A place's GLSL defines
`vec3 picture(ivec2 pixel, vec2 point, float t)`. Both sources start with `#version 300 es`, and
both declare high precision for decimal and for whole numbers, so that the hash gives the same
result on every device.

Inputs of every picture:

| Input      | Type            | Meaning                                   |
| ---------- | --------------- | ----------------------------------------- |
| `uSize`    | two numbers     | The size of the picture in art pixels     |
| `uStep`    | whole number    | The picture's step                        |
| `uPalette` | list of colours | The palette, in the order of `palette.ts` |

What it provides to a place's code:

- **The pixel.** The art pixel being drawn, as whole numbers, and its position in the design's own
  coordinates (see Composition).
- **Inks.** `ink(index)` gives a colour of `uPalette`, and one constant per colour names its index:
  `INK_BLACK`, `INK_ROSE`, `INK_MINT` and so on, declared from the names in `palette.ts`.
- **`hash`.** A whole-number hash of a pixel or a cell and a fixed seed. It replaces every random
  number: the picture has no other source of chance, so the same step always gives the same picture.
  Each shape of a place has a seed of its own, far from the others; the bar's run from 100 to 800 in
  steps of 100.
- **`noise`.** Smooth value noise built on `hash`, with a cell size in pixels for each direction.
- **`tone`.** The one way a colour reaches the screen:

  ```glsl
  // A ladder is three inks: lo, hi and top. It has seven tones: black, black with lo,
  // lo, lo with hi, hi, hi with top, top. A tone of two inks is a checkerboard that is
  // fixed to the screen: the pixel's own x + y decides which of the two it gets.
  // `jitter` roughens the border between two tones by a fixed amount per pixel.
  // Tone 0 leaves the pixel as it is, so black stays black and shapes can overlap.
  vec3 tone(vec3 below, float intensity, Ladder ladder, float jitter);
  ```

  The tone is `floor(clamp(intensity, 0.0, 0.999) * 7.0 + jitter * (hash(pixel) - 0.5))`, kept
  between 0 and 6.

- **`glow`.** The brightness of a round light at a distance from its centre:
  `1 / (1 + distance² / radius²)`.
- **`toScreen`.** The screen pixel of a point of the design (see Composition).

Three ladders are used:

| Ladder  | lo        | hi        | top    | Used for            |
| ------- | --------- | --------- | ------ | ------------------- |
| `WARM`  | `magenta` | `rose`    | `pink` | The counter         |
| `DEEP`  | `plum`    | `magenta` | `rose` | The shelf, the haze |
| `LIGHT` | `blue`    | `cyan`    | `mint` | Lamps, the door     |

Rules the shared code enforces:

- Every pixel of the result is exactly one colour of the palette. There is no blending and no
  transparency.
- The checkerboard never moves. Movement changes the intensity that goes into `tone`.
- A shape never carries its own dither pattern with it.

### Composition (`content/barPicture.ts`)

The bar is written against a design of 480 × 270. A point of the design at `x`, `y` lies at
`x × width / 480` and `y × height / 270` on the screen. The design covers the whole screen, the top
row included.

Units in the tables below:

- **Positions, widths, heights and lengths** are in design units and stretch with the screen. That
  includes a lamp's reach, the cone's widening, the length of a glint and the width of the tram's
  band.
- **These stay in screen pixels:** the radius of a lamp's halo and of its core, the thickness of
  lines, the cells of the noise, the size and the sway of dust, speeds given in pixels a second, and
  the checkerboard.

A lamp's reach is how far its cone goes down from the lamp. The cone ends there or at the counter,
whichever comes first.

The shapes, in design coordinates, drawn in this order:

| Shape              | Where                                                                                                                                      | How it is filled                                                                                                                                                                              |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Shelf              | From x 150 to 392. Its top edge is `64 + (x − 150) × 0.06`, its bottom edge `142 − (x − 150) × 0.05`, so it gets lower to the right        | `DEEP`. Bottles are noise in cells 5 wide and 80 high, brightest in the middle of the shelf's height. Jitter 0.25. Two black lines, 2 thick, at 36% and 70% of its height                     |
| Counter            | Its top edge is `208 − x × 0.2`, from x 0 to 400. It is 50 high                                                                            | `WARM`, fading downwards and to the right, broken up by noise in cells 8 wide and 50 high. Jitter 0.3. The top edge is a `rose` line with a `white` line above it                             |
| Haze               | Left of x 412, between y 26 and 205, above the counter                                                                                     | `DEEP` at a low intensity, only on pixels that are still black. See Movement                                                                                                                  |
| Lamp cones         | Under each lamp, down to the counter, over the shelf too. The half width is `(y − lamp y) × 0.36 + 2`                                      | `LIGHT`, darker downwards. Jitter 0.5. On the shelf a cone colours only the pixels where x + y is odd, so the bottles show through                                                            |
| Lamp halos         | Lamps at 104, 50 with radius 8 and a reach of 140; at 240, 54 with radius 6 and a reach of 108; at 334, 58 with radius 4 and a reach of 84 | `LIGHT` by `glow`, where it is above 0.12. A `white` cross through the centre, twice the radius long each way. The halo follows the shelf rule of the cones                                   |
| Dust               | Inside each cone, under the lamp's cross                                                                                                   | Single pixels, a quarter of them `white` and the rest `mint`                                                                                                                                  |
| Light on the floor | Under the door, from y 176 to 250, widening to the left by 1.3 per row and to the right by 0.25                                            | `LIGHT`, darker downwards. Jitter 0.45                                                                                                                                                        |
| Door               | From x 418 to 458 and y 70 to 176                                                                                                          | `LIGHT` from noise in cells 40 wide and 6 high. The left and top edges are `white`, the right edge `cyan`. A black bar 2 thick a third of the way down, and a black post 2 wide in the middle |
| Tables             | Black from their top edge to the bottom of the picture: x 300 to 372 from y 222; x 20 to 118 from y 244; x 196 to 262 from y 252           | Black. Each has a rim line on its top edge, in `rose`, `cyan` and `magenta`                                                                                                                   |
| Glints             | 22 dashes on the counter's top, 3 to 8 above its edge and 3 to 11 long                                                                     | `cyan`, `pink` or `white`                                                                                                                                                                     |

A lamp's light never puts black on a pixel: where the tone of a cone or a halo would be black, the
pixel keeps what lies under it. So the faint ring of a halo does not punch black dots into a lit
shape. On the shelf a light colours only the pixels where x + y is odd and leaves the others to the
shelf, so the bottles show through the beam, and the beam still gets darker downwards on the pixels
it colours.

The exact pattern of the noise will differ from the sketch, because the shader's hash is not the
sketch's random number generator. The shapes and the rules are the same.

### Scene buttons (`content/samplePlace.ts`)

A spot's position is a fraction of the scene area, which starts under the top row, and the picture's
design covers the whole screen. The two differ by the height of the top row, 24 of 270 on a wide
screen. The positions below are fractions of the scene area, chosen so that each button lies on its
thing:

| Spot              | Thing                                               | x    | y    | Phase 2's x and y |
| ----------------- | --------------------------------------------------- | ---- | ---- | ----------------- |
| The bartender     | The light of the first lamp, just above the counter | 0.22 | 0.51 | 0.25, 0.2         |
| Two women talking | The table on the right                              | 0.70 | 0.84 | 0.75, 0.3         |
| A patron          | The table on the left                               | 0.14 | 0.93 | 0.15, 0.6         |
| The door          | The door                                            | 0.91 | 0.40 | 0.8, 0.85         |

The picture has no people, so a person's button stands where that person would be: the bartender
behind the counter under the first lamp, and the guests at the tables.

At 480 × 270 the centre of each button lies on its thing. On a narrow screen a button is wider than
its thing and is moved onto the screen, so there its box overlaps the thing and its centre can lie
beside it. No two buttons overlap at 480 × 270, 195 × 350 or 146 × 262.

### Movement

Time `t` is the picture's time in seconds.

| Movement               | Rule                                                                                                                                                                                                                                                                                                                                       |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Lamps breathe          | A lamp's power is `1 + 0.25 × sin(0.8 t + p) + 0.08 × sin(2.3 t + 3 p)`, with `p` 0, 2.1 and 4.4 for the three lamps. The halo's radius is the lamp's radius times `0.75 + 0.25 × power`, and the cone's brightness is times `0.6 + 0.4 × power`                                                                                           |
| The back lamp flickers | In each seventh of a second it has a 7% chance of a power of 0.35 and no white core                                                                                                                                                                                                                                                        |
| Glints                 | Each dash is on or off for a period of its own, between 1.1 and 3.5 seconds. In each period it is on with a chance of 55%                                                                                                                                                                                                                  |
| Dust                   | Each dot sinks through its cone in 30 to 80 seconds and starts again at the top. It sways 2 pixels to each side. The dust is equally dense in every cone: a cell 6 pixels high in a lane 6 pixels wide holds a dot with a chance of 75%, so a wider cone has more dots per pixel of its reach (about 1.0, 0.8 and 0.7 for the three lamps) |
| Bottles                | Each column of 5 pixels has its own phase and a rate between 0.5 and 1.4. Its brightness is times `1 + 0.32 × sin(phase + rate × t)`                                                                                                                                                                                                       |
| Street                 | The noise behind the door moves sideways at 7 pixels a second                                                                                                                                                                                                                                                                              |
| Tram                   | In every 16 seconds, from second 9 to second 12.5, a band 14 wide crosses the door and adds 0.45 to it. The light on the floor gets brighter by up to 0.22, most in the middle of the passage                                                                                                                                              |
| Haze                   | Two layers of noise, in cells of 70 × 26 and 28 × 12, drift at 5 and 2.2 pixels a second in opposite directions. Three quarters of the first and one quarter of the second make the amount, which is strongest at y 110. The intensity is the amount times 0.44, which gives mostly the two darkest tones                                  |

How dust and glints are computed is left to the plan, with one limit: no loop over single dots or
dashes for every pixel that is longer than a few dozen steps. A hash of the cell a pixel lies in
gives the dot of that cell.

In the sketch, with all six movements, about 0.5% of the pixels changed from one step to the next at
8 steps a second, and about 1.2% while the tram passed.

### Night screen (`screens/nightScreen.ts`)

- `PlacePicture` replaces `PlaceholderBackground` in the screen's contents: it is created in
  `onAttach` with `samplePlace.picture`, added in `onShow`, removed in `onHide`, and resized in
  `layOut` to the size of the screen in art pixels.
- `onUpdate` sets the speed: `0.5` while `screen.ui.topOverlay` is not `null`, and `1` otherwise.
  The story window, the menu and the options window are all overlays.

`Place` in `content/samplePlace.ts` gains `picture: string`, the GLSL of the place.

### Main menu (`screens/mainMenuScreen.ts`)

- The screen creates a `PlacePicture` with the bar's picture in `onAttach`, adds it in `onShow`,
  removes it in `onHide`, and resizes it to the size of the screen in art pixels in `onShow` and in
  a new `onResize` hook.
- A black rectangle lies behind the title, 8 larger than the title on every side, that is 112 × 64.
  The buttons have their own black fill.
- A new `onUpdate` hook sets the speed by the same rule as on the night screen: `0.5` while the
  options window is open.

The error screen stays on black. It must not depend on anything that can fail.

### The proof

The first task of the plan builds the pipeline with a shader of a few lines: a checkerboard of two
palette colours, and a band that moves with the step. It is done when:

- a browser test reads the texture back and finds one colour per art pixel, the checkerboard on
  neighbouring pixels, and the band at another place on another step;
- the author has seen it in the running app, under the CRT filter, on a desktop screen and on a
  phone.

If drawing into a texture from `update` does not work with the engine, the fallback is to add the
mesh to the screen itself and let the shader work out the art pixel from the position on the screen.
The rest of this spec does not depend on which of the two is used.

If no shader of Foam's own can be made to work, the fallback is the second option of the
brainstorming: the same picture computed in TypeScript into a pixel buffer, at fewer steps a second.
That would be a new decision for the author.

## Error handling

- **The shader does not compile or link.** `PlacePicture` throws in its constructor, with a message
  that names the stage that failed, or the link. The screens create it in `onAttach`, which runs
  when the game adds its screens at boot, so the boot fails: the page shows its line for a game that
  could not start, and the console keeps the error. A browser test constructs the bar's picture, so
  a mistake in the GLSL fails the tests.
- **The device has no WebGL 2.** GLSL ES 3.00 needs it. The check above throws
  `Picture needs WebGL 2!`, with the same result: Foam does not start on such a device. This is a
  limit of the game.
- **An error in `update`.** There is none to handle: after the constructor, `update` only advances
  the clock and draws.
- **The WebGL context is lost and restored.** Pixi restores its resources. The texture's content is
  drawn again on the next step.
- **The screen has no size.** `resize` with a width or height of 0 keeps the last size.

## Testing

Unit tests, in Node:

- `advancePictureTime`: a frame of 100 ms at speed 1 adds 0.1; at speed 0.5 it adds 0.05; at speed 0
  it adds nothing.
- `getPictureStep`: 0 gives 0; 0.999 / 30 gives 0; 1 / 30 gives 1; 10 seconds give 300.
- The palette has the six new colours.

Browser tests of `PlacePicture`, in `tests/placePicture.browser.test.ts`, which read the texture's
pixels back. The tests of the pipeline draw the proof's shader (`tests/proofPicture.ts`): tone 3 of
`WARM` everywhere, which is `magenta` on pixels where x + y is even and `rose` where it is odd, and
a `white` row that moves down one pixel per step.

- The texture is the screen in art pixels, rounded up: 480.5 × 270.2 gives 481 × 271, and a resize
  to a width of 0 keeps the last size.
- Every pixel is `magenta`, `rose` or `white`.
- The checkerboard follows x + y, on step 0 and on the next step.
- The band moves with the step.
- `update` draws once per step: frames that stay within one step do not draw, and at speed 0.5 a
  step takes twice as long.
- A picture whose GLSL has a mistake throws in its constructor, with
  `Picture shader failed to compile`.
- `destroy` destroys the texture, the sprite, the mesh, its geometry and its shader, and empties the
  view.

This file is the only one that draws the bar. A headless browser draws it in software, so the tests
that draw it many times draw it smaller than 480 × 270. Its tests of the bar:

- The bar's shader compiles and draws.
- At 480 × 270 every pixel is one colour of the palette.
- More than half of the pixels are black.
- At 120 × 68, drawn once in the middle of each seventh of a second of a minute (420 draws), the
  centres of the two front lamps are `white` in every draw, and the back lamp's centre is `white` in
  at least 85% of them and not in all. A lamp's centre depends only on the seventh of a second, in
  which the back lamp's flicker is decided.
- The same step gives the same pixels on a second draw and on a second instance.
- Two steps a second apart differ.
- At 240 × 135, from one step to the next, fewer than 3% of the pixels change, over every step of a
  passage of the tram.
- A lamp's light never puts black on the shelf: under the middle lamp's halo, at the shelf's top
  rows, no pixel where x + y is odd is black.
- The middle lamp's beam crosses the shelf: between the shelf's black lines, the pixels where x + y
  is odd are `blue` or `cyan`, and the others keep the shelf, black or dust.
- `resize` to 195 × 350 gives a texture of that size, and each lamp's centre lies at its fraction of
  the new size.

Browser tests of the screens. The test files of the night screen, of the night screen on a narrow
screen and of the main menu replace the bar's GLSL with the proof's shader, because they check
placement, speed and windows, not the picture's pixels, and the bar drawn in software would slow
every frame:

- The night screen's picture fills the screen, under the top row and the buttons.
- At 480 × 270 the centre of every scene button lies on its thing. At 195 × 350 and at 146 × 262
  every button's box overlaps its thing. No two buttons overlap at any of the three sizes.
- Its speed is 1 on the scene and 0.5 while a story window, the menu or the options window is open.
- The main menu shows the picture, full screen and under its UI, and the title's plate, 112 × 64,
  lies behind the title and in front of the picture.
- The main menu's picture runs at half speed while the options window is open.
- The error screen has no picture.
- A new game takes the picture off the main menu, and a frame afterwards draws nothing into its
  texture.

A browser test of the boot, `tests/pictureBootFailure.browser.test.tsx`, replaces the bar's GLSL
with text that is not GLSL: the page shows its line for a game that could not start, there is no
canvas, and the error in the console says `Picture shader failed to compile`.

Run from the repository root:

```sh
npx turbo run typecheck lint test --filter=foam --filter=tellurion --filter=somewhere --concurrency=1
```

Checks in the running app, by the author:

- The picture under the CRT filter: whether the checkerboard shimmers, on a desktop screen and on a
  phone.
- Whether the movement is comfortable behind a page of text, at half speed.
- Whether a phone holds 30 steps a second, and how warm it gets.
- The bar on a phone held upright, where it is squeezed sideways.

## Done when

- The turbo command above passes.
- In the running app, every step of "What the player sees" can be observed.
- No file under `apps/somewhere/` or `packages/tellurion/` has changed.

## Non-goals

- A second place, and a way to build a place from data instead of GLSL. Phase 4 writes the picture
  of the first real bar.
- A picture that reacts to the hour, to how drunk the player is, or to anything else in the night.
- Colours that change from place to place.
- A setting that slows or stops the movement, and a reading of the browser's "reduce motion"
  setting.
- A picture for the error screen or for a loading screen.
- Any change to the CRT filter.
- Shader support in Tellurion.

## Rejected

- **A picture of pure pattern,** and a pattern with one or two anchors. Buttons stand for things in
  the place, and the look depends on depth.
- **Less movement:** only the lamps and the glints; and everything but the haze.
- **A pixel buffer computed in TypeScript.** Drawing one step of the sketch took 9.6 ms on a server
  processor with all six movements. A phone is several times slower and could not hold 30 steps a
  second.
- **Pixi shapes and sprites.** They cannot draw the haze or the dotted borders of a tone, which both
  come from a field that is cut into steps at every pixel.
- **Full-screen effects** such as plasma, moving bands or a grid of dots. They do not fit a place
  made of shapes.
