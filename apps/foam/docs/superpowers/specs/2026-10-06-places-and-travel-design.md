# Places and travel (Foam phase 4, spec 2 of 3): design

Date: 2026-10-06. App: `apps/foam`. Status: implemented by
[2026-10-06-places-and-travel.md](../plans/2026-10-06-places-and-travel.md). It is the second of
phase 4's three specs in the [direction document](../../direction.md). It needs the Tellurion
addition
[dialogue choice effect](../../../../../docs/superpowers/specs/2026-10-06-dialogue-choice-effect-design.md),
which is built first. The third spec, the drawn map, follows this one.

## Background

Phase 3 left a night screen that knows one place. `content/samplePlace.ts` is an invented bar with
four scene buttons. `screens/nightScreen.ts` imports it, builds its buttons and its picture once,
and never shows another place. `core/night.ts` holds the minutes, the money and a state of mind. A
scene button opens a story window that runs a Tellurion dialogue script with the night as its
context, and a node's `onEnter` changes the night.

Three things shape this spec:

- **The author writes the content over a long time, and the building cannot wait for it.** The game
  is built on stand-in content. The author replaces and extends it later, without touching game
  code. Stand-in content and final content live in the same files and the same form.
- **The night happens in real places of Brno.** It starts on the train. The first real places are
  The Whisky Shop Brno in Husovice and Rotor Bar in Dvořákova street.
- **Three ways of travelling are enough to try the loop:** on foot, by tram and by taxi, each with
  its own minutes and price.

Three test files name the sample bar's sentences and labels: `tests/nightScreen.browser.test.ts`,
`tests/nightScreenHelpers.tsx` and `tests/samplePlace.test.ts`.

## Decisions (from brainstorming)

1. **Content is TypeScript,** in the form of Tellurion's dialogue scripts, one file per place.
   Whether a language made for writing replaces it is decided with the content model, at the review
   after phase 6.
2. **Places come before rules.** This spec adds places and travel. Closing times, drunkenness, dice,
   actions the player cannot afford, the end of the night and the log are phase 5.
3. **Seven places:** the train, the stations Brno-Židenice and Brno hlavní nádraží, The Whisky Shop
   Brno, Rotor Bar, and the tram stops Náměstí Republiky and Malinovského náměstí.
4. **The train is the first place.** The player gets off at Brno-Židenice or rides on to the main
   station. Each station is a place of its own.
5. **A tram stop is a place of its own,** with a picture, buttons and a description.
6. **The player leaves a place through a thing in its picture.** That scene button's window offers
   the ways of travelling and "Stay". Picking a way opens the travel window, which lists where that
   way leads, with the minutes and the price of each destination.
7. **The travel window is the map without its drawing.** The next spec adds the drawn map to it and
   keeps the list.
8. **Travel data is hand-kept data in the game's files.** A script fills in a first value for
   whatever is missing and never changes a value that is there. What the script wrote carries a mark
   until the author has checked it.
9. **A choice opens the travel window through `onChoose`,** the Tellurion addition, with no node of
   text in between.
10. **No picture of a real place is drawn here.** Both bars show the sample bar's picture, and the
    other five places show a plain stand-in.
11. **All text is stand-in text,** invented for this spec and marked as such in the content files.

Proposals made with the design sections and accepted:

- The travel window has a row of ways, so the player compares the ways without going back to the
  door.
- A journey has a text, one script for each way.
- A place types its description at every arrival.
- A place with a long name has a short name for the place button.
- The stations carry their Czech names.
- The jump-in works in every build.
- The scene is not shown during a journey.
- Places change with a cut.
- Destinations are listed nearest first.
- A night starts at 17:00 with 350 Kč.

## Design

### What the player sees

1. New Game shows the train. The story window types its description, as it types the sample bar's
   today.
2. The train's door is a scene button. Its window types a text and offers "Get off at
   Brno-Židenice", "Ride on to the main station" and "Not yet".
3. After either of the first two, the window types a line of the arrival, the clock moves by the
   ride, and the window ends. The scene becomes that station, and the station's description types
   out.
4. The station has a scene button to leave through. Its window types a text and offers "Walk", "Take
   the tram", "Take a taxi" and "Stay".
5. Picking a way ends the story window, and the travel window opens on that way. It shows a title, a
   row of the ways, the destinations of the current way and "Back":

   ```
   ┌ On foot ───────────────────────┐
   │ Walk      Tram      Taxi       │
   │                                │
   │ Brno-Židenice           23 min │
   │ Rotor Bar               35 min │
   │ Brno hlavní nádraží     42 min │
   │                                │
   │ Back                           │
   └────────────────────────────────┘
   ```

   This is the window at The Whisky Shop Brno, with real walking times.

6. A button of the row switches the list to that way, and the title follows.
7. "Back" or Escape closes the travel window. The player is in the place again and nothing has
   changed.
8. Picking a destination closes the travel window. The minutes are added and the price is taken, and
   the status line shows both. The picture, the place button and the scene buttons are gone, and a
   story window types the journey's text over the black screen.
9. When that text ends, the scene becomes the destination: its picture, its place button, its scene
   buttons, and its description typing out.
10. A tram stop is left the same way: on foot or by taxi to a station or a bar, by tram to the other
    stop.
11. The place button types the place's description again, as today.
12. Escape closes the travel window. Over a story window, a journey's too, it opens the menu, as
    today.

