import {PersistedStore} from 'tellurion';
import {z} from 'zod';

import {SEPARATOR} from './contentPath.js';

// `.default()` covers a key the payload is missing, `.catch()` a value that is
// present but unusable, as the settings' schema does.
const textsReadSchema = z.object({paths: z.array(z.string()).default([]).catch([])});
const textsReadStore = new PersistedStore({
  key: 'foam:textsRead',
  schema: textsReadSchema.prefault({}),
});

/** Hydrated at module load: the paths of every node whose text the player has seen. */
export const textsRead: {paths: string[]} = textsReadStore.load();

/** Adds the node's path once, saves, and prints `Read: …` to the console when it is new. */
export function markRead(where: string, nodeId: string): void {
  let path = `${where}${SEPARATOR}${nodeId}`;

  if (textsRead.paths.includes(path)) {
    return;
  }

  textsRead.paths.push(path);
  textsReadStore.save(textsRead);
  // eslint-disable-next-line no-console -- the author reads what the game keeps in the console
  console.info(`Read: ${path}`);
}

export function forgetTextsRead(): void {
  textsRead.paths.length = 0;
  textsReadStore.clear();
}
