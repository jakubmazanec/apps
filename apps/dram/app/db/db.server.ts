import e, {createClient} from '../../dbschema/edgeql-js/index.mjs';

export {e};

export const client = createClient();

export type E = typeof e;

export {type $infer} from '../../dbschema/edgeql-js/index.mjs';
export * from '../../dbschema/interfaces.js';
export {LocalDate, LocalDateTime} from 'edgedb';
