import {type DialogueNode, type RunnableDialogueScript} from 'tellurion';

import {SEPARATOR} from './contentPath.js';
import {getExpectedJourneys} from './getExpectedJourneys.js';
import {getLabelRoom, WORD_ROOM} from './getLabelRoom.js';
import {getMapPoint} from './getMapPoint.js';
import {NIGHT_END, NIGHT_START} from './hours.js';
import {type Location} from './location.js';
import {MARK, stripMarks} from './markedText.js';
import {createNight, type Night, type PlaceId, type Quest, roll, type Way} from './night.js';
import {type Place} from './place.js';
import {asChoice} from './script.js';
import {type LocationData, type MapData, type Travel} from './travel.js';

export type Content = {
  locations: Readonly<Record<string, Location>>;
  places: Readonly<Record<string, Place>>;
  journeys: Record<Way, RunnableDialogueScript<Night>>;
  locationData: LocationData;
  travel: Travel;
  map: MapData;
  end: RunnableDialogueScript<Night>;
};

// A location's button and its neighbourhood must lie inside the map, with this much to spare.
const MAP_MARGIN = 2000;
// The train's location moves, so it has no position and no entry in locations.json.
const OFF_THE_MAP = new Set(['train']);
const HALF_HOUR = 30;
const CHECK_MONEY = 350;
// Sober, tipsy and drunk: a condition, a text or odds that read the level meet all three.
const CHECK_LEVELS = [0, 2, 5];
// 0.00 to 0.99: every outcome an author can write by a threshold in hundredths comes up.
const CHECK_ROLLS = Array.from({length: 100}, (_, index) => index / 100);
// For the numbers content draws directly, `night.random('walletMoney')`: every side of an equal
// split into two to six is met, so a `start` that splits the number into three is followed into all
// three. An unequal split is the author's to meet, as the levels. Versions are met by name through
// `pick`, which runs a function once under each name of its table.
const CHECK_RANDOM = [0, 0.2, 0.4, 0.6, 0.8, 0.99];
const QUEST_FLAGS = ['hasBottle', 'bottleGiven', 'hasKeys', 'hasTicket'] as const;
// Every combination of the quest's flags, the one with none first: a text, a start or a next that
// reads the quest, or an effect that writes it, meets each state it can be in.
const QUEST_STATES: readonly Quest[] = Array.from({length: 2 ** QUEST_FLAGS.length}, (_, bits) => {
  let quest: Quest = {hasBottle: false, bottleGiven: false, hasKeys: false, hasTicket: false};

  for (let [index, flag] of QUEST_FLAGS.entries()) {
    quest[flag] = Math.floor(bits / 2 ** index) % 2 === 1;
  }

  return quest;
});

type Node = DialogueNode<Night, string>;

function isWholeNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value);
}

// The content types a span as `number[]`, so the JSON import fits; here it is held to a pair.
function isSpanOfTheNight(span: readonly number[]): boolean {
  let [from, to] = span;

  return (
    span.length === 2 &&
    isWholeNumber(from) &&
    isWholeNumber(to) &&
    from >= NIGHT_START &&
    from < to &&
    to <= NIGHT_END
  );
}

function formatSpan(span: readonly number[]): string {
  return `[${span.join(', ')}]`;
}

// The times a function is called with: each half hour of the night, and both sides of every
// opening and closing, so that a door that branches on the hours is met on each side.
function getCheckTimes(locationData: LocationData): number[] {
  let times = new Set<number>();

  for (let minutes = NIGHT_START; minutes < NIGHT_END; minutes += HALF_HOUR) {
    times.add(minutes);
  }

  for (let entry of Object.values(locationData)) {
    for (let [from = 0, to = 0] of entry.hours ?? []) {
      for (let minutes of [from - 1, from, to - 1, to]) {
        if (minutes >= NIGHT_START && minutes <= NIGHT_END) {
          times.add(minutes);
        }
      }
    }
  }

  return [...times].sort((a, b) => a - b);
}

