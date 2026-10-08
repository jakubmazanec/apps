# The map (Foam phase 4, spec 3 of 3): design

Date: 2026-10-07. App: `apps/foam`. Status: implemented by
[2026-10-07-map.md](../plans/2026-10-07-map.md). It is the third of phase 4's three specs in the
[direction document](../../direction.md). It starts from the second,
[places and travel](2026-10-06-places-and-travel-design.md), which is built.

## Background

Places and travel left a travel window that lists where a way leads. A way out's choice opens it on
that way. It shows a title ("On foot", "By tram", "By taxi"), a row of three way buttons, one button
per destination with its name, minutes and price, nearest first, and "Back". It opens with the first
destination focused and the ring shown. Nothing in it shows where the places are.

These facts shape the design:

- **The positions exist.** `content/data/places.json` holds the latitude and longitude of every
  place but the train, filled by `scripts/fill-travel-data.mjs` from OpenStreetMap. Only that script
  and the content checker read the file; the game does not.
- **The places are close together.** The six places with a position span about 1.8 km from west to
  east and 2.4 km from south to north, in two groups: Rotor Bar, Malinovského náměstí and the main
  station in the centre, within 600 m of each other; The Whisky Shop Brno and Náměstí Republiky in
  Husovice, 290 m apart. Brno-Židenice lies east, between them.
- **The screens are small.** An upright phone shows 195 × 350 art pixels, the narrowest test screen
  146 × 262, a wide window 480 × 270, and a phone turned sideways 350 × 195.
- **Foam already draws into an art-size texture.** `PlacePicture` renders its shader into a
  `RenderTexture` as large as the screen in art pixels (resolution 1, nearest, no antialiasing), and
  one `Sprite` shows it.
- **Pixi draws one-pixel lines.** Pixi 8.19, which the repository uses, strokes a path with
  `pixelLine: true` as a list of lines one pixel wide in the target, with no triangles.
- **Tellurion's buttons cover what the window needs.** A `Button` with no children is a box of the
  size its layout gives it. `disable()` gives it the disabled look, and a disabled button takes no
  press and no focus. The arrow keys move the focus to the nearest control in their direction.

## Decisions (from brainstorming)

1. **The map is the picker.** The list of destinations goes. One button under the map names the
   selected destination with its minutes and price, and pressing it makes the journey.
2. **A place on the map is an 8 × 8 Tellurion `Button` with no name.** Pressing it selects the
   place. The button has the normal button looks and no look of its own for "selected": the
   selection is what the button under the map says.
3. **Each way has its layer.** Walk and Taxi show the streets; Tram shows the tram lines. Both show
   the rivers, the railway and the parks.
4. **The map is drawn from real geometry.** A script fetches it from OpenStreetMap into
   `content/data/map.json`, which nobody edits.
5. **The player is a light, not a button.** A dotted line runs from the light to the selected place.
6. **A place the current way does not reach has the disabled look.**
7. **Stacked on a tall screen, side by side on a wide one.** On a screen wider than tall the map
   takes the left side and the controls stand in a column on the right.
8. **The window opens with the nearest destination selected** and the focus on the button under the
   map.
9. **Pixi draws the map.** Each layer is a `GraphicsContext` built once, with `pixelLine` strokes,
   rendered into an art-size texture when something changes.
10. **Every line is one pixel wide,** rivers too, and parks are flat.
11. **No credit to OpenStreetMap on the screen in this phase.** The acknowledgment is placed later,
    elsewhere.
12. **Tellurion does not change.**

## Design

### What the player sees

Opening the window:

1. A way out's "Walk", "Take the tram" or "Take a taxi" opens the travel window on that way, as
   before. The window is as high as the screen less a margin of 4 above and below.
2. From the top: the title ("On foot", "By tram", "By taxi"), the row of ways, the map, one button
   for the selected destination (its name, and its minutes and price), and "Back".
3. On a screen wider than tall, the window takes the whole screen less the margins. The map fills
   its left side under the title; a column 120 wide on the right holds the row of ways, the
   destination button under it, and "Back" at its bottom. A screen taller than wide, or square, has
   the stacked layout, at most 300 wide.
4. The window opens with the way's nearest destination selected, in the order the list had. The
   focus and its ring are on the destination button, so Enter makes that journey at once.

The map:

