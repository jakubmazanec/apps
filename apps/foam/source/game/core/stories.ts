import {PersistedStore} from 'tellurion';
import {z} from 'zod';

export type Collection = {
  /** The titles of every story achieved across all runs, in the order found. */
  titles: string[];
};

// `.default()` covers a key the payload is missing, `.catch()` a value that is
// present but unusable, as the settings' schema does.
const storiesSchema = z.object({titles: z.array(z.string()).default([]).catch([])});
const storiesStore = new PersistedStore({key: 'foam:stories', schema: storiesSchema.prefault({})});

/** The player's collection, hydrated from storage at module load. */
export const collection: Collection = storiesStore.load();

export function saveCollection(): void {
  storiesStore.save(collection);
}

/**
 * Reads the store back into the shared object in place: a find in an abandoned window is undone.
 */
export function reloadCollection(): void {
  collection.titles.splice(0, Infinity, ...storiesStore.load().titles);
}

/**
 * Empties the collection in place, so every night that holds it sees it empty, and clears the
 * store.
 */
export function forgetStories(): void {
  collection.titles.length = 0;
  storiesStore.clear();
}
