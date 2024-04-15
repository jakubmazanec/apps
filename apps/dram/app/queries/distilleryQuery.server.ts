import {e, type $infer} from '../db';

export const distilleryQuery = e.params({id: e.str}, (parameters) =>
  e.select(e.Distillery, (distillery) => ({
    id: true,
    createdBy: true,
    createdAtIso: true,
    updatedAtIso: true,
    updatedBy: true,

    name: true,

    filter: e.op(distillery.id, '=', e.cast(e.uuid, parameters.id)),
  })),
);

export type DistilleryQuery = $infer<typeof distilleryQuery>;