5. The map shows the part of Brno around every place that has a position, fitted so that each of
   them lies at least 8 pixels inside the map's edge, at whatever metres per pixel the screen
   allows: about 12 on an upright phone, 11 on a wide window, 17 on a phone turned sideways and 22
   on the narrowest screen. The map has no frame.
6. Walk and Taxi show the street layer: minor streets in `shade`, main streets in `line`, the
   railway in `dim`, the rivers in `blue`, and parks as flat `ground`. Tram shows the tram layer:
   the same parks, railway and rivers, and the tram lines in `magenta` instead of the streets. Every
   line is one art pixel wide.
7. The player's place is a small light at its position: a white core with stepped rings of cyan and
   blue pixels. It is not a button, and it does not move.
8. Every other place with a position is an 8 × 8 button with no name, centred on its position, with
   one pixel of black around it. It has the normal button looks: normal, hovered, and pressed while
   held. A place the current way does not reach has the disabled look and takes no press and no
   focus. By tram from The Whisky Shop Brno, those are Rotor Bar, both stations and Náměstí
   Republiky, where the tram is boarded.
9. Buttons that would lie closer than 4 pixels apart are pushed apart until 4 pixels separate them,
   the gap that keeps a focus ring off the next button. They keep off the light and stay inside the
   map. Rotor Bar and Malinovského náměstí need it on the smallest maps: on the narrowest screen and
   on a phone turned sideways.
10. A dotted line in `dim`, every other pixel, runs from the light to the selected place's button.

Picking and travelling:

11. Pressing a place's button selects it: the destination button shows that place's name and
    numbers, and the dotted line moves to it. The place's button does not change, and the focus
    stays on it, as it stays on a pressed way. Pressing the selected place changes nothing.
12. Pressing the destination button makes the journey, as a destination of the list did: the window
    closes, the minutes are added, the price is taken, and the journey's text types out.
13. "Back" and Escape close the window with nothing picked.
14. Pressing a way in the row changes the title, the layer and the places that take a press. The
    selection becomes that way's nearest destination. The focus stays on the pressed way.
15. A way with no destination shows no destination button, its room stays empty, and there is no
    dotted line. The window opens with the focus on "Back".

Sizes and keys:

16. The destination button is as high as the tallest selection of any way needs, so changing the
    selection or the way moves nothing. On a screen narrower than `NARROW_WIDTH` (240), and always
    in the column of the side-by-side layout, the numbers stand under the name. A long name wraps.
17. The arrow keys move the focus by direction across the row of ways, the places that take a press,
    the destination button and "Back". The ring shows only after a key, as everywhere.
18. A resize while the window is open lays it out again. It keeps the way, the selection and the
    focused control: the same place, the same way, the destination button or "Back".
19. Every button does nothing while the window is closing.

The train has no travel window and no position, and is not on the map. Journeys, the night's numbers
and the jump-in do not change.

### Files

| File                                  | Change                                                           |
| ------------------------------------- | ---------------------------------------------------------------- |
| `scripts/fetch-map-data.mjs`          | New. Fetches the map's layers into `map.json`                    |
| `source/game/content/data/map.json`   | New. The map's lines, in metres                                  |
| `source/game/content/data/README.md`  | A section on `map.json`                                          |
| `source/game/content/nightStart.ts`   | `placeData` and `map`                                            |
| `source/game/core/travel.ts`          | `NightStart` gains `placeData` and `map`; the `MapData` type     |
| `source/game/core/getMapPoint.ts`     | New. Latitude and longitude to metres                            |
| `source/game/core/fitMapFrame.ts`     | New. How the metres lie on a map of a given size                 |
| `source/game/core/placeMapButtons.ts` | New. The place buttons' positions, pushed apart                  |
| `source/game/core/getTravelLayout.ts` | New. The window's layout for a screen, and the map's size        |
| `source/game/core/mapLayers.ts`       | New. The layers as Pixi drawings, built once from the map's data |
| `source/game/core/checkContent.ts`    | The rule that `map.json` covers every place                      |
| `source/game/screens/mapPicture.ts`   | New. Draws a layer, the light and the dotted line into a texture |
| `source/game/screens/travelWindow.ts` | Built around the map                                             |
| `source/game/screens/nightScreen.ts`  | Gives the window the screen's height                             |
| `tests/`                              | See Testing                                                      |
| `docs/direction.md`                   | The travel decision, the travel data and phase 4's third spec    |