The money can go below zero. Nothing closes, nobody gets drunk, and the night does not end: the only
way out is the menu's "Quit to menu".

### The places

| Id                    | Name                 | On the place button | Title of its description | Picture  |
| --------------------- | -------------------- | ------------------- | ------------------------ | -------- |
| `train`               | The train            | The train           | The train                | Stand-in |
| `zidenice`            | Brno-Židenice        | Brno-Židenice       | Brno-Židenice            | Stand-in |
| `hlavniNadrazi`       | Brno hlavní nádraží  | Hlavní nádraží      | Brno hlavní nádraží      | Stand-in |
| `whiskyShop`          | The Whisky Shop Brno | Whisky Shop         | The Whisky Shop          | The bar  |
| `rotorBar`            | Rotor Bar            | Rotor Bar           | Rotor Bar                | The bar  |
| `namestiRepubliky`    | Náměstí Republiky    | Nám. Republiky      | Náměstí Republiky        | Stand-in |
| `malinovskehoNamesti` | Malinovského náměstí | Malinovského        | Malinovského nám.        | Stand-in |

A window's title holds 19 characters on the narrowest screen, and two of the names have 20. Their
descriptions are titled with a shorter form. The name is what the travel window lists, where it
wraps.

Náměstí Republiky is the tram stop by The Whisky Shop Brno, 288 m away. Malinovského náměstí is the
one by Rotor Bar, 271 m away. The texts call the stations "Židenice" and "the main station".

Every place but the train offers all three ways of travelling.

| Place                | Scene button     | Stand-in idea                                                                    |
| -------------------- | ---------------- | -------------------------------------------------------------------------------- |
| The train            | The window       | Brno arrives back to front: allotments, the river, the wall of an old factory    |
|                      | A passenger      | Says, unasked, which stop is for what, so a stranger learns where each one leads |
|                      | The door         | The way out: Židenice or the main station                                        |
| Brno-Židenice        | The timetable    | A paper timetable behind cracked glass, listing the trains back                  |
|                      | The bench        | A man waiting for a train that is not on the timetable                           |
|                      | The underpass    | The way out                                                                      |
| Brno hlavní nádraží  | The board        | The departures board: the trains that leave tonight                              |
|                      | The hall         | The city has been about to move this station for a hundred years                 |
|                      | The doors        | The way out                                                                      |
| The Whisky Shop Brno | The shelves      | Sixty open bottles; a dram costs money and minutes                               |
|                      | The shopkeeper   | Asks whether the player likes smoke or sweet                                     |
|                      | Two regulars     | One is saving a bottle for an occasion that never comes                          |
|                      | The door         | The way out                                                                      |
| Rotor Bar            | The bar          | A beer costs money and minutes                                                   |
|                      | The corner table | Strangers with one spare chair                                                   |
|                      | The smokers      | The pavement outside, where strangers talk                                       |
|                      | The door         | The way out                                                                      |
| Náměstí Republiky    | The shelter      | Someone who has just missed a tram                                               |
|                      | The display      | The minutes to the next tram, as a fixed number                                  |
|                      | The street       | The way out                                                                      |
| Malinovského náměstí | The theatre      | The steps of the theatre at the interval                                         |
|                      | The display      | The minutes to the next tram, as a fixed number                                  |
|                      | The street       | The way out                                                                      |

The stand-in text is thin:

- A description is two or three sentences.
- A scene button is one node of one or two sentences. The dram and the beer are one choice each,
  whose node takes money and adds minutes in its `onEnter`, as the sample bar's beer does.
- People have no names. Places, streets and stops keep their real names.
- Every text is written with the `standIn` tag (see below).
- The limits of `samplePlace.ts` hold: no word is longer than 16 characters, every node sets
  `speaker`, and the italic marks of a text come in pairs.

On the stand-in picture a scene button lies on nothing. Its `x` and `y` only keep the buttons apart
on a wide and on a narrow screen. In the two bars the buttons take the positions the sample bar's
buttons have, so they lie on the counter, the tables and the door.

### Files

| File                                             | Change                                                                                       |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| `source/game/core/night.ts`                      | `PlaceId`, `Way`, two new fields of `Night`, `createNight` takes a start                     |
| `source/game/core/place.ts`                      | New. `Spot` and `Place`, moved from `samplePlace.ts` and extended                            |
| `source/game/core/prose.ts`                      | New. The tags `prose` and `standIn`                                                          |
| `source/game/core/createWayOut.ts`               | New. `createWayOut` and `leaveBy`                                                            |
| `source/game/core/travel.ts`                     | New. The types of the travel data and of a night's start, reading the data, taking a journey |
| `source/game/core/getExpectedJourneys.ts`        | New. Which journeys the travel data has to hold                                              |
| `source/game/core/getLabelRoom.ts`               | New. How many characters each kind of label holds on the narrowest screen                    |
| `source/game/core/checkContent.ts`               | New. The checker's rules                                                                     |
| `source/game/core/getJumpIn.ts`                  | New. Reads the start of a night from an address                                              |
| `source/game/content/places.ts`                  | New. The record of all places                                                                |
| `source/game/content/places/*.ts`                | New. Seven files, one per place                                                              |
| `source/game/content/journeys.ts`                | New. One script per way of travelling                                                        |
| `source/game/content/nightStart.ts`              | New. What a night starts with                                                                |
| `source/game/content/data/places.json`           | New. Where each place is, and its opening hours                                              |
| `source/game/content/data/travel.json`           | New. The minutes and the price of every journey                                              |
| `source/game/content/data/README.md`             | New. Says where the data comes from and credits OpenStreetMap                                |
| `source/game/content/pictures/barPicture.ts`     | Moved from `content/barPicture.ts`, unchanged                                                |
| `source/game/content/pictures/standInPicture.ts` | New. Black, with one lamp                                                                    |
| `source/game/content/samplePlace.ts`             | Removed. Its content becomes the tests' fixed place                                          |
| `source/game/screens/nightScreen.ts`             | Shows the night's place, changes place, opens the travel window                              |
| `source/game/screens/travelWindow.ts`            | New. The travel window                                                                       |
| `source/game/screens/mainMenuScreen.ts`          | The import path of the bar's picture                                                         |
| `source/routes/_index.tsx`                       | The jump-in                                                                                  |
| `scripts/fill-travel-data.mjs`                   | New. Fills what the two data files lack                                                      |
| `scripts/list-stand-ins.mjs`                     | New. Lists what is left to write and to check                                                |
| `tests/fixedWorld.ts`                            | New. The tests' places and travel data                                                       |

