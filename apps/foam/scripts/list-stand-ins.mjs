// Lists what is left to write: the stand-in texts and the written ones of every place file and of
// the journeys, and the places and journeys of the data that a script computed and nobody has
// checked. Run it with `node scripts/list-stand-ins.mjs`.
import {readdir, readFile} from 'node:fs/promises';

const contentDir = new URL('../source/game/content/', import.meta.url);
const NAME_WIDTH = 25;
const STAND_IN_WIDTH = 8;
const WRITTEN_WIDTH = 9;

/** Counts the tags of a source text: `standIn` and `prose` followed by a backtick. */
export function countTags(source) {
  return {
    standIn: [...source.matchAll(/\bstandIn`/g)].length,
    written: [...source.matchAll(/\bprose`/g)].length,
  };
}

function countComputed(entries) {
  let all = Object.values(entries);

  return {computed: all.filter((entry) => entry.computed === true).length, all: all.length};
}

async function readJson(name) {
  return JSON.parse(await readFile(new URL(`data/${name}`, contentDir), 'utf8'));
}

export async function listStandIns() {
  let placeFiles = (await readdir(new URL('places/', contentDir)))
    .filter((name) => name.endsWith('.ts'))
    .sort();
  let files = [
    ...(await Promise.all(
      placeFiles.map(async (name) => ({
        name,
        source: await readFile(new URL(`places/${name}`, contentDir), 'utf8'),
      })),
    )),
    {name: 'journeys.ts', source: await readFile(new URL('journeys.ts', contentDir), 'utf8')},
  ];
  let lines = [
    `${'Texts'.padEnd(NAME_WIDTH)}${'stand-in'.padStart(STAND_IN_WIDTH)}${'written'.padStart(WRITTEN_WIDTH)}`,
  ];

  for (let {name, source} of files) {
    let counts = countTags(source);

    lines.push(
      `${name.padEnd(NAME_WIDTH)}${String(counts.standIn).padStart(STAND_IN_WIDTH)}${String(counts.written).padStart(WRITTEN_WIDTH)}`,
    );
  }

  let places = countComputed(await readJson('places.json'));
  // A journey sits two levels down: from, way, to.
  let journeys = {computed: 0, all: 0};

  for (let ways of Object.values(await readJson('travel.json'))) {
    for (let destinations of Object.values(ways)) {
      let counted = countComputed(destinations);

      journeys.computed += counted.computed;
      journeys.all += counted.all;
    }
  }

  lines.push(
    '',
    `Places not checked:   ${places.computed} of ${places.all}`,
    `Journeys not checked: ${journeys.computed} of ${journeys.all}`,
  );

  return lines.join('\n');
}

if (process.argv[1] === import.meta.filename) {
  // eslint-disable-next-line no-console -- the list is the script's output
  console.log(await listStandIns());
}
