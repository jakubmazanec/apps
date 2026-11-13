import {PersistedStore} from 'tellurion';
import {z} from 'zod';

import {type Ending, type Night} from './night.js';
import {endingSchema} from './save.js';

export type PastNight = {seed: number; date: number; ending: Ending | null; stories: string[]};

// Annotated, so that a field added to `PastNight` fails to compile until the schema handles it.
const pastNightSchema: z.ZodType<PastNight> = z.object({
  seed: z.number(),
  date: z.number(),
  ending: endingSchema.nullable(),
  stories: z.array(z.string()),
});
// `.default()` covers a key the payload is missing, `.catch()` a value that is present but
// unusable, as the settings' schema does. Each field recovers on its own, so a bad list does not
// lose the day's count and a bad count does not lose the list; no start is the day 0 with 0
// started.
const nightsSchema = z.object({
  past: z.array(pastNightSchema).default([]).catch([]),
  day: z
    .object({date: z.number(), started: z.number()})
    .default({date: 0, started: 0})
    .catch({date: 0, started: 0}),
});
const nightsStore = new PersistedStore({key: 'foam:nights', schema: nightsSchema.prefault({})});

/** Hydrated at module load: the nights ended, oldest first, and the day's count of starts. */
export const nights = nightsStore.load();

/** Appends the night's seed, the date, its ending and the titles it found, and saves. */
export function recordNight(night: Night, date: number): void {
  nights.past.push({
    seed: night.seed,
    date,
    ending: night.ending,
    stories: night.stories.map(({title}) => title),
  });
  nightsStore.save(nights);
}

/** Counts a start on the date: a new date starts at 1. Saves. */
export function countStart(date: number): void {
  if (nights.day.date === date) {
    nights.day.started += 1;
  } else {
    nights.day.date = date;
    nights.day.started = 1;
  }

  nightsStore.save(nights);
}

/** The date for a day with no start yet; the date followed by the next night's number after. */
export function getNextSeed(date: number): number {
  return nights.day.date === date ? Number(`${date}${nights.day.started + 1}`) : date;
}

/** Empties both in place and clears the store. */
export function forgetNights(): void {
  nights.past.length = 0;
  nights.day.date = 0;
  nights.day.started = 0;
  nightsStore.clear();
}
