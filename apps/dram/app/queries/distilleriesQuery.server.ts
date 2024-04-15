import {e, type $infer} from '../db';

export const distilleriesQuery = e.select(e.Distillery, (distillery) => ({
  id: true,
  createdBy: true,
  createdAtIso: true,
  updatedAtIso: true,
  updatedBy: true,

  name: true,

  order_by: distillery.name,
}));

export type DistilleriesQuery = $infer<typeof distilleriesQuery>;