### The night (`core/night.ts`)

```ts
export type PlaceId =
  | 'hlavniNadrazi'
  | 'malinovskehoNamesti'
  | 'namestiRepubliky'
  | 'rotorBar'
  | 'train'
  | 'whiskyShop'
  | 'zidenice';

export type Way = 'taxi' | 'tram' | 'walk';

export type Night = {
  /** Minutes since midnight; 19:40 is 1180. */
  minutes: number;

  /** Money, in Kč. */
  money: number;

  /** State of mind, shown as written. */
  stateOfMind: string;

  /** The place the player is in. */
  place: PlaceId;

  /** Set by a way out: the way the player picked, and the ways that way out offers. */
  leaving: {way: Way; ways: readonly Way[]} | null;
};

export function createNight(start: {place: PlaceId; minutes: number; money: number}): Night;
```

`createNight` returns the start's three values with `stateOfMind: 'Sober'` and `leaving: null`.
`formatStatus` does not change.

Scripts only change the night. A script moves the player by setting `night.place`, and a way out
asks for the travel window by setting `night.leaving`. The night screen acts on both when the story
window closes.

### A place (`core/place.ts`, `content/places.ts`)

```ts
export type Spot = {
  /** Label of the scene button. */
  label: string;

  /** Centre of the button, as fractions of the scene area's width and height. */
  x: number;
  y: number;

  script: RunnableDialogueScript<Night>;
};

export type Place = {
  id: PlaceId;

  /** The real name. The travel window lists the place by it. */
  name: string;

  /** Label of the place button, for a name that does not fit it. */
  shortName?: string;

  description: RunnableDialogueScript<Night>;

  /** GLSL of the place: the function that draws its picture (see core/pictureShader.ts). */
  picture: string;

  spots: Spot[];
};
```

`content/places.ts` exports `places: Record<PlaceId, Place>`, so a `PlaceId` without a place does
not compile.

Adding a place touches four things: its id in `PlaceId`, its file, its line in `places`, and its
entry in `data/places.json`. The compiler reports the first three when one is missing, and the
checker reports the fourth.

### Writing a text (`core/prose.ts`)

```ts
export function prose(strings: TemplateStringsArray, ...values: unknown[]): string[] | string;
export function standIn(strings: TemplateStringsArray, ...values: unknown[]): string[] | string;
```

Both are template tags that do the same thing:

1. The values are put into the text as written.
2. Every line is trimmed, and blank lines at the start and at the end are dropped.
3. Lines that follow each other are joined with one space.
4. One or more blank lines inside the text end a page.
5. A text of one page comes back as a string, a text of several pages as a list of strings.

So the author wraps and indents a text freely. The story window already shows a node of several
pages and cuts each page to the window's size.

`standIn` marks a text as a stand-in. The mark exists only in the source: when the author writes the
real text, the word `standIn` becomes `prose`.

```ts
const description = defineDialogueScript<Night>()({
  start: {
    speaker: NAME,
    text: standIn`
      A narrow room with the bar along one wall. Every stool is taken, and the
      music is a little too loud to talk under.
    `,
  },
});
```

### A way out (`core/createWayOut.ts`)

```ts
export type WayOutOptions = {
  speaker: string;
  text: string[] | string;

  /** The ways of travelling this way out offers, in the order of its choices. */
  ways: readonly Way[];
};

/** Returns the effect of a choice that leaves by `way`. */
export function leaveBy(way: Way, ways: readonly Way[]): (night: Night) => void;

export function createWayOut(options: WayOutOptions): RunnableDialogueScript<Night>;
```

`leaveBy` returns a function that sets `night.leaving` to `{way, ways}`.

`createWayOut` returns a script of one node with the speaker, the text and these choices: one for
each way, labelled "Walk", "Take the tram" or "Take a taxi", with `onChoose: leaveBy(way, ways)` and
no `next`; then "Stay", with neither. "Stay" is the way out of the node that costs nothing.

```ts
const door = createWayOut({
  speaker: DOOR,
  text: standIn`The street is one step down. A tram bell rings somewhere close.`,
  ways: ['walk', 'tram', 'taxi'],
});
```