No file under `apps/somewhere/` or `packages/tellurion/` changes.

### The map's data (`content/data/map.json`)

```json
{
  "origin": {"latitude": 49.20127, "longitude": 16.62371},
  "box": {"left": -2900, "top": -3180, "right": 2900, "bottom": 3180},
  "minorStreets": [[-812, 455, -790, 431, -751, 402]],
  "mainStreets": [],
  "railway": [],
  "rivers": [],
  "parks": [],
  "tramLines": []
}
```

The numbers above are examples. Every point is in whole metres from `origin`: `x` to the east, `y`
to the south. A line is one flat list `x0, y0, x1, y1, …`. A park is a closed ring in the same form,
its last point equal to its first. `box` is the area the data covers.

`core/travel.ts`:

```ts
/** The content of `map.json`. */
export type MapData = {
  origin: Position;
  box: {left: number; top: number; right: number; bottom: number};
  minorStreets: number[][];
  mainStreets: number[][];
  railway: number[][];
  rivers: number[][];
  parks: number[][];
  tramLines: number[][];
};
```

`NightStart` gains two fields beside `travel`:

```ts
/** The content of `places.json`: the positions of the places. */
placeData: PlaceData;

/** The content of `map.json`. */
map: MapData;
```

`content/nightStart.ts` imports both files, as it imports `travel.json`. The tests put the fixed
world's own into `nightStart`, as they do with its places and travel data.

The file is 201,196 bytes (196.5 KB), 61,985 bytes (60.5 KB) compressed with gzip, for a box of 5.8
× 6.4 km.

### The script that fetches the map (`scripts/fetch-map-data.mjs`)

The script follows `fill-travel-data.mjs`: the same Overpass server, the same user agent that names
the game, one request at a time, and Prettier for what it writes. Its work is an exported function,
`fetchMapData(places, request)`, that takes the content of `places.json` and a function that sends
one Overpass request, so a test can run it with fake answers; a few lines run it with the real
server when the file is run.

1. It reads `places.json` and turns every position into metres with `getMapPoint`, from an origin in
   the middle of the places' box (latitude and longitude rounded to five decimals). It rounds the
   points to whole metres and takes their box, widened by 2,000 m on every side. That covers the
   widest map a supported screen shows, a 21:9 window in the side-by-side layout. On a wider screen
   the map is black beyond the data.
2. It sends one Overpass request per layer for the ways inside that box, in latitude and longitude,
   with their geometry:

   | Layer          | Ways                                                                                  |
   | -------------- | ------------------------------------------------------------------------------------- |
   | `minorStreets` | `highway` of `tertiary`, `residential`, `unclassified`, `pedestrian`, `living_street` |
   | `mainStreets`  | `highway` of `motorway`, `trunk`, `primary`, `secondary`                              |
   | `railway`      | `railway=rail` without a `service` tag                                                |
   | `rivers`       | `waterway=river` without a `tunnel` tag                                               |
   | `parks`        | `leisure=park`, closed ways                                                           |
   | `tramLines`    | `railway=tram` without a `service` tag                                                |

3. It turns every point into whole metres from the origin, and simplifies each line so that no point
   of the original lies more than 5 m from it, under half an art pixel at the sharpest scale. It
   drops a line that is left with one point and a park left with fewer than three. It sorts each
   layer's ways by their OpenStreetMap id, so the same data gives the same file.
4. When every request has answered, it writes `map.json` anew. Nobody edits the street geometry by
   hand, so the script keeps nothing of the old file.
5. A query declares `[timeout:25]`: the server refuses a query whose declared time is more than half
   of its free resources, and these queries run in about a second. The script sends them one at a
   time and, on an HTTP 429 (no free slot) or 504 (the server too busy), waits 30 s, as the Overpass
   wiki asks, and sends the same query again, up to five attempts. Any other error status, an answer
   that is not JSON, and an answer with a `remark` (how Overpass reports a runtime error such as a
   timeout, with the elements found so far) end the run: the script prints what the server said,
   leaves the file as it was and ends with exit code 1. The retry is the exported
   `sendOverpassQuery(query, {fetch, wait})`, so a test can run it without a network or a wait.
6. It prints the number of lines of each layer and the size of the file.

The script is run again when a place is added. The checker says when that is needed (see below).

`content/data/README.md` gains a section: what `map.json` holds, that it comes from OpenStreetMap
through Overpass, and the command that fetches it again. The README already states the data's
licence.

