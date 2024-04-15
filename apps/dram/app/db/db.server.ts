import {createClient} from 'edgedb';

import e from '../../dbschema/edgeql-js/index.mjs';

export const client = createClient();

export {type $infer, createClient} from '../../dbschema/edgeql-js/index.mjs';
export {e};

export type E = typeof e;

export * from '../../dbschema/interfaces.js';