A place that needs another way out writes its script by hand. The train does:

```ts
const door = defineDialogueScript<Night>()({
  start: 'door',
  nodes: {
    door: {
      speaker: DOOR,
      text: standIn`The train slows. Židenice is next, and the main station after it.`,
      choices: [
        {text: 'Get off at Brno-Židenice', next: 'zidenice'},
        {text: 'Ride on to the main station', next: 'hlavniNadrazi'},
        {text: 'Not yet'},
      ],
    },
    zidenice: {
      speaker: DOOR,
      text: standIn`The platform is short and nearly empty.`,
      onEnter: (night) => {
        night.minutes += 4;
        night.place = 'zidenice';
      },
    },
    hlavniNadrazi: {
      speaker: DOOR,
      text: standIn`The train crosses the river and rolls into the main station.`,
      onEnter: (night) => {
        night.minutes += 9;
        night.place = 'hlavniNadrazi';
      },
    },
  },
});
```

The minutes and the prices in the place files are stand-in numbers.

### What a night starts with (`core/travel.ts`, `content/nightStart.ts`)

```ts
export type NightStart = {
  /** The places of the night, by id. */
  places: Readonly<Record<string, Place>>;

  travel: Travel;

  /** The place a night starts in. */
  place: PlaceId;

  minutes: number;
  money: number;
};

export const nightStart: NightStart;
```

The type is declared in `core/travel.ts`, beside the travel data's types, and the value in
`content/nightStart.ts`. `nightStart` holds the game's `places`, the content of `data/travel.json`,
`place: 'train'`, `minutes: 1020` (17:00) and `money: 350`. The hour and the money are stand-in
numbers.

The night screen reads `nightStart` whenever it is shown. Two things change it:

- The jump-in sets `place`, `minutes` and `money` once, when the game starts. They stay for that
  page load, so "Quit to menu" and "New Game" start the same scene again.
- A test puts in the places and the travel data of `tests/fixedWorld.ts`, and puts the game's own
  back afterwards.

### Travel data (`content/data/`)

`places.json` has one entry for each place that is on the map. The train has none.

```json
{
  "rotorBar": {
    "kind": "place",
    "address": "Dvořákova 12",
    "osmName": "Rotor bar",
    "position": {"latitude": 49.19593, "longitude": 16.61131},
    "nearestTramStop": {
      "name": "Náměstí Svobody",
      "position": {"latitude": 49.19485, "longitude": 16.60835}
    },
    "openingHours": "Mo-Th 16:00-01:00, Fr 16:00-03:00, Sa 17:00-03:00",
    "computed": true
  },
  "namestiRepubliky": {
    "kind": "stop",
    "tramStop": "Náměstí Republiky",
    "position": {"latitude": 49.20935, "longitude": 16.62864},
    "computed": true
  }
}
```

The positions of the two tram stops above are examples; the script writes the real ones.

| Field             | Written by | Meaning                                                                             |
| ----------------- | ---------- | ----------------------------------------------------------------------------------- |
| `kind`            | The author | `"place"` for a station or a bar, `"stop"` for a tram stop                          |
| `address`         | The author | Street and number in Brno, for a building                                           |
| `station`         | The author | The station's name in OpenStreetMap, instead of an address                          |
| `tramStop`        | The author | The stop's name in OpenStreetMap, instead of an address; only with `"kind": "stop"` |
| `osmName`         | The author | Optional. The place's name in OpenStreetMap, for its opening hours                  |
| `position`        | The script | Latitude and longitude, to five decimals                                            |
| `nearestTramStop` | The script | For a place: the real tram stop nearest to it, where a tram journey from it starts  |
| `openingHours`    | Either     | In OpenStreetMap's notation. The game does not read it before phase 5               |
| `computed`        | The script | `true` while the entry holds a value of the script that the author has not checked  |

The author may type any field the script would write. The Whisky Shop Brno is not in OpenStreetMap
under its name, so its opening hours are typed: `"Mo-Su 16:30-21:00"`.

`travel.json` holds every journey the game offers, by where it starts, by the way, and by where it
ends:

```json
{
  "whiskyShop": {
    "walk": {
      "zidenice": {"minutes": 23, "computed": true},
      "rotorBar": {"minutes": 35, "computed": true},
      "hlavniNadrazi": {"minutes": 42, "computed": true}
    },
    "tram": {
      "malinovskehoNamesti": {"minutes": 19, "price": 25, "computed": true}
    },
    "taxi": {
      "rotorBar": {"minutes": 11, "price": 170, "computed": true}
    }
  }
}
```

A journey has `minutes`, a `price` in Kč where it costs something, and `computed` while its numbers
are the script's and unchecked. Each direction is a journey of its own, so one direction can be made
slower than the other.

To correct a number, the author changes it and deletes `"computed": true` beside it. To get a fresh
number, the author deletes the journey and runs the script again.

Which journeys the file has to hold (`core/getExpectedJourneys.ts`):

- **On foot and by taxi:** from every entry to every entry of kind `"place"`, except itself.
- **By tram:** from every entry to every entry of kind `"stop"`, except itself, and except from a
  place to the stop that is its `nearestTramStop`.

`getExpectedJourneys(places)` returns them as a list of `{from, way, to}`. It imports nothing, so
the script can read it, as the art script reads `palette.ts`. For this spec's six entries that is
about 50 journeys.

