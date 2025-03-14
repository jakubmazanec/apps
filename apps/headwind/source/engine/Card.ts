// TODO: flippable cards?
// TODO: cards usable only once per battle (exhaustable)?
// TODO: report karta aktualizuje informace o soupeřích? něco jako že se hlídka v koši zeptala
// TODO: cardy na signalizování spojeneckým lodím?
// TODO: grape shot and chain shot varianty

import {type TupleCoordinates} from '../honeycomb/index.js';

const FAR_BROADSIDE_RANGE_VECTORS: TupleCoordinates[] = [
  [0, 0],
  [1, -1],
  [2, -2],
  [2, -1],
  [1, 0],
  [2, 0],
  [-1, 0],
  [-2, 0],
  [-2, 1],
  [-1, 1],
  [-2, 2],
];

const BROADSIDE_RANGE_VECTORS: TupleCoordinates[] = [
  [0, 0],
  [1, -1],
  [1, 0],
  [-1, 0],
  [-1, 1],
];

const BOW_CHASER_RANGE_VECTORS: TupleCoordinates[] = [
  [0, 0],
  [0, -1],
  [0, -2],
  [0, -3],
  [0, 1],
  [0, 2],
  [0, 3],
];

export type AttackCardConfig = {
  type: 'attack';
  minHullDamage: number;
  maxHullDamage: number;
  minSailsDamage: number;
  maxSailsDamage: number;
  minCrewDamage: number;
  maxCrewDamage: number;
  rangeVectors: TupleCoordinates[];
};

export type MoveCardConfig = {
  type: 'move';
  distance: number;
};

export type EffectCardConfig = {
  type: 'effect';
};

export type TurnCardConfig = {
  type: 'turn';
  angle: number;
};

export type CardConfig = {
  energy: number;
} & (AttackCardConfig | EffectCardConfig | MoveCardConfig | TurnCardConfig);

export type CardType = CardConfig['type'];

export type CardOptions = {
  name: string;
  config: CardConfig;
};

export class Card {
  name: string;
  config: CardConfig;

  constructor({name, config}: CardOptions) {
    this.name = name;
    this.config = config;
  }