### Positions in metres (`core/getMapPoint.ts`)

```ts
/** A latitude and longitude as metres from `origin`: x to the east, y to the south. */
export function getMapPoint(
  position: {latitude: number; longitude: number},
  origin: {latitude: number; longitude: number},
): MapPoint;

/** Metres from `origin` as a latitude and longitude: the inverse of `getMapPoint`. */
export function getMapPosition(
  point: MapPoint,
  origin: {latitude: number; longitude: number},
): {latitude: number; longitude: number};

/** Metres from the map's origin: x to the east, y to the south. */
export type MapPoint = {x: number; y: number};
```

`x = (longitude − origin.longitude) × 111,320 × cos(origin.latitude)` and
`y = (origin.latitude − latitude) × 111,132`. Over a few kilometres the error of this flat
projection is far below a pixel. Like `getExpectedJourneys`, the file imports nothing, not even a
type, so the script imports it and the places and the streets go through the same code. `travel.ts`
takes `MapPoint` from it. The script turns its box into latitude and longitude with
`getMapPosition`, and the tests' fixed world places its places with it.

### The map's frame (`core/fitMapFrame.ts`)

```ts
/** How the map's metres lie on its art pixels. */
export type MapFrame = {width: number; height: number; metresPerPixel: number; centre: MapPoint};

/** Fits every point into a map of this size with `inset` pixels to spare on every side. */
export function fitMapFrame(
  points: MapPoint[],
  width: number,
  height: number,
  inset: number,
): MapFrame;

/** A point in metres as a pixel of the map, rounded. */
export function toMapPixel(frame: MapFrame, point: MapPoint): {x: number; y: number};
```

`centre` is the middle of the points' box. `metresPerPixel` is the larger of the box's width over
`width − 2 × inset` and its height over `height − 2 × inset`. A box with no width and no height
(fewer than two distinct points) gets 10 metres per pixel. A room of less than 1 pixel counts as 1.

The travel window fits the points of every place in `placeData` with an inset of 8, so the frame
does not change with the way.

### The place buttons' positions (`core/placeMapButtons.ts`)

```ts
/**
 * The top-left corners of 8 × 8 buttons centred on these pixels, pushed apart until 4 pixels
 * separate any two, kept off the light at `you` and inside a map of this size.
 */
export function placeMapButtons(
  centres: {x: number; y: number}[],
  you: {x: number; y: number} | null,
  width: number,
  height: number,
): {x: number; y: number}[];
```

A button centred on a pixel has its top-left corner 4 to the left and 4 up. The light counts as a
box of 9 × 9 around its pixel that never moves. In each round the function takes every pair in
order, first index then second. Two boxes closer than 4 on both axes are moved apart along the axis
that needs the shorter move, each by half of it; a box too close to the light moves the whole of it.
Then every button is moved back inside the map. The function stops after a round that moved nothing,
or after 20 rounds. On a map too small for the buttons they may still touch; that is not an error.

### The window's layout (`core/getTravelLayout.ts`)

```ts
export type TravelLayout = {
  kind: 'stacked' | 'sideBySide';
  window: {width: number; height: number};

  /** The width of the row of ways, the destination button and "Back". */
  controlWidth: number;

  /** Whether a destination's numbers stand under its name. */
  isNarrow: boolean;
};

/** The window's layout for a screen. */
export function getTravelLayout(screenWidth: number, screenHeight: number): TravelLayout;

/** The map's size in a window of this layout, with a destination button of this height. */
export function getMapSize(
  layout: TravelLayout,
  destinationHeight: number,
): {width: number; height: number};
```

The two are apart because the destination button's height depends on the control width, which the
layout gives, and the map's size depends on that height.

The layout is `sideBySide` when the screen is wider than tall, and `stacked` otherwise. `isNarrow`
is true in the side-by-side layout, and in the stacked one on a screen narrower than `NARROW_WIDTH`.
Inside the window's padding (8 above and below, 12 left and right) come the title block (15) and a
gap of 4.

| Layout       | Window                                         | Map                                                                                                                          | Controls                                                                                   |
| ------------ | ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `stacked`    | `min(300, screen − 8)` wide, `screen − 8` high | As wide as the inside; as high as the inside less the title block, 4, the row (16), 8, 8, the destination, 8 and "Back" (16) | The inside's width; the row above the map, the destination and "Back" under it             |
| `sideBySide` | `screen − 8` in both directions                | The inside's width less 8 and 120; as high as the inside less the title block and 4                                          | 120 wide, 8 right of the map: the row at the top, 8, the destination, "Back" at the bottom |

