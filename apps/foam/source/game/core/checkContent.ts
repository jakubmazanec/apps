import {type DialogueNode, type RunnableDialogueScript} from 'tellurion';

import {getExpectedJourneys} from './getExpectedJourneys.js';
import {getLabelRoom, WORD_ROOM} from './getLabelRoom.js';
import {getMapPoint} from './getMapPoint.js';
import {NIGHT_END, NIGHT_START} from './hours.js';
import {type Location} from './location.js';
import {MARK, stripMarks} from './markedText.js';
import {createNight, type Night, type PlaceId, roll, type Way} from './night.js';
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
const SEPARATOR = ' › ';

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
 * time and level, and a choice's next with odds once for each roll as well.
 */
export function checkContent(content: Content): string[] {
  let lines = new Set<string>();
  let room = getLabelRoom();
  let placeIds = Object.keys(content.places);
  let times = getCheckTimes(content.locationData);
  // The nodes of the script being checked, where follow looks up an id that a next returns.
  let nodes: NonNullable<RunnableDialogueScript<Night>['nodes']> = {};

  function checkNode(path: string, node: Node, nights: Night[], home: Place | null): void {
    let {text, speaker, next} = node;
    let choices = (node.choices ?? []).map(asChoice);
    let words = new Set<string>();

    if (speaker === undefined || speaker === '') {
      lines.add(`${path}: no speaker`);
    } else if (speaker.length > room.title) {
      lines.add(
        `${path}: the title "${speaker}" has ${speaker.length} characters, and ${room.title} fit`,
      );
    }

    for (let night of nights) {
      let result = typeof text === 'function' ? text(night) : text;
      let pages = typeof result === 'string' ? [result] : result;

      for (let [index, page] of pages.entries()) {
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

      if (home !== null && onChoose !== undefined) {
        checkWayOut(where, onChoose, home);
      }

      if (typeof choice.next === 'object') {
        checkNode(where, choice.next, nights, home);
      }

      for (let night of nights) {
        let chance = typeof odds === 'function' ? odds(night) : odds;

        if (chance !== undefined && !(chance > 0 && chance < 1)) {
          lines.add(`${where}: odds is ${chance}`);
        }

        if (typeof choice.next === 'function') {
          if (chance === undefined) {
            night.roll = null;
            follow(`${where}${SEPARATOR}next`, choice.next, night, home);
          } else {
            for (let value of CHECK_ROLLS) {
              night.random = () => value;
              roll(night, chance);
              follow(`${where}${SEPARATOR}next`, choice.next, night, home);
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
          nights.every((night) => choice.isVisible?.(night) ?? true),
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
    let target: Node | string;

    try {
      target = reference(night);
    } catch (error) {
      lines.add(`${where}: throws "${error instanceof Error ? error.message : String(error)}"`);

      return;
    }

    // An id the script has is not checked again: the node is checked under its own key.
    if (typeof target === 'object') {
      checkNode(where, target, [night], home);
    } else if (nodes[target] === undefined) {
      lines.add(`${where}: returns "${target}", which is not a node`);
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

  // A way out sets night.leaving: walk and taxi need the street, the tram a stop on it.
  function checkWayOut(where: string, onChoose: (night: Night) => void, home: Place): void {
    let night = createNight({place: home.id, minutes: NIGHT_START, money: CHECK_MONEY});

    onChoose(night);

    if (night.leaving === null) {
      return;
    }

    let {way} = night.leaving;
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
  }

  function checkScript(
    name: string,
    script: RunnableDialogueScript<Night>,
    home: Place | null,
  ): void {
    let {start} = script;

    nodes = script.nodes ?? {};

    for (let id of placeIds) {
      let nights = times.flatMap((minutes) =>
        CHECK_LEVELS.map((drunkenness) =>
          createNight({
            // The keys of content.places are the ids of the places.
            place: id as PlaceId,
            minutes,
            money: CHECK_MONEY,
            drunkenness,
          }),
        ),
      );

      for (let [key, node] of Object.entries(nodes)) {
        if (node !== undefined) {
          checkNode(`${name}${SEPARATOR}${key}`, node, nights, home);
        }
      }

      if (typeof start === 'object') {
        checkNode(`${name}${SEPARATOR}start`, start, nights, home);
      } else if (typeof start === 'function') {
        for (let night of nights) {
          let node = start(night);

          if (typeof node === 'object') {
            checkNode(`${name}${SEPARATOR}start`, node, [night], home);
          }
        }
      }
    }
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

    checkScript(`${id}${SEPARATOR}description`, place.description, place);

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

      checkScript(`${id}${SEPARATOR}${spot.label}`, spot.script, place);
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

    if (location.closing !== undefined) {
      checkScript(`${id}${SEPARATOR}closing`, location.closing, null);
    }
  }

  for (let [way, script] of Object.entries(content.journeys)) {
    checkScript(`journeys${SEPARATOR}${way}`, script, null);
  }

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