/**
 * Checks the content of the game and returns one line for each problem, or an empty list. A text,
 * a start, an odds or a next that is a function is called with each check night: once per place,
 * time, level and quest state, and a choice's next with odds once for each roll as well. A
 * choice's effect and a node's entry effect run on a copy of each check night. Every check night
 * is made twice: with no story achieved and no event met, and with every title the effects gave
 * and every key they met. A function of the content that reads random runs again under each of the
 * other values of CHECK_RANDOM, except under a roll, where it reads the roll's value. A function
 * that picked a version runs again under each other name of the longest table it picked from, a
 * shorter table wrapping; a table whose odds do not sum to 1, or give a name 0 or less, is reported
 * under the function's path. A pick reached only in a branch, under another table's name or a value
 * of random, is not run under each of its names, and is reported: a pick belongs at the top of its
 * function.
 */
export function checkContent(content: Content): string[] {
  let lines = new Set<string>();
  let room = getLabelRoom();
  let placeIds = Object.keys(content.places);
  let times = getCheckTimes(content.locationData);
  // The nodes of the script being checked, where follow looks up an id that a next returns.
  let nodes: NonNullable<RunnableDialogueScript<Night>['nodes']> = {};
  // Every title the effects gave: the second pass's collection holds them all.
  let titles = new Set<string>();
  // Every key the effects met: the second pass's nights have met them all.
  let events = new Set<string>();
  // Set by a check night's random when it is read, for withRandom to see.
  let randomRead = false;
  // The tables a check night's pick was called with during one call of a function, for withRandom
  // to run it once per name and to report a bad one.
  let tables: Array<{key: string; odds: Readonly<Record<string, number>>}> = [];
  // The run's index: pick returns each table's name at it, wrapping a table shorter than the
  // longest.
  let pickIndex = 0;

  function createRandom(value: number): Night['random'] {
    return () => {
      randomRead = true;

      return value;
    };
  }

  function checkPick<TName extends string>(
    key: string,
    odds: Readonly<Record<TName, number>>,
  ): TName {
    tables.push({key, odds});

    let names = Object.keys(odds) as TName[];

    // An empty table has no name; checkTable reports it.
    return names[pickIndex % names.length] ?? ('' as TName);
  }

  function checkTable(where: string, key: string, odds: Readonly<Record<string, number>>): void {
    let sum = 0;

    for (let [name, odd] of Object.entries(odds)) {
      sum += odd;

      if (!(odd > 0)) {
        lines.add(`${where}: the odds of "${key}" give "${name}" ${odd}`);
      }
    }

    // A sum of 0.9999999999999999 from floating-point arithmetic is no fault of the author's.
    if (Math.abs(sum - 1) > 1e-9) {
      lines.add(`${where}: the odds of "${key}" sum to ${sum}`);
    }
  }

  // Calls the function with the night and, when it read random, with a copy of the night for each
  // other check value, so every side of a split on random is met. A function that picked a version
  // then runs again under each other name of the longest table it picked from, a shorter table
  // wrapping, with the night's own value of random; the tables are reported under the path, and so
  // is a key picked only in a branch, whose other names never run. Each result comes with the night
  // that gave it, for the check to go on with that night.
  function withRandom<T>(
    where: string,
    night: Night,
    call: (night: Night) => T,
  ): Array<{night: Night; result: T}> {
    randomRead = false;
    tables = [];
    // The call before, which a throw can cut short, left the index at its last run.
    pickIndex = 0;

    let results = [{night, result: call(night)}];
    // The keys the function picks on every run: a key first picked in a copy or a re-run lies in a
    // branch, so its other names never run.
    let topKeys = new Set(tables.map(({key}) => key));

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- createRandom sets it
    if (randomRead) {
      let own = night.random();

      for (let value of CHECK_RANDOM) {
        if (value !== own) {
          let copy = {...night, random: createRandom(value)};

          results.push({night: copy, result: call(copy)});
        }
      }
    }

    // The tables of the runs at index 0 set the longest. The runs below push tables again, and the
    // walk after them reports a bad table, and a key, that only a copy or a re-run picked.
    let longest = 0;

    for (let {key, odds} of tables) {
      checkTable(where, key, odds);
      longest = Math.max(longest, Object.keys(odds).length);
    }

    for (pickIndex = 1; pickIndex < longest; pickIndex += 1) {
      results.push({night, result: call(night)});
    }

    for (let {key, odds} of tables) {
      checkTable(where, key, odds);

      if (!topKeys.has(key)) {
        lines.add(
          `${where}: "${key}" is picked only in a branch; pick it at the top of the function`,
        );
      }
    }

    return results;
  }

  // A throw is reported under the path and gives no result to go on with.
  function tryWithRandom<T>(
    where: string,
    night: Night,
    call: (night: Night) => T,
  ): Array<{night: Night; result: T}> {
    try {
      return withRandom(where, night, call);
    } catch (error) {
      lines.add(`${where}: throws "${error instanceof Error ? error.message : String(error)}"`);

      return [];
    }
  }

  function checkNode(path: string, node: Node, nights: Night[], home: Place | null): void {
    let {text, speaker, next, onEnter} = node;
    let choices = (node.choices ?? []).map(asChoice);
    let words = new Set<string>();

    if (speaker === undefined || speaker === '') {
      lines.add(`${path}: no speaker`);
    } else if (speaker.length > room.title) {
      lines.add(
        `${path}: the title "${speaker}" has ${speaker.length} characters, and ${room.title} fit`,
      );
    }

    if (onEnter !== undefined) {
      checkEffect(path, onEnter, nights, home);
    }

    // The loop over the nights exists for a text that is a function; the marks and the words of a
    // page are the same on every night, so a page already seen is not split again.
    let seen = new Set<string>();

    for (let {result} of nights.flatMap((night) =>
      typeof text === 'function' ? tryWithRandom(path, night, text) : [{night, result: text}],
    )) {
      let pages = typeof result === 'string' ? [result] : result;

      for (let [index, page] of pages.entries()) {
        let key = `${index}:${page}`;

        if (seen.has(key)) {
          continue;
        }

        seen.add(key);

        let marks = page.split(MARK).length - 1;

        if (marks % 2 !== 0) {
          lines.add(`${path}: page ${index + 1} has ${marks} italic marks`);
        }

        for (let word of stripMarks(page).split(/\s+/)) {
          words.add(word);
        }
      }
    }

    for (let choice of choices) {
      let {drunkenness, odds, onChoose} = choice;
      let where = `${path}${SEPARATOR}"${choice.text}"`;

      for (let word of stripMarks(choice.text).split(/\s+/)) {
        words.add(word);
      }

      for (let field of ['price', 'minutes', 'drinks'] as const) {
        let value = choice[field];

        if (value !== undefined && !(Number.isInteger(value) && value > 0)) {
          lines.add(`${where}: ${field} is ${value}${value === 0 ? '; leave it out' : ''}`);
        }
      }

      if (drunkenness !== undefined) {
        let {min, max} = drunkenness;

        if (min === undefined && max === undefined) {
          lines.add(`${where}: drunkenness names neither min nor max`);
        }

        for (let bound of ['min', 'max'] as const) {
          let value = drunkenness[bound];

          if (value !== undefined && value < 0) {
            lines.add(`${where}: drunkenness has ${bound} ${value}`);
          }
        }

        if (min !== undefined && max !== undefined && min > max) {
          lines.add(`${where}: drunkenness has min ${min} above max ${max}`);
        }
      }

      if (onChoose !== undefined) {
        checkEffect(where, onChoose, nights, home);
      }

      if (typeof choice.next === 'object') {
        checkNode(where, choice.next, nights, home);
      }

      for (let night of nights) {
        for (let {night: source, result: chance} of typeof odds === 'function' ?
          withRandom(where, night, odds)
        : [{night, result: odds}]) {
          if (chance !== undefined && !(chance > 0 && chance < 1)) {
            lines.add(`${where}: odds is ${chance}`);
          }

          if (typeof choice.next === 'function') {
            if (chance === undefined) {
              source.roll = null;
              follow(`${where}${SEPARATOR}next`, choice.next, source, home);
            } else {
              // A constant notes no read, so the next meets the hundred rolls and not six times as
              // many; the night's own random is put back for a function checked after the roll.
              let {random} = source;

              for (let value of CHECK_ROLLS) {
                source.random = () => value;
                roll(source, chance);
                follow(`${where}${SEPARATOR}next`, choice.next, source, home);
              }

              source.random = random;
            }
          }
        }
      }
    }

    for (let word of words) {
      if (word.length > WORD_ROOM) {
        lines.add(`${path}: "${word}" has ${word.length} characters, and ${WORD_ROOM} fit`);
      }
    }

    if (typeof next === 'object') {
      checkNode(`${path}${SEPARATOR}next`, next, nights, home);
    } else if (typeof next === 'function') {
      for (let night of nights) {
        night.roll = null;
        follow(`${path}${SEPARATOR}next`, next, night, home);
      }
    }

    if (
      choices.length > 0 &&
      !choices.some(
        (choice) =>
          choice.price === undefined &&
          choice.minutes === undefined &&
          choice.drinks === undefined &&
          (choice.isVisible === undefined ||
            nights.every((night) =>
              withRandom(path, night, (source) => choice.isVisible?.(source) ?? true).every(
                ({result}) => result,
              ),
            )),
      )
    ) {
      lines.add(`${path}: no way out that costs nothing`);
    }
  }

  function follow(
    where: string,
    reference: (night: Night) => Node | string,
    night: Night,
    home: Place | null,
  ): void {
    for (let {night: source, result: target} of tryWithRandom(where, night, reference)) {
      // An id the script has is not checked again: the node is checked under its own key.
      if (typeof target === 'object') {
        checkNode(where, target, [source], home);
      } else if (nodes[target] === undefined) {
        lines.add(`${where}: returns "${target}", which is not a node`);
      }
    }
  }

  // The spans of an entry's hours: each of the night, and each after the one before it.
  function checkHours(where: string, hours: ReadonlyArray<readonly number[]>): void {
    let previous: readonly number[] | undefined;

    for (let span of hours) {
      let [from = 0] = span;

      if (!isSpanOfTheNight(span)) {
        lines.add(`${where}: ${formatSpan(span)} is not a span of the night`);
      } else if (previous !== undefined && from <= (previous[1] ?? 0)) {
        lines.add(`${where}: ${formatSpan(span)} is not after ${formatSpan(previous)}`);
      }

      previous = span;
    }
  }

  // The log wraps a title and sets it in italic marks of its own, so the title can hold no mark
  // and no word too long to wrap. Each title is checked once, under the first effect that gave it.
  function checkTitle(where: string, title: string): void {
    if (titles.has(title)) {
      return;
    }

    titles.add(title);

    if (title === '') {
      lines.add(`${where}: a story with an empty title`);
    }

    if (title.includes(MARK)) {
      lines.add(`${where}: the story "${title}" has an italic mark`);
    }

    for (let word of stripMarks(title).split(/\s+/)) {
      if (word.length > WORD_ROOM) {
        lines.add(`${where}: "${word}" has ${word.length} characters, and ${WORD_ROOM} fit`);
      }
    }
  }

  // Each run has a night and a collection of its own, so what an effect does to them never
  // reaches the check nights, which the texts, the conditions and the nexts read.
  function checkEffect(
    where: string,
    effect: (night: Night) => void,
    nights: Night[],
    home: Place | null,
  ): void {
    for (let night of nights) {
      withRandom(where, night, (source) => {
        let fresh = createNight(
          {
            seed: 0,
            place: source.place,
            minutes: source.minutes,
            money: source.money,
            drunkenness: source.drunkenness.level,
            // A copy, so that an effect that writes the quest never reaches its check night.
            quest: {...source.quest},
            // A copy, as the quest is, so that meeting an event never reaches its check night.
            events: [...source.events],
          },
          {titles: [...source.collection.titles]},
        );

        // An entry effect reached after a rolled next reads the roll its check night made, and the
        // fresh night rolls and picks as its check night does.
        fresh.roll = source.roll;
        fresh.random = source.random;
        fresh.pick = source.pick;

        try {
          effect(fresh);
        } catch (error) {
          lines.add(`${where}: throws "${error instanceof Error ? error.message : String(error)}"`);

          return;
        }

        for (let {title} of fresh.stories) {
          checkTitle(where, title);
        }

        for (let key of fresh.events) {
          events.add(key);
        }

        if (home === null || fresh.leaving === null) {
          return;
        }

        // A way out sets night.leaving: walk and taxi need the street, the tram a stop on it.
        let {way} = fresh.leaving;
        let location = Object.values(content.locations).find((candidate) =>
          candidate.places.some((place) => place.id === home.id),
        );

        if (way !== 'tram' && !home.outdoors) {
          lines.add(`${where}: ${way} is offered indoors`);
        } else if (
          way === 'tram' &&
          (!home.outdoors ||
            location === undefined ||
            content.locationData[location.id]?.tramStop === undefined)
        ) {
          lines.add(`${where}: the tram does not stop here`);
        }
      });
    }
  }

  function checkScript(
    name: string,
    script: RunnableDialogueScript<Night>,
    home: Place | null,
    collection: Night['collection'],
    met: string[],
  ): void {
    let {start} = script;

    nodes = script.nodes ?? {};

    for (let id of placeIds) {
      // A night for each place, time, level and quest state, the four axes a condition reads.
      let nights = times.flatMap((minutes) =>
        CHECK_LEVELS.flatMap((drunkenness) =>
          QUEST_STATES.map((quest) =>
            createNight(
              {
                // Nothing reads the seed: the checker puts values of its own in random.
                seed: 0,
                // The keys of content.places are the ids of the places.
                place: id as PlaceId,
                minutes,
                money: CHECK_MONEY,
                drunkenness,
                quest,
                events: met,
              },
              collection,
            ),
          ),
        ),
      );

      for (let night of nights) {
        night.random = createRandom(0);
        night.pick = checkPick;
      }

      for (let [key, node] of Object.entries(nodes)) {
        if (node !== undefined) {
          checkNode(`${name}${SEPARATOR}${key}`, node, nights, home);
        }
      }

      if (typeof start === 'object') {
        checkNode(`${name}${SEPARATOR}start`, start, nights, home);
      } else if (typeof start === 'function') {
        let where = `${name}${SEPARATOR}start`;

        for (let night of nights) {
          for (let {night: source, result: node} of tryWithRandom(where, night, start)) {
            if (typeof node === 'object') {
              checkNode(where, node, [source], home);
            }
          }
        }
      }
    }
  }

  // The pass's collection is one object for all its nights: they only read it. The events are
  // copied into each night.
  function checkScripts(collectionTitles: string[], met: string[]): void {
    let collection = {titles: collectionTitles};

    for (let [id, place] of Object.entries(content.places)) {
      checkScript(`${id}${SEPARATOR}description`, place.description, place, collection, met);

      for (let spot of place.spots) {
        checkScript(`${id}${SEPARATOR}${spot.label}`, spot.script, place, collection, met);
      }
    }

    for (let [id, location] of Object.entries(content.locations)) {
      if (location.closing !== undefined) {
        checkScript(`${id}${SEPARATOR}closing`, location.closing, null, collection, met);
      }
    }

    for (let [way, script] of Object.entries(content.journeys)) {
      checkScript(`journeys${SEPARATOR}${way}`, script, null, collection, met);
    }

    checkScript('end', content.end, null, collection, met);
  }

  for (let [id, place] of Object.entries(content.places)) {
    let name = place.shortName ?? place.name;

    if (name.length > room.placeButton) {
      let which = place.shortName === undefined ? 'name' : 'shortName';
      let advice = place.shortName === undefined ? '; give a shortName' : '';

      lines.add(
        `${id}: the ${which} has ${name.length} characters and the place button holds ` +
          `${room.placeButton}${advice}`,
      );
    }

    for (let spot of place.spots) {
      if (spot.label.length > room.sceneButton) {
        lines.add(
          `${id}${SEPARATOR}"${spot.label}": the label has ${spot.label.length} characters, ` +
            `and ${room.sceneButton} fit`,
        );
      }

      for (let axis of ['x', 'y'] as const) {
        if (!(spot[axis] >= 0 && spot[axis] <= 1)) {
          lines.add(`${id}${SEPARATOR}${spot.label}: ${axis} is ${spot[axis]}`);
        }
      }
    }
  }

  for (let [id, place] of Object.entries(content.places)) {
    let owners = Object.values(content.locations)
      .filter((location) => location.places.some((candidate) => candidate.id === place.id))
      .map((location) => location.id);

    if (owners.length === 0) {
      lines.add(`${id}: in no location`);
    } else if (owners.length > 1) {
      lines.add(`${id}: in ${owners.join(' and ')}`);
    }
  }

  for (let [id, location] of Object.entries(content.locations)) {
    let hours = content.locationData[id]?.hours;
    let ids = new Set(location.places.map((place) => place.id));

    if (!ids.has(location.arrival)) {
      lines.add(`${id}: arrival "${location.arrival}" is not one of its places`);
    }

    if (hours === undefined) {
      if (location.closing !== undefined) {
        lines.add(`${id}: a closing but no hours`);
      }

      if (location.outside !== undefined) {
        lines.add(`${id}: an outside but no hours`);
      }
    } else {
      if (location.closing === undefined) {
        lines.add(`${id}: hours but no closing`);
      }

      if (location.outside === undefined) {
        lines.add(`${id}: hours but no outside`);
      }
    }

    if (location.outside !== undefined) {
      if (!ids.has(location.outside)) {
        lines.add(`${id}: outside "${location.outside}" is not one of its places`);
      } else if (content.places[location.outside]?.outdoors === false) {
        lines.add(`${id}: outside "${location.outside}" is not outdoors`);
      }
    }
  }

  // With no story achieved and no event met, then with every title and every key the first pass
  // gathered, so a text, a condition or a way out that reads the collection is met both ways, and a
  // start that reads hasMet is met with none met and with all met.
  checkScripts([], []);
  checkScripts([...titles], [...events]);

  for (let id of Object.keys(content.locations)) {
    if (!OFF_THE_MAP.has(id) && content.locationData[id] === undefined) {
      lines.add(`locations.json: no entry for "${id}"`);
    }
  }

  for (let [id, entry] of Object.entries(content.locationData)) {
    let where = `locations.json${SEPARATOR}${id}`;

    if (content.locations[id] === undefined) {
      lines.add(`locations.json: "${id}" is not a location`);
    }

    checkHours(`${where}${SEPARATOR}hours`, entry.hours ?? []);

    if (entry.position === undefined) {
      lines.add(`${where}: no position; run the fill script`);
    } else {
      let {x, y} = getMapPoint(entry.position, content.map.origin);
      let {left, top, right, bottom} = content.map.box;
      let px = Math.round(x);
      let py = Math.round(y);

      if (
        px - MAP_MARGIN < left ||
        px + MAP_MARGIN > right ||
        py - MAP_MARGIN < top ||
        py + MAP_MARGIN > bottom
      ) {
        lines.add(`map.json: does not cover "${id}"; run node scripts/fetch-map-data.mjs`);
      }
    }
  }

  let expected = getExpectedJourneys(content.locationData);
  let expectedKeys = new Set<string>();

  for (let {from, way, to} of expected) {
    let key = [from, way, to].join(SEPARATOR);

    expectedKeys.add(key);

    if (content.travel[from]?.[way]?.[to] === undefined) {
      lines.add(`travel.json: no journey ${key}`);
    }
  }

  for (let [from, ways] of Object.entries(content.travel)) {
    for (let [way, journeys] of Object.entries(ways)) {
      for (let [to, journey] of Object.entries(journeys)) {
        let key = [from, way, to].join(SEPARATOR);
        let where = `travel.json${SEPARATOR}${key}`;

        if (!expectedKeys.has(key)) {
          lines.add(`travel.json: ${key} is not a journey the game offers`);
        }

        if (!isWholeNumber(journey.minutes) || journey.minutes <= 0) {
          lines.add(`${where}: minutes is ${journey.minutes}`);
        }

        if (journey.price === undefined) {
          if (way !== 'walk') {
            lines.add(`${where}: no price`);
          }
        } else if (!isWholeNumber(journey.price) || journey.price < 0) {
          lines.add(`${where}: price is ${journey.price}`);
        }
      }
    }
  }

  return [...lines];
}