With a destination 28 high, the sizes of the mockups:

| Screen    | Layout       | Window    | Map       |
| --------- | ------------ | --------- | --------- |
| 195 × 350 | `stacked`    | 187 × 342 | 163 × 223 |
| 146 × 262 | `stacked`    | 138 × 254 | 114 × 135 |
| 480 × 270 | `sideBySide` | 472 × 262 | 320 × 227 |
| 350 × 195 | `sideBySide` | 342 × 187 | 190 × 152 |

The functions give explicit sizes, so the map's size is known before anything is drawn, and the
window's flex layout gets fixed sizes rather than sizes measured later. A map left with less than 1
pixel in a direction gets 1.

### The layers (`core/mapLayers.ts`)

```ts
export type MapLayer = 'streets' | 'trams';

/** The drawings of each layer, bottom first, built from the data on first use and kept. */
export function getMapLayers(
  map: MapData,
): Readonly<Record<MapLayer, readonly pixi.GraphicsContext[]>>;
```

The function builds six `pixi.GraphicsContext`s from the data, in metres, each in one colour, and
keeps them in a `WeakMap` by the data object, for the game's life:

| Context       | Drawn as                                        | Colour    |
| ------------- | ----------------------------------------------- | --------- |
| Parks         | Filled rings                                    | `ground`  |
| Minor streets | One path of all the lines, a `pixelLine` stroke | `shade`   |
| Main streets  | The same                                        | `line`    |
| Railway       | The same                                        | `dim`     |
| Rivers        | The same                                        | `blue`    |
| Tram lines    | The same                                        | `magenta` |

The street layer is parks, minor streets, main streets, railway and rivers; the tram layer is parks,
railway, rivers and tram lines.

### The map picture (`screens/mapPicture.ts`)

```ts
export type MapDrawing = {
  layer: MapLayer;
  frame: MapFrame;

  /** The light's pixel, or null for a place without a position. */
  you: {x: number; y: number} | null;

  /** The centre of the selected place's button, or null for none. */
  selected: {x: number; y: number} | null;

  /** The top-left corners of the place buttons, from `placeMapButtons`. */
  buttons: {x: number; y: number}[];
};

export class MapPicture {
  readonly view: pixi.Container;

  constructor(options: {map: MapData});

  /** Draws the layer at this frame, the dotted line and the light into the texture. */
  draw(drawing: MapDrawing): void;

  destroy(): void;
}
```

The picture is a `Sprite` that shows a `RenderTexture` as large as the frame in art pixels, created
as `PlacePicture` creates its own: resolution 1, nearest, no antialiasing, dynamic. `draw` resizes
the texture to the frame. It puts one `pixi.Graphics` per context of the layer into a container that
is scaled by `1 / metresPerPixel` and moved so that the frame's centre lies in the middle of the
texture. Above that container it draws, in art pixels, the dotted line, a black square of 10 × 10
around each button's corner (one pixel of black around the 8 × 8 button), and then the light, and
renders the whole into the texture with `game.app.renderer.render`, clearing it to black. None of
the drawings is ever added to a screen.

- **The dotted line** joins the light's pixel and the selected button's centre along the pixels of a
  straight line, and lights every other one in `dim`, starting with the first. Without `you` or
  without a selection there is none.
- **The light** sits on `you`. A pixel at a distance of up to 1.2 from it is `white`; up to 2.6,
  `cyan` where the pixel's offset from the light, `dx + dy`, is even and `blue` where it is odd; up
  to 4.1, `blue` where `dx + dy` is even, so the light looks the same at every place. The light only
  adds colour: the pixels it leaves keep what lies under them.

`draw` runs when the window opens, the way changes, the selection changes and the window is laid out
again, never on the ticker. A frame costs one sprite. The drawing does not throw on good data; a
mistake in the data is the checker's to find.

### The travel window (`screens/travelWindow.ts`)