`core/travel.ts` (`PlaceEntry` has the fields of the table above):

```ts
/** The content of `places.json`: its entries by place id. */
export type PlaceData = Readonly<Record<string, PlaceEntry>>;

export type Journey = {minutes: number; price?: number; computed?: boolean};
export type Travel = Readonly<
  Record<string, Partial<Record<Way, Readonly<Record<string, Journey>>>>>
>;

export type Destination = {place: Place; way: Way; minutes: number; price: number};

/** The destinations from a place by a way, nearest first, then by name. */
export function getDestinations(start: NightStart, from: PlaceId, way: Way): Destination[];

/** Adds the journey's minutes, takes its price and sets the night's place. */
export function takeJourney(night: Night, destination: Destination): void;

/** "35 min", or "11 min  170 Kč" for a journey with a price. */
export function formatJourney(destination: Destination): string;
```

`getDestinations` leaves out a journey whose end is not in `start.places`, with a `console.warn`. A
journey without a `price` has the price 0.

### The script that fills the data (`scripts/fill-travel-data.mjs`)

Run with `node scripts/fill-travel-data.mjs`, as the script that draws the UI art is.

1. It reads the two data files.
2. For an entry without `position`, it looks the place up in OpenStreetMap: a building by its
   `address` inside Brno, a station or a tram stop by its name. A stop that has several points under
   one name gets the middle of them.
3. For an entry of kind `"place"` without `nearestTramStop`, it takes the nearest tram stop in
   OpenStreetMap.
4. For an entry with `osmName` and without `openingHours`, it takes the opening hours of the thing
   of that name within 150 m of the position, if OpenStreetMap has them.
5. For every journey of `getExpectedJourneys` that `travel.json` lacks, it works out the numbers:

   | Number          | How                                                                           |
   | --------------- | ----------------------------------------------------------------------------- |
   | Walking minutes | The walking route over real streets, from a routing service on OpenStreetMap  |
   | Taxi minutes    | A wait, plus the driving route's time from the same service                   |
   | Taxi price      | A base fare plus a price per kilometre of the driving route, rounded to 10 Kč |
   | Tram minutes    | The walk to `nearestTramStop`, a wait, and the ride between the two stops     |
   | Tram price      | One ticket                                                                    |

   The walk to the stop and the ride are worked out from the straight line between two positions:
   the walk at 80 metres a minute over 1.3 times the line, the ride at a tram's average speed over
   1.3 times the line. A journey from a stop has no walk. Every journey takes at least one minute.

6. It marks every entry and every journey it wrote with `"computed": true`.
7. It writes the two files in the form Prettier keeps, prints what it added, and prints what it
   could not get.

The waits, the tram's speed, the ticket and the taxi's fare are named constants at the top of the
script, with stand-in values: a wait of 5 minutes for a tram and for a taxi, 300 metres a minute for
a tram, 25 Kč for a ticket, 60 Kč and 36 Kč a kilometre for a taxi.

Rules of the script:

- It never changes a value that is there. Run on complete files, it changes nothing.
- It asks one thing at a time and names itself in every request; the map server refuses a request
  without a name.
- When a server is busy or a place is not found, it writes what it has, lists what is missing and
  ends with an error code. The next run fills the rest.
- The game never talks to these servers. It reads the two files.

The script exports the part that decides and computes, `fillTravelData({places, travel, lookups})`,
where `lookups` are the functions that ask the servers. The tests call it with fakes.

`content/data/README.md` says that the positions, the opening hours and the routes come from
OpenStreetMap, credits its contributors as its licence asks, and says how to run the script.

### The night screen (`screens/nightScreen.ts`)

The screen's contents:

| Member                                     | Lives                                                  |
| ------------------------------------------ | ------------------------------------------------------ |
| `statusText`, `menuButton`                 | From `onAttach`, as today                              |
| `night`                                    | Made in `onShow` from `nightStart`                     |
| `place`                                    | The place being shown, or `null` during a journey      |
| `picture`, `placeButton`, `spotButtons`    | Built when a place is shown, destroyed when it is left |
| `storyWindow`, `menuModal`, `optionsModal` | As today                                               |
| `travelWindow`                             | From a way out's choice until its modal has closed     |

**Showing a place** (`showPlace`):

1. It leaves the place being shown, if there is one.
2. It builds the place's `PlacePicture` and adds it to the view.
3. It builds the place button, labelled `shortName ?? name`, and the scene buttons, and adds them to
   the UI.
4. It lays them out. The status line stands beside the place button, so it moves with that button's
   width. On a screen narrower than the top row width, 292 art pixels, it stands under the place
   button: from 292 the widest place button, a status line of 24 characters and Menu fit one line.
5. It sets `night.leaving` to `null` and writes the status.
6. It opens the place's description in a story window.

**Leaving a place** (`leavePlace`): it takes the picture out of the view and destroys it, takes the
place button and the scene buttons out of the UI and destroys them, and sets `place` to `null`. The
screen behind is black, which is the game's background colour.

**`onShow`** makes the night from `nightStart` and shows `nightStart.places[night.place]`.
**`onHide`** destroys the open windows, the topmost first, and leaves the place.

**When a story window has closed,** the screen writes the status and then looks at the night:

