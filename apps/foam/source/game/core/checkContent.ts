import {type DialogueNode, type RunnableDialogueScript} from 'tellurion';

import {getExpectedJourneys} from './getExpectedJourneys.js';
import {getLabelRoom, WORD_ROOM} from './getLabelRoom.js';
import {getMapPoint} from './getMapPoint.js';
import {MARK, stripMarks} from './markedText.js';
import {createNight, type Night, type PlaceId, type Way} from './night.js';
import {type Place} from './place.js';
import {type MapData, type PlaceData, type Travel} from './travel.js';

export type Content = {
  places: Readonly<Record<string, Place>>;
  journeys: Record<Way, RunnableDialogueScript<Night>>;
  placeData: PlaceData;
  travel: Travel;
  map: MapData;
};

// A place's button and its neighbourhood must lie inside the map, with this much to spare.
const MAP_MARGIN = 2000;
// The train moves, so it has no position and no entry in places.json.
const OFF_THE_MAP = new Set(['train']);
// A night's start for a text that is a function: any time and sum will do.
const CHECK_MINUTES = 1020;
const CHECK_MONEY = 350;
const SEPARATOR = ' › ';

type Node = DialogueNode<Night, string>;

function isWholeNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value);
}

/**
 * Checks the content of the game and returns one line for each problem, or an empty list. A text
 * or a start that is a function is called once for every place.
 */
export function checkContent(content: Content): string[] {
  let lines = new Set<string>();
  let room = getLabelRoom();
  let placeIds = Object.keys(content.places);

  function checkNode(path: string, node: Node, night: Night): void {
    let {text, speaker, choices, next} = node;
    let result = typeof text === 'function' ? text(night) : text;
    let pages = typeof result === 'string' ? [result] : result;
    let words = new Set<string>();

    if (speaker === undefined || speaker === '') {
      lines.add(`${path}: no speaker`);
    } else if (speaker.length > room.title) {
      lines.add(
        `${path}: the title "${speaker}" has ${speaker.length} characters, and ${room.title} fit`,
      );
    }

    for (let [index, page] of pages.entries()) {
      let marks = page.split(MARK).length - 1;

      if (marks % 2 !== 0) {
        lines.add(`${path}: page ${index + 1} has ${marks} italic marks`);
      }

      for (let word of stripMarks(page).split(/\s+/)) {
        words.add(word);
      }
    }

    for (let choice of choices ?? []) {
      for (let word of stripMarks(choice.text).split(/\s+/)) {
        words.add(word);
      }

      if (typeof choice.next === 'object') {
        checkNode(`${path}${SEPARATOR}"${choice.text}"`, choice.next, night);
      }
    }

    for (let word of words) {
      if (word.length > WORD_ROOM) {
        lines.add(`${path}: "${word}" has ${word.length} characters, and ${WORD_ROOM} fit`);
      }
    }

    if (typeof next === 'object') {
      checkNode(`${path}${SEPARATOR}next`, next, night);
    }
  }

  function checkScript(name: string, script: RunnableDialogueScript<Night>): void {
    for (let id of placeIds) {
      let night = createNight({
        // The keys of content.places are the ids of the places.
        place: id as PlaceId,
        minutes: CHECK_MINUTES,
        money: CHECK_MONEY,
      });

      for (let [key, node] of Object.entries(script.nodes ?? {})) {
        if (node !== undefined) {
          checkNode(`${name}${SEPARATOR}${key}`, node, night);
        }
      }

      let start = typeof script.start === 'function' ? script.start(night) : script.start;

      if (typeof start === 'object') {
        checkNode(`${name}${SEPARATOR}start`, start, night);
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

    checkScript(`${id}${SEPARATOR}description`, place.description);

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

      checkScript(`${id}${SEPARATOR}${spot.label}`, spot.script);
    }
  }

  for (let [way, script] of Object.entries(content.journeys)) {
    checkScript(`journeys${SEPARATOR}${way}`, script);
  }

  for (let id of placeIds) {
    if (!OFF_THE_MAP.has(id) && content.placeData[id] === undefined) {
      lines.add(`places.json: no entry for "${id}"`);
    }
  }

  for (let [id, entry] of Object.entries(content.placeData)) {
    let where = `places.json${SEPARATOR}${id}`;

    if (content.places[id] === undefined) {
      lines.add(`places.json: "${id}" is not a place`);
    }

    if ((entry.kind as string | undefined) === undefined) {
      lines.add(`${where}: no kind`);
    } else if (entry.kind !== 'place' && entry.kind !== 'stop') {
      lines.add(`${where}: kind is "${entry.kind}", not "place" or "stop"`);
    }

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

  let expected = getExpectedJourneys(content.placeData);
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