```ts
export type TravelWindowOptions = {
  ui: UiRoot;
  scheduler: Scheduler;
  start: NightStart;
  from: PlaceId;
  way: Way;
  ways: readonly Way[];
  screenWidth: number;

  /** The screen's height in art pixels. */
  screenHeight: number;

  /** Called once the window has closed, with the destination the player picked, if any. */
  onClosed: (destination: Destination | null) => void;
};

export class TravelWindow {
  readonly modal: Modal;

  constructor(options: TravelWindowOptions);

  /** The way whose places take a press. */
  get way(): Way;

  /** Lays the window out again for a screen of this size. */
  resize(screenWidth: number, screenHeight: number): void;
}
```

The window is a `Panel` in a `Modal` with a fade of `UI_FADE_DURATION`, as before. Its parts:

- **Title and row of ways** as before. In the side-by-side layout the row is 120 wide: three buttons
  of 38 and two gaps of 3.
- **The map area:** a container of the map's size that holds the `MapPicture`'s view and, above it,
  one Tellurion `Button` with no children for every place in `placeData` but `from`, 8 × 8, placed
  absolutely at the corner `placeMapButtons` gives. A button whose place is not a destination of the
  current way is disabled.
- **The destination button:** the selected destination's name and numbers, laid out as a destination
  of the list was (`getDestinationLabel`), with the narrow form below `NARROW_WIDTH` and always in
  the column. Its height is the largest label height among the destinations of all the ways in
  `ways`, and at least 16; that height goes into `getMapSize`. A selection changes its two texts and
  their sizes, not the button.
- **"Back"** as before.

Selecting, switching and laying out:

- The window keeps the current way and the selected destination. It opens with the way's first
  destination of `getDestinations`, and the modal's initial focus is the destination button, or
  "Back" for a way with none.
- A place button selects its destination of the current way and draws the map again. The focus stays
  on it.
- A way's button makes the way current: the title changes, every place button is enabled or disabled
  for the new way (none is rebuilt, so the focus never lands on a button that goes), the selection
  becomes the way's first destination, and the map is drawn again with the way's layer. The focus
  stays on the pressed button; pressing the current way changes nothing.
- The destination button picks the selection and closes the window; `onClosed` receives it. "Back"
  and the cancel command close it with nothing picked.
- `resize` builds the parts again for the new size and keeps the way, the selection and the focused
  control, as before.
- Every button does nothing while the window is closing or closed.

### The night screen (`screens/nightScreen.ts`)

`openTravel` passes the screen's height, the scene area's `top + height`, beside its width. The
layout calls `travelWindow?.resize(area.width, area.top + area.height)`. Opening the window stays
inside the `try` that sends a failure while acting on the night to the error screen.

### The checker (`core/checkContent.ts`)

One rule more: every entry of `places.json` with a position lies inside `map.json`'s box with at
least 2,000 m to spare on every side, its point rounded to whole metres as the script rounds it. An
entry that does not gives the line
`map.json: does not cover "<id>"; run node scripts/fetch-map-data.mjs`.

## Error handling

| What goes wrong                                     | In CI                                        | In the running game                                                        |
| --------------------------------------------------- | -------------------------------------------- | -------------------------------------------------------------------------- |
| A place lies less than 2 km inside `map.json`'s box | The checker fails and names the place        | The map is black where the data ends; the place's button shows             |
| A place has no entry in `places.json`               | The checker fails, as before                 | No button on the map; it can still be the selection, with a `console.warn` |
| A way has no destination                            | The window's test covers it                  | No destination button and no dotted line; the focus on "Back"              |
| The map is too small to keep the buttons apart      | `placeMapButtons`' test covers it            | Buttons may touch; nothing fails                                           |
| The window fails while it opens                     | Its tests                                    | The error screen, through the night screen's `try`                         |
| A press arrives while the window fades              | The window's test covers it                  | Nothing happens                                                            |
| A request of the script fails                       | The script's test covers it, without network | Not in the game: the file stays as it was, exit code 1                     |

## Testing

Unit tests, in `tests/`:

- **`getMapPoint.test.ts`.** The origin is 0, 0. A point north of it has a negative `y`, a point
  east a positive `x`. A thousandth of a degree of latitude is about 111 m.
- **`fitMapFrame.test.ts`.** Every point lands inside the map with the inset. A wider map shows more
  metres sideways at the same scale. A single point lies in the middle at 10 metres per pixel.
- **`placeMapButtons.test.ts`.** Two close points end 4 apart. A point on the light moves off it and
  the light does not move. A button near the edge stays inside. Points far apart keep their places.
  The same input gives the same output.