  static getTemplate(templateId: string): CardOptions {
    let templates: Array<CardOptions & {id: string}> = [
      {
        id: 'move-1',
        name: 'Sail',
        config: {
          energy: 5,
          type: 'move',
          distance: 1,
        },
      },
      {
        id: 'move-2',
        name: 'Sail',
        config: {
          energy: 10,
          type: 'move',
          distance: 2,
        },
      },
      {
        id: 'turn-180',
        name: 'Turn around',
        config: {
          energy: 15,
          type: 'turn',
          angle: 60,
        },
      },
      {
        id: 'turn-right-60',
        name: 'Turn to starboard',
        config: {
          energy: 5,
          type: 'turn',
          angle: 60,
        },
      },
      {
        id: 'turn-right-120',
        name: 'Turn more to starboard',
        config: {
          energy: 10,
          type: 'turn',
          angle: 120,
        },
      },
      {
        id: 'turn-left-60',
        name: 'Turn to port',
        config: {
          energy: 5,
          type: 'turn',
          angle: -60,
        },
      },
      {
        id: 'turn-left-120',
        name: 'Turn more to port',
        config: {
          energy: 10,
          type: 'turn',
          angle: -120,
        },
      },
      {
        id: 'attack-12',
        name: 'Fire 12-pounder',
        config: {
          energy: 5,
          type: 'attack',
          maxHullDamage: 1,
          minHullDamage: 0,
          maxSailsDamage: 0,
          minSailsDamage: 0,
          maxCrewDamage: 0,
          minCrewDamage: 0,
          rangeVectors: FAR_BROADSIDE_RANGE_VECTORS,
        },
      },
      {
        id: 'attack-18',
        name: 'Fire 18-pounder',
        config: {
          energy: 5,
          type: 'attack',
          maxHullDamage: 2,
          minHullDamage: 1,
          maxSailsDamage: 0,
          minSailsDamage: 0,
          maxCrewDamage: 0,
          minCrewDamage: 0,
          rangeVectors: FAR_BROADSIDE_RANGE_VECTORS,
        },
      },
      {
        id: 'attack-24',
        name: 'Fire 24-pounder',
        config: {
          energy: 5,
          type: 'attack',
          maxHullDamage: 3,
          minHullDamage: 2,
          maxSailsDamage: 0,
          minSailsDamage: 0,
          maxCrewDamage: 0,
          minCrewDamage: 0,
          rangeVectors: FAR_BROADSIDE_RANGE_VECTORS,
        },
      },
      {
        id: 'attack-32',
        name: 'Fire 32-pounder',
        config: {
          energy: 5,
          type: 'attack',
          maxHullDamage: 4,
          minHullDamage: 3,
          maxSailsDamage: 0,
          minSailsDamage: 0,
          maxCrewDamage: 0,
          minCrewDamage: 0,
          rangeVectors: FAR_BROADSIDE_RANGE_VECTORS,
        },
      },
      {
        id: 'attack-36',
        name: 'Fire 36-pounder',
        config: {
          energy: 5,
          type: 'attack',
          maxHullDamage: 5,
          minHullDamage: 4,
          maxSailsDamage: 0,
          minSailsDamage: 0,
          maxCrewDamage: 0,
          minCrewDamage: 0,
          rangeVectors: FAR_BROADSIDE_RANGE_VECTORS,
        },
      },
      {
        id: 'attack-9-long',
        name: 'Fire long nine',
        config: {
          energy: 5,
          type: 'attack',
          maxHullDamage: 1,
          minHullDamage: 0,
          maxSailsDamage: 0,
          minSailsDamage: 0,
          maxCrewDamage: 0,
          minCrewDamage: 0,
          rangeVectors: BOW_CHASER_RANGE_VECTORS,
        },
      },
      {
        id: 'attack-32-carronade',
        name: 'Fire 32-pound carronade',
        config: {
          energy: 5,
          type: 'attack',
          maxHullDamage: 6,
          minHullDamage: 0,
          maxSailsDamage: 0,
          minSailsDamage: 0,
          maxCrewDamage: 0,
          minCrewDamage: 0,
          rangeVectors: BROADSIDE_RANGE_VECTORS,
        },
      },
      {
        id: 'attack-36-carronade',
        name: 'Fire 36-pound carronade',
        config: {
          energy: 5,
          type: 'attack',
          maxHullDamage: 8,
          minHullDamage: 0,
          maxSailsDamage: 0,
          minSailsDamage: 0,
          maxCrewDamage: 0,
          minCrewDamage: 0,
          rangeVectors: BROADSIDE_RANGE_VECTORS,
        },
      },
      {
        id: 'attack-42-carronade',
        name: 'Fire 42-pound carronade',
        config: {
          energy: 5,
          type: 'attack',
          maxHullDamage: 10,
          minHullDamage: 0,
          maxSailsDamage: 0,
          minSailsDamage: 0,
          maxCrewDamage: 0,
          minCrewDamage: 0,
          rangeVectors: BROADSIDE_RANGE_VECTORS,
        },
      },
      {
        id: 'attack-48-carronade',
        name: 'Fire 48-pound carronade',
        config: {
          energy: 5,
          type: 'attack',
          maxHullDamage: 12,
          minHullDamage: 0,
          maxSailsDamage: 0,
          minSailsDamage: 0,
          maxCrewDamage: 0,
          minCrewDamage: 0,
          rangeVectors: BROADSIDE_RANGE_VECTORS,
        },
      },
      {
        id: 'attack-56-carronade',
        name: 'Fire 56-pound carronade',
        config: {
          energy: 5,
          type: 'attack',
          maxHullDamage: 14,
          minHullDamage: 0,
          maxSailsDamage: 0,
          minSailsDamage: 0,
          maxCrewDamage: 0,
          minCrewDamage: 0,
          rangeVectors: BROADSIDE_RANGE_VECTORS,
        },
      },
      {
        id: 'attack-68-carronade',
        name: 'Fire 68-pound carronade',
        config: {
          energy: 5,
          type: 'attack',
          maxHullDamage: 16,
          minHullDamage: 0,
          maxSailsDamage: 0,
          minSailsDamage: 0,
          maxCrewDamage: 0,
          minCrewDamage: 0,
          rangeVectors: BROADSIDE_RANGE_VECTORS,
        },
      },
      {
        id: 'trash-1',
        name: 'Report!',
        config: {
          energy: 1,
          type: 'effect',
        },
      },
      {
        id: 'effect-set-sails',
        name: 'Set sails',
        config: {
          energy: 5,
          type: 'effect',
        },
      },
      {
        id: 'effect-lower-sails',
        name: 'Lower sails',
        config: {
          energy: 5,
          type: 'effect',
        },
      },
      {
        id: 'effect-board',
        name: 'Board ship',
        config: {
          energy: 10,
          type: 'effect',
        },
      },
    ];

    let template = templates.find((template) => template.id === templateId);

    if (!template) {
      throw new Error(`Card template "${templateId}" not found!`);
    }

    let {id, ...card} = template;

    return {...card};
  }
}
