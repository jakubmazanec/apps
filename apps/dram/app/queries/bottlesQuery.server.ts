import s{type $infer,e} from '../db';

export const bottlesQuery = e.select(e.Bottle, () => ({
  id: true,
  createdBy: true,
  createdAtIso: true,
  updatedAtIso: true,
  updatedBy: true,

  bottleNumber: true,
  bottleCode: true,
  barCode: true,
  whiskybaseId: true,
  price: true,
  bottling: {
    ...e.Bottling['*'],
    createdAt: false,
    updatedAt: false,
    distilleries: {
      ...e.Distillery['*'],
      createdAt: false,
      updatedAt: false,
    },
    bottler: {
      ...e.Bottler['*'],
      createdAt: false,
      updatedAt: false,
    },
  },
}));

export type BottlesQuery = $infer<typeof bottlesQuery>;
