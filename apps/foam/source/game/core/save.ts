import {PersistedStore} from 'tellurion';
import {z} from 'zod';

import {type Night, type PlaceId} from './night.js';
import {type Place} from './place.js';

export type SavedNight = Omit<Night, 'collection' | 'leaving' | 'pick' | 'random'>;

export const endingSchema = z.enum(['leave', 'stay', 'stranded']);

// Annotated, so that a field added to `Night` fails to compile until the schema handles it.
const savedNightSchema: z.ZodType<SavedNight> = z.object({
  seed: z.number(),
  rolls: z.number(),
  minutes: z.number(),
  money: z.number(),
  // The content's ids are not the core's to list; the loader holds the place to the content.
  place: z.custom<PlaceId>((value) => typeof value === 'string'),
  drunkenness: z.object({level: z.number(), at: z.number()}),
  roll: z.object({value: z.number(), odds: z.number(), won: z.boolean()}).nullable(),
  log: z.array(
    z.discriminatedUnion('kind', [
      z.object({kind: z.literal('choice'), minutes: z.number(), text: z.string()}),
      z.object({kind: z.literal('story'), minutes: z.number(), text: z.string()}),
      z
        .object({
          kind: z.literal('text'),
          minutes: z.number(),
          speaker: z.string().optional(),
          text: z.string(),
        })
        // JSON drops an undefined speaker, and zod 4 refuses the dropped key when the schema
        // declares it required (a union with `z.undefined()` fails with "expected nonoptional"),
        // so the transform gives the key back as `LogEntry` has it.
        .transform(({speaker, ...entry}) => ({...entry, speaker})),
    ]),
  ),
  stories: z.array(z.object({title: z.string(), minutes: z.number()})),
  quest: z.object({
    hasBottle: z.boolean(),
    bottleGiven: z.boolean(),
    hasKeys: z.boolean(),
    hasTicket: z.boolean(),
  }),
  events: z.array(z.string()),
  ending: endingSchema.nullable(),
  phone: z.object({unread: z.array(z.string()), read: z.array(z.string())}),
});
// Null is "no night", and anything unusable lands there too: a half-defaulted night would drop
// the player somewhere they never stood. There is no version field: the schema is the version,
// and a failing save costs one night.
const savedNightStore = new PersistedStore<SavedNight | null>({
  key: 'foam:night',
  schema: savedNightSchema.nullable().prefault(null),
});

/** The saved night, or null when there is none or its place is not in the content. */
export function loadSavedNight(places: Readonly<Record<string, Place>>): SavedNight | null {
  let saved = savedNightStore.load();

  if (saved !== null && !Object.hasOwn(places, saved.place)) {
    // eslint-disable-next-line no-console -- the running game reports a place the content lacks
    console.warn(`The saved night is in "${saved.place}", which is not a place.`);

    return null;
  }

  return saved;
}

/** Writes the night's data: every field of `SavedNight`, picked by name. */
export function saveNight(night: Night): void {
  let {
    seed,
    rolls,
    minutes,
    money,
    place,
    drunkenness,
    roll,
    log,
    stories,
    quest,
    events,
    ending,
    phone,
  } = night;

  savedNightStore.save({
    seed,
    rolls,
    minutes,
    money,
    place,
    drunkenness,
    roll,
    log,
    stories,
    quest,
    events,
    ending,
    phone,
  });
}

export function clearSavedNight(): void {
  savedNightStore.clear();
}