- **`getTravelLayout.test.ts`.** The four screens of the table give their layouts and sizes, through
  `getTravelLayout` and `getMapSize`; a square screen is stacked.
- **`checkContent.test.ts`.** A sample that breaks the coverage rule gives its line.
- **`content.test.ts`.** The checker over the game's own data, coverage included, gives the empty
  list.
- **`fetchMapData.test.ts`.** With fake answers: the box is the places' box widened by 2,000 m;
  points come out in whole metres; a line within 5 m of straight keeps its two ends; ways come out
  sorted by id; a line of one point and a park of two are dropped; a failed request writes nothing.
  No test touches the network.

Browser tests, in `tests/`:

- **`fixedWorld.ts`** gains the positions of its places and a small map with one line or ring in
  each layer, placed so that a known pixel of each can be checked.
- **`mapPicture.browser.test.ts`.** New, and the plan's first task, as the proof of the drawing. A
  path stroked with `pixelLine` and rendered into an art-size texture lights exactly one pixel per
  step and is not closed. On the fixed world's map: a street's pixel is `shade` and one pixel thick,
  a park's pixel is `ground`, the tram layer has the tram line's pixel and the street layer does
  not, the light's middle is `white`, the dotted line alternates, and the texture has the frame's
  size.
- **`travelWindow.browser.test.ts`.** Rewritten.
  - It opens with the nearest destination selected, and the focus and the ring on the destination
    button.
  - A place's button selects its place and keeps the focus; the selected place pressed again changes
    nothing.
  - A disabled place takes no press and no focus.
  - A way's button changes the title, the layer, the places that take a press and the selection,
    keeps the focus, and moves no button.
  - The destination button closes the window and reports the destination; "Back" and Escape report
    none.
  - A way with no destination opens with the focus on "Back" and no destination button.
  - A press while the window fades does nothing.
  - The four screens of the layout table get their layout, and the window fits each.
  - A resize keeps the way, the selection and the focus.
  - The arrow keys reach the places and the destination button.
  - It is driven by real taps and by keys.
- **`nightScreenPlaces.browser.test.ts`.** The journey goes through a place on the map and then the
  destination button.

The lessons of the earlier phases' reviews hold for every new button and test: closing guards, the
focus kept when parts are rebuilt, sizes that do not jump, an exact screen size through the
viewport, and taps through `userEvent.click`.

Run from the repository root:

```sh
npx turbo run typecheck lint test --filter=tellurion --filter=somewhere --filter=foam --concurrency=1
```

## Done when

- The turbo command above passes, the checker included.
- In the running app, every step of "What the player sees" can be observed on an upright phone, on
  the narrowest screen, in a wide window and on a phone turned sideways.
- No file under `apps/somewhere/` or `packages/tellurion/` has changed.

## Non-goals

- A credit to OpenStreetMap on the screen.
- A look for the selected place on the map.
- Names on the map.
- Moving or zooming the map.
- Routes along the streets: the dotted line is straight.
- Parks mapped as relations, water areas and buildings.
- A light that moves.
- Checkerboards and dashes on the map.
- Changes to the travel data or to journeys.
- Changes to Somewhere and to Tellurion.

## Rejected

- **A list beside the map,** and **a map that only shows** while the list picks. The map is the
  picker; one button names the selection and makes the journey.
- **Places as toggles with a checked look,** and **the focus ring as the mark of the selection.** A
  toggle flips on every press, and the ring hides after a tap, so a tapped selection would vanish.
- **Buttons with the places' names,** and **names as text beside the buttons.** Names cover the map
  and push buttons off their places in the centre.
- **A map of points only,** **landmarks without streets,** and **one street layer for every way.**
  Points say nothing of the city; one layer for all ways does not show why the tram reaches only the
  stops.
- **One stacked layout on every screen.** On a phone turned sideways the map would be a strip with
  the centre's places 5 pixels apart.
- **Drawing the map pixel by pixel in TypeScript.** It would be a small graphics library of the
  game's own, drawing on the processor at every change; Pixi's one-pixel lines draw the same on the
  graphics card from geometry built once.
- **Finished images drawn by a script.** The map's scale and shape change with the screen.
- **Rivers two pixels wide,** drawn as a second stroke shifted by a pixel.
- **A frame around the map.** It is a button's frame and made the whole map look like one button.