1. If `night.place` is not the id of the place being shown, it shows
   `nightStart.places[night.place]`. If no such place exists, it warns in the console, sets
   `night.place` back to the place being shown and sets `night.leaving` to `null`, so the script's
   move is dropped as a whole. A journey's destination is always a known place, so this cannot
   happen during a journey.
2. Otherwise, if `night.leaving` is set, it opens the travel window with that way and those ways,
   and sets `night.leaving` to `null`.

**When the travel window has closed** with a destination picked, the screen takes the journey
(`takeJourney`), leaves the place, writes the status, and opens the journey's script of that way in
a story window. When that window has closed, rule 1 above shows the destination.

The cancel command keeps its rule: the engine sends it to the topmost overlay, and the screen opens
the menu when that overlay declares no `close`. The travel window is a `Modal`, so Escape closes it.

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

  /** Called once the window has closed, with the destination the player picked, if any. */
  onClosed: (destination: Destination | null) => void;
};

export class TravelWindow {
  /** The overlay. The constructor adds it to `ui`; the night screen destroys it when hidden. */
  readonly modal: Modal;

  constructor(options: TravelWindowOptions);

  /** Lays the window out again for a screen of this width. */
  resize(screenWidth: number): void;
}
```

The window is a `Panel` in a `Modal` with a fade of 200 ms, built the way `openMenuModal` builds the
menu. The constructor adds the modal to `ui`. The night screen calls `resize` from its own layout,
as it calls the story window's `resize`, so a phone that is turned while the window is open gets the
layout of its new width. A resize keeps the current way and the focus.

- **Width.** The story window's: 300 art pixels, or the screen less a margin on each side.
- **Title.** "On foot", "By tram" or "By taxi", through `createWindowTitle`.
- **Row of ways.** One button for each of `ways`, labelled "Walk", "Tram" and "Taxi". They share the
  window's width equally, so the three fit the narrowest screen. Pressing one makes it the current
  way: the title and the list change, and the focus stays on the pressed button. Pressing the
  current way changes nothing.
- **List.** One button for each destination of the current way, in the order of `getDestinations`.
  It shows the place's name and `formatJourney`'s text. On a screen at least `NARROW_WIDTH` wide the
  two stand on one line, the name left and the numbers right. On a narrower one the numbers stand
  under the name. A name that is longer than its room wraps, as a choice's label does in the story
  window.
- **Back.** Closes the window.
- **Height.** The window is as high as its longest list needs, of all the ways in `ways`. Switching
  the way then moves no button.
- **Focus.** The window opens with the first destination focused and the ring shown. A way with no
  destination opens with "Back" focused.
- **Closing guards.** Every button does nothing while the window is closing or closed.

Picking a destination remembers it and closes the window. `onClosed` then receives it. "Back" and
the cancel command close the window with nothing picked, and `onClosed` receives `null`.

With this spec's places the longest list has four destinations, and the window fits a screen of 146
× 262 art pixels. The list does not scroll.

### Journeys (`content/journeys.ts`)

`journeys: Record<Way, RunnableDialogueScript<Night>>` has one script for each way. Each is one node
with a speaker ("On foot", "The tram", "The taxi") and a stand-in text. The text is a function of
the night, so it can name the destination: when the script runs, `night.place` is already the
destination.

A journey is a script like any other. It can get more nodes and choices of its own without new code.

### Pictures (`content/pictures/`)

`standInPicture.ts` exports the GLSL of a picture that is black with one lamp. It uses the shared
code of `core/pictureShader.ts`: a `glow` around a point in the upper middle, toned with the warm
ladder, with a power that rises and falls slowly. It is a few lines.

Each place gets a new `PlacePicture` when it is shown. The main menu keeps the bar's picture.

### The jump-in (`core/getJumpIn.ts`, `routes/_index.tsx`)

```ts
/** Reads the start of a night from an address's query, or returns null when it names no known place. */
export function getJumpIn(
  search: string,
  places: Readonly<Record<string, Place>>,
): {place: PlaceId; minutes?: number; money?: number} | null;
```

| Parameter | Form           | Meaning                                                                |
| --------- | -------------- | ---------------------------------------------------------------------- |
| `place`   | A place's id   | Where the night starts. Without a known place the jump-in does nothing |
| `time`    | `HH:MM`        | The hour. A time before noon counts as after midnight: `01:30` is 1530 |
| `money`   | A whole number | The money in Kč; it may be negative                                    |

Example: `/?place=rotorBar&time=23:10&money=120`.

`routes/_index.tsx` shows the main menu once the game has started. With a jump-in it writes the
values into `nightStart` and shows the night screen instead. A `place` the game does not know, a
`time` or a `money` in another form: each is ignored with a `console.warn`.

The jump-in works in every build, so a scene can be tried on a phone from the deployed build.

### The checker (`core/checkContent.ts`, `core/getLabelRoom.ts`)

```ts
export function checkContent(content: {
  places: Readonly<Record<string, Place>>;
  journeys: Record<Way, RunnableDialogueScript<Night>>;
  placeData: PlaceData;
  travel: Travel;
}): string[];
```

It returns one line for each problem and an empty list for content without one. A test runs it over
the game's content and expects the empty list, so it runs with the unit tests and in CI.

| Rule                                                                                 | Example of a report                                                                      |
| ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| No word of a text is longer than 16 characters, counted without marks                | `rotorBar › The bar › beer: "…" has 17 characters, and 16 fit`                           |
| The italic marks of a page come in pairs                                             | `train › The window › start: page 1 has 3 italic marks`                                  |
| Every node sets `speaker`                                                            | `zidenice › The bench › start: no speaker`                                               |
| A speaker fits a window's title                                                      | `whiskyShop › description › start: the title "…" has 20 characters, and 19 fit`          |
| The place button's label fits                                                        | `whiskyShop: the name has 20 characters and the place button holds 14; give a shortName` |
| A scene button's label fits                                                          | `rotorBar › "…": the label has 23 characters, and 21 fit`                                |
| A scene button's `x` and `y` are between 0 and 1                                     | `train › The door: x is 1.2`                                                             |
| Every place but the train has an entry in `places.json`, and the other way round     | `places.json: no entry for "rotorBar"`                                                   |
| An entry has a `kind` and a `position`                                               | `places.json › zidenice: no position; run the fill script`                               |
| `travel.json` holds every journey of `getExpectedJourneys`, and no other             | `travel.json: no journey whiskyShop › tram › malinovskehoNamesti`                        |
| A journey's minutes are a whole number above 0; a price is a whole number, 0 or more | `travel.json › whiskyShop › taxi › rotorBar: minutes is 0`                               |
| A journey by tram or by taxi has a price                                             | `travel.json › zidenice › taxi › rotorBar: no price`                                     |

A text that is a function is checked once for every place as `night.place`.

`getLabelRoom.ts` works the three label limits out from the layout's own sizes on the narrowest
screen, 146 art pixels across, at 6 art pixels a character: 19 for a window's title, 14 for the
place button beside the Menu button, 21 for a scene button. The limit of 16 for a word is the one
the content has kept since phase 2.

A node where every choice costs something is not reported here. A cost sits inside a function, which
the checker cannot read. That rule comes with phase 5, when a price is a plain field.

### The list of what is left (`scripts/list-stand-ins.mjs`)

Run with `node scripts/list-stand-ins.mjs`. It reads the files of `content/places/` and
`content/journeys.ts` as text, counts the tags, and counts the marks in the two data files:

```
Texts                    stand-in  written
train.ts                        6        0
rotorBar.ts                     6        0
...
journeys.ts                     3        0

