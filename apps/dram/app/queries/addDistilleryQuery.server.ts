import {e, type $infer} from '../db';

export const addDistilleryQuery = e.params({name: e.str}, (parameters) =>
  e.insert(e.Distillery, {
    name: parameters.name,
  }),
);

export type AddDistilleryQuery = $infer<typeof addDistilleryQuery>;