Places not checked:   6 of 6
Journeys not checked: 48 of 48
```

It exports the function that counts the tags of one source text, for its test.

## Error handling

| What goes wrong                                              | In CI                       | In the running game                                            |
| ------------------------------------------------------------ | --------------------------- | -------------------------------------------------------------- |
| A journey ends in a place that does not exist                | The checker fails           | The journey is left out of the list, with a `console.warn`     |
| A journey the data should hold is missing                    | The checker fails           | The destination is not listed                                  |
| A way out offers a way with no journey from that place       | The checker fails, as above | The list is empty; the window shows the row of ways and "Back" |
| A script sets `night.place` to a misspelt id                 | It does not compile         | Cannot happen                                                  |
| `night.place` names a place `nightStart.places` lacks        | Not checked                 | A `console.warn`; the player stays, `leaving` is cleared       |
| A journey's destination is a place `nightStart.places` lacks | Not checked                 | The error screen                                               |
| A script sets `night.place` and `night.leaving` together     | Not checked                 | The place wins: showing a place clears `leaving`               |
| A place's picture does not compile                           | The picture's test fails    | The error screen, as today                                     |
| The jump-in names an unknown place                           | Its test covers it          | The main menu shows, with a `console.warn`                     |
| The jump-in has a time or money in another form              | Its test covers it          | That value is ignored, with a `console.warn`                   |
| A press arrives while the travel window fades                | Its test covers it          | Nothing happens                                                |
| The money goes below zero                                    | Allowed                     | Allowed                                                        |

The fill script's own failures are in its section: it writes what it has, lists what is missing and
ends with an error code.

## Testing

Unit tests, in `tests/`:

- **`prose.test.ts`.** Wrapped lines join with one space. Indentation and outer blank lines go. A
  blank line starts a page, and several blank lines start one page. Values are put in as written.
  Italic marks stay. `standIn` gives what `prose` gives.
- **`createWayOut.test.ts`.** The script has one choice per way in the order of `ways`, then "Stay".
  Run through a `Dialogue`, each way's choice sets `night.leaving` and ends the dialogue. "Stay"
  ends it and leaves `night.leaving` as it was.
- **`night.test.ts`.** `createNight` returns the start's values, a sober state of mind and no
  `leaving`.
- **`travel.test.ts`.** `getDestinations` returns a place's destinations by a way nearest first,
  then by name; leaves out an unknown place; returns none for a way without journeys. `takeJourney`
  adds the minutes, takes the price and sets the place. `formatJourney` gives both forms.
- **`getExpectedJourneys.test.ts`.** For two places and two stops it returns exactly the journeys of
  the two rules, without a tram journey to a place's own nearest stop.
- **`checkContent.test.ts`.** Each rule has a sample that breaks it and the line it must report, and
  a sample of good content gives the empty list.
- **`content.test.ts`.** `checkContent` over the game's own places, journeys and data gives the
  empty list.
- **`fillTravelData.test.ts`.** With fake lookups: a missing position, nearest stop, opening hours
  and journey are each filled and marked; a value that is there is not changed; complete files come
  back unchanged; a lookup that fails leaves its value missing and is listed. The tram and the taxi
  formulas give the expected numbers for fixed inputs. No test touches the network.
- **`listStandIns.test.ts`.** The counts for a sample source text.
- **`getJumpIn.test.ts`.** A full address gives the three values; a time before noon counts as after
  midnight; an unknown place gives `null`; a time or money in another form is dropped.

`samplePlace.test.ts` goes: the checker holds its rule for the game's content.

Browser tests, in `tests/`:

- **`fixedWorld.ts`** holds the tests' places and travel data: the sample bar with its text
  unchanged, a second place with a way out, a third place that is a stop, and journeys between them
  with fixed numbers. Its ids are test ids cast to `PlaceId`. The helpers put it into `nightStart`
  before a test and put the game's own back after it.
- **`nightScreen.browser.test.ts` and `nightScreenNarrow.browser.test.ts`** run in the fixed world's
  first place, with their expectations unchanged.
- **`nightScreenPlaces.browser.test.ts`.** New.
  - A script that sets `night.place`: after the window has closed, the old scene buttons are
    destroyed, the new ones are in the UI and laid out, the place button shows the new label, the
    picture is a new one, and the description is open.
  - A way out's choice opens the travel window on that way, and `night.leaving` is `null` again.
  - A journey, from the door to the arrival: the pick changes the minutes, the money and the place;
    the journey's window is open and no scene button exists; after it the destination is shown with
    its description.
  - "Quit to menu" during a journey and with the travel window open leaves nothing behind.
  - A place with a `shortName` shows it on the place button.
- **`travelWindow.browser.test.ts`.** New.
  - The title, the row and the list for each way.
  - The first destination has the focus and the ring when the window opens.
  - A way's button switches the title and the list, keeps the focus, and does not change the
    window's size or the buttons' places.
  - "Back" and Escape close it with nothing picked.
  - A pick closes it and reports the destination.
  - A press while it fades does nothing.
  - On a screen of 146 × 262 the three ways fit the row, the numbers stand under the name, and the
    window fits the screen.
  - A resize from a wide screen to a narrow one lays the list out again and keeps the way and the
    focus.
  - It is driven by real taps and by keys.
- **`jumpIn.browser.test.ts`.** New. The game started with a jump-in shows the night screen in that
  place with that hour and money.
- **`placePicture.browser.test.ts`.** Gains the stand-in picture: it compiles, its lamp's pixel is
  lit and a corner pixel is black.
- **`mainMenu.browser.test.ts`.** Gains one test on the game's own content: New Game shows the night
  screen with the train as its place. It checks the place's id, not a sentence.

The lessons of the earlier phases' reviews hold for every new test and every new button: closing
guards, the focus kept when a list is rebuilt, sizes that do not jump, an exact screen size through
the viewport, and taps through `userEvent.click`.

Run from the repository root:

```sh
npx turbo run typecheck lint test --filter=tellurion --filter=somewhere --filter=foam --concurrency=1
```

## Done when

- The turbo command above passes.
- `node scripts/fill-travel-data.mjs` leaves the two data files unchanged.
- `node scripts/list-stand-ins.mjs` prints the list.
- In the running app, every step of "What the player sees" can be observed, in a wide browser window
  and in one narrower than 240 art pixels.
- No file under `apps/somewhere/` has changed, and `packages/tellurion/` has changed only as its own
  spec says.

## Non-goals

- The drawn map (the next spec), and a credit for OpenStreetMap on the screen, which that spec
  places.
- Closing times, drunkenness, dice, an action shown as unavailable, the end of the night and the log
  (phase 5).
- The real pictures of the places, and a fade between places.
- The real text.
- A list that scrolls.
- Remembering that the player has been in a place, and a description that differs on a return.
- Events on a journey, tram timetables, night buses, and a taxi that has to be called.
- Saving and Continue (phase 7).
- Changes to Somewhere.

## Rejected

- **A text format of the game's own for the content,** compiled into dialogue scripts. It needs a
  parser, error messages with file and line, a build step and editor support before the first scene
  exists, and syntax for prices, conditions and dice before those rules are designed.
- **An existing language for branching stories with its own runtime.** It replaces Tellurion's
  dialogue runner, which the story window is built on, and keeps a part of the night's state inside
  that runtime.
- **One bar with all the rules first.** The author could write for the other places one phase later,
  and a clock in a single bar can only run out: it cannot be traded against another place.
- **The real pictures now.** A scene button stands for a thing in the picture, so a place is drawn
  once its actions exist.
- **The main station as the first place,** and **a fixed first bar.** The train makes the arrival
  itself a place to play in, and where the player gets off is the night's first decision.
- **Leaving through the place button.** The way out is a thing in the place, written like any other
  scene, so a door can later be locked or behave differently.
- **A tram stop that stands for the place next to it,** and **a stop as a point on the map without a
  place.** A stop is a place where things can happen.
- **Travel times computed while the game runs.** The author keeps every number by hand.
- **A file the script owns and a second file of corrections.** A number would live in two files.
- **Travel data as a flat list of rows.** A row with two long ids is longer than the formatter's
  line, so the file would be laid out unevenly. Grouped by start and way, every journey is one short
  line.
- **A node of text between a way's choice and the travel window.** Every move would cost one more
  line and one more press.
- **The whole phase as one spec,** and **places first with fixed door choices.** The first needs the
  map's look decided before anything is built; the second builds door choices that the travel data
  then replaces.
