// TODO: flippable cards?
// TODO: cards usable only once per battle (exhaustable)?
// TODO: report karta aktualizuje informace o soupeřích? něco jako že se hlídka v koši zeptala
// TODO: cardy na signalizování spojeneckým lodím?
// TODO: grape shot and chain shot varianty
// TODO: fire card, when in hand, damages the ship, when played it is exhausted?

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
  rangeVector: TupleCoordinates;
};

export type EffectCardConfig = {
  type: 'effect';
};

export type TurnCardConfig = {
  type: 'turn';
  angle: number;
};

export type EvadeCardConfig = {
  type: 'evade';
  evade: number;
};

export type CardConfig = {
  energyCost: number;
  evadeCost: number;
} & (AttackCardConfig | EffectCardConfig | EvadeCardConfig | MoveCardConfig | TurnCardConfig);

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
        name: 'Fire long nine',
        id: 'attack-9-long',
        config: {
          energyCost: 1,
          evadeCost: 0,
          type: 'attack',
          minHullDamage: 1,
          maxHullDamage: 2,
          minSailsDamage: 0,
          maxSailsDamage: 1,
          minCrewDamage: 0,
          maxCrewDamage: 1,
          rangeVectors: BOW_CHASER_RANGE_VECTORS,
        },
      },
      {
        name: 'Fire 6-pounder',
        id: 'attack-6',
        config: {
          energyCost: 1,
          evadeCost: 0,
          type: 'attack',
          minHullDamage: 1,
          maxHullDamage: 2,
          minSailsDamage: 0,
          maxSailsDamage: 1,
          minCrewDamage: 0,
          maxCrewDamage: 1,
          rangeVectors: FAR_BROADSIDE_RANGE_VECTORS,
        },
      },
      {
        name: 'Fire 12-pounder',
        id: 'attack-12',
        config: {
          energyCost: 2,
          evadeCost: 0,
          type: 'attack',
          minHullDamage: 2,
          maxHullDamage: 4,
          minSailsDamage: 0,
          maxSailsDamage: 1,
          minCrewDamage: 0,
          maxCrewDamage: 2,
          rangeVectors: FAR_BROADSIDE_RANGE_VECTORS,
        },
      },
      {
        name: 'Fire 18-pounder',
        id: 'attack-18',
        config: {
          energyCost: 2,
          evadeCost: 0,
          type: 'attack',
          minHullDamage: 3,
          maxHullDamage: 6,
          minSailsDamage: 0,
          maxSailsDamage: 1,
          minCrewDamage: 0,
          maxCrewDamage: 3,
          rangeVectors: FAR_BROADSIDE_RANGE_VECTORS,
        },
      },
      {
        name: 'Fire 24-pounder',
        id: 'attack-24',
        config: {
          energyCost: 3,
          evadeCost: 0,
          type: 'attack',
          minHullDamage: 4,
          maxHullDamage: 8,
          minSailsDamage: 0,
          maxSailsDamage: 1,
          minCrewDamage: 0,
          maxCrewDamage: 4,
          rangeVectors: FAR_BROADSIDE_RANGE_VECTORS,
        },
      },
      {
        name: 'Fire 32-pounder',
        id: 'attack-32',
        config: {
          energyCost: 3,
          evadeCost: 0,
          type: 'attack',
          minHullDamage: 5,
          maxHullDamage: 10,
          minSailsDamage: 1,
          maxSailsDamage: 2,
          minCrewDamage: 0,
          maxCrewDamage: 5,
          rangeVectors: FAR_BROADSIDE_RANGE_VECTORS,
        },
      },
      {
        name: 'Fire 36-pounder',
        id: 'attack-36',
        config: {
          energyCost: 4,
          evadeCost: 0,
          type: 'attack',
          minHullDamage: 6,
          maxHullDamage: 12,
          minSailsDamage: 1,
          maxSailsDamage: 2,
          minCrewDamage: 0,
          maxCrewDamage: 6,
          rangeVectors: FAR_BROADSIDE_RANGE_VECTORS,
        },
      },
      {
        name: 'Fire 12-pound carronade',
        id: 'attack-12-carronade',
        config: {
          energyCost: 1,
          evadeCost: 0,
          type: 'attack',
          minHullDamage: 2,
          maxHullDamage: 4,
          minSailsDamage: 0,
          maxSailsDamage: 0,
          minCrewDamage: 0,
          maxCrewDamage: 1,
          rangeVectors: BROADSIDE_RANGE_VECTORS,
        },
      },
      {
        name: 'Fire 24-pound carronade',
        id: 'attack-24-carronade',
        config: {
          energyCost: 2,
          evadeCost: 0,
          type: 'attack',
          minHullDamage: 4,
          maxHullDamage: 8,
          minSailsDamage: 0,
          maxSailsDamage: 0,
          minCrewDamage: 0,
          maxCrewDamage: 2,
          rangeVectors: BROADSIDE_RANGE_VECTORS,
        },
      },
      {
        name: 'Fire 32-pound carronade',
        id: 'attack-32-carronade',
        config: {
          energyCost: 2,
          evadeCost: 0,
          type: 'attack',
          minHullDamage: 6,
          maxHullDamage: 10,
          minSailsDamage: 0,
          maxSailsDamage: 0,
          minCrewDamage: 0,
          maxCrewDamage: 3,
          rangeVectors: BROADSIDE_RANGE_VECTORS,
        },
      },
      {
        name: 'Fire 36-pound carronade',
        id: 'attack-36-carronade',
        config: {
          energyCost: 3,
          evadeCost: 0,
          type: 'attack',
          minHullDamage: 8,
          maxHullDamage: 12,
          minSailsDamage: 0,
          maxSailsDamage: 0,
          minCrewDamage: 2,
          maxCrewDamage: 4,
          rangeVectors: BROADSIDE_RANGE_VECTORS,
        },
      },
      {
        name: 'Fire 42-pound carronade',
        id: 'attack-42-carronade',
        config: {
          energyCost: 4,
          evadeCost: 0,
          type: 'attack',
          minHullDamage: 10,
          maxHullDamage: 16,
          minSailsDamage: 0,
          maxSailsDamage: 0,
          minCrewDamage: 2,
          maxCrewDamage: 5,
          rangeVectors: BROADSIDE_RANGE_VECTORS,
        },
      },
      {
        name: 'Fire 48-pound carronade',
        id: 'attack-48-carronade',
        config: {
          energyCost: 4,
          evadeCost: 0,
          type: 'attack',
          minHullDamage: 12,
          maxHullDamage: 20,
          minSailsDamage: 0,
          maxSailsDamage: 0,
          minCrewDamage: 2,
          maxCrewDamage: 6,
          rangeVectors: BROADSIDE_RANGE_VECTORS,
        },
      },
      {
        name: 'Fire 56-pound carronade',
        id: 'attack-56-carronade',
        config: {
          energyCost: 5,
          evadeCost: 0,
          type: 'attack',
          minHullDamage: 16,
          maxHullDamage: 22,
          minSailsDamage: 0,
          maxSailsDamage: 0,
          minCrewDamage: 2,
          maxCrewDamage: 8,
          rangeVectors: BROADSIDE_RANGE_VECTORS,
        },
      },
      {
        name: 'Fire 68-pound carronade',
        id: 'attack-68-carronade',
        config: {
          energyCost: 5,
          evadeCost: 0,
          type: 'attack',
          minHullDamage: 18,
          maxHullDamage: 24,
          minSailsDamage: 0,
          maxSailsDamage: 0,
          minCrewDamage: 4,
          maxCrewDamage: 6,
          rangeVectors: BROADSIDE_RANGE_VECTORS,
        },
      },
      {
        name: 'Fire 6-pounder grape shot',
        id: 'attack-6-grape',
        config: {
          energyCost: 1,
          evadeCost: 0,
          type: 'attack',
          minHullDamage: 0,
          maxHullDamage: 0,
          minSailsDamage: 1,
          maxSailsDamage: 2,
          minCrewDamage: 0,
          maxCrewDamage: 2,
          rangeVectors: FAR_BROADSIDE_RANGE_VECTORS,
        },
      },
      {
        name: 'Fire 12-pounder grape shot',
        id: 'attack-12-grape',
        config: {
          energyCost: 1,
          evadeCost: 0,
          type: 'attack',
          minHullDamage: 0,
          maxHullDamage: 0,
          minSailsDamage: 0,
          maxSailsDamage: 1,
          minCrewDamage: 0,
          maxCrewDamage: 4,
          rangeVectors: FAR_BROADSIDE_RANGE_VECTORS,
        },
      },
      {
        name: 'Fire 24-pounder grape shot',
        id: 'attack-24-grape',
        config: {
          energyCost: 2,
          evadeCost: 0,
          type: 'attack',
          minHullDamage: 0,
          maxHullDamage: 0,
          minSailsDamage: 0,
          maxSailsDamage: 1,
          minCrewDamage: 0,
          maxCrewDamage: 6,
          rangeVectors: FAR_BROADSIDE_RANGE_VECTORS,
        },
      },
      {
        name: 'Fire 32-pounder grape shot',
        id: 'attack-32-grape',
        config: {
          energyCost: 2,
          evadeCost: 0,
          type: 'attack',
          minHullDamage: 0,
          maxHullDamage: 0,
          minSailsDamage: 0,
          maxSailsDamage: 2,
          minCrewDamage: 0,
          maxCrewDamage: 8,
          rangeVectors: FAR_BROADSIDE_RANGE_VECTORS,
        },
      },
      {
        name: 'Fire 36-pounder grape shot',
        id: 'attack-36-grape',
        config: {
          energyCost: 3,
          evadeCost: 0,
          type: 'attack',
          minHullDamage: 0,
          maxHullDamage: 0,
          minSailsDamage: 1,
          maxSailsDamage: 4,
          minCrewDamage: 1,
          maxCrewDamage: 12,
          rangeVectors: FAR_BROADSIDE_RANGE_VECTORS,
        },
      },
      {
        name: 'Fire 42-pounder grape shot',
        id: 'attack-42-grape',
        config: {
          energyCost: 3,
          evadeCost: 0,
          type: 'attack',
          minHullDamage: 0,
          maxHullDamage: 0,
          minSailsDamage: 0,
          maxSailsDamage: 1,
          minCrewDamage: 0,
          maxCrewDamage: 16,
          rangeVectors: FAR_BROADSIDE_RANGE_VECTORS,
        },
      },
      {
        name: 'Fire 56-pounder grape shot',
        id: 'attack-56-grape',
        config: {
          energyCost: 4,
          evadeCost: 0,
          type: 'attack',
          minHullDamage: 0,
          maxHullDamage: 0,
          minSailsDamage: 0,
          maxSailsDamage: 2,
          minCrewDamage: 0,
          maxCrewDamage: 20,
          rangeVectors: FAR_BROADSIDE_RANGE_VECTORS,
        },
      },
      {
        name: 'Fire 68-pounder grape shot',
        id: 'attack-68-grape',
        config: {
          energyCost: 5,
          evadeCost: 0,
          type: 'attack',
          minHullDamage: 0,
          maxHullDamage: 0,
          minSailsDamage: 0,
          maxSailsDamage: 0,
          minCrewDamage: 0,
          maxCrewDamage: 24,
          rangeVectors: FAR_BROADSIDE_RANGE_VECTORS,
        },
      },
      {
        name: 'Fire 6-pound carronade grape shot',
        id: 'attack-6-carronade-grape',
        config: {
          energyCost: 1,
          evadeCost: 0,
          type: 'attack',
          minHullDamage: 0,
          maxHullDamage: 0,
          minSailsDamage: 1,
          maxSailsDamage: 4,
          minCrewDamage: 0,
          maxCrewDamage: 1,
          rangeVectors: BROADSIDE_RANGE_VECTORS,
        },
      },
      {
        name: 'Fire 12-pound carronade grape shot',
        id: 'attack-12-carronade-grape',
        config: {
          energyCost: 1,
          evadeCost: 0,
          type: 'attack',
          minHullDamage: 0,
          maxHullDamage: 0,
          minSailsDamage: 3,
          maxSailsDamage: 6,
          minCrewDamage: 0,
          maxCrewDamage: 2,
          rangeVectors: BROADSIDE_RANGE_VECTORS,
        },
      },
      {
        name: 'Fire 18-pound carronade grape shot',
        id: 'attack-18-carronade-grape',
        config: {
          energyCost: 2,
          evadeCost: 0,
          type: 'attack',
          minHullDamage: 0,
          maxHullDamage: 0,
          minSailsDamage: 5,
          maxSailsDamage: 8,
          minCrewDamage: 1,
          maxCrewDamage: 4,
          rangeVectors: BROADSIDE_RANGE_VECTORS,
        },
      },
      {
        name: 'Fire 24-pound carronade grape shot',
        id: 'attack-24-carronade-grape',
        config: {
          energyCost: 2,
          evadeCost: 0,
          type: 'attack',
          minHullDamage: 0,
          maxHullDamage: 0,
          minSailsDamage: 7,
          maxSailsDamage: 8,
          minCrewDamage: 0,
          maxCrewDamage: 8,
          rangeVectors: BROADSIDE_RANGE_VECTORS,
        },
      },
      {
        name: 'Fire 32-pound carronade grape shot',
        id: 'attack-32-carronade-grape',
        config: {
          energyCost: 3,
          evadeCost: 0,
          type: 'attack',
          minHullDamage: 0,
          maxHullDamage: 0,
          minSailsDamage: 1,
          maxSailsDamage: 12,
          minCrewDamage: 1,
          maxCrewDamage: 4,
          rangeVectors: BROADSIDE_RANGE_VECTORS,
        },
      },
      {
        name: 'Fire 36-pound carronade grape shot',
        id: 'attack-36-carronade-grape',
        config: {
          energyCost: 3,
          evadeCost: 0,
          type: 'attack',
          minHullDamage: 0,
          maxHullDamage: 0,
          minSailsDamage: 4,
          maxSailsDamage: 6,
          minCrewDamage: 0,
          maxCrewDamage: 10,
          rangeVectors: BROADSIDE_RANGE_VECTORS,
        },
      },
      {
        name: 'Fire 42-pound carronade grape shot',
        id: 'attack-42-carronade-grape',
        config: {
          energyCost: 4,
          evadeCost: 0,
          type: 'attack',
          minHullDamage: 0,
          maxHullDamage: 0,
          minSailsDamage: 2,
          maxSailsDamage: 2,
          minCrewDamage: 0,
          maxCrewDamage: 12,
          rangeVectors: BROADSIDE_RANGE_VECTORS,
        },
      },
      {
        name: 'Fire 48-pound carronade grape shot',
        id: 'attack-48-carronade-grape',
        config: {
          energyCost: 4,
          evadeCost: 0,
          type: 'attack',
          minHullDamage: 0,
          maxHullDamage: 0,
          minSailsDamage: 0,
          maxSailsDamage: 16,
          minCrewDamage: 0,
          maxCrewDamage: 16,
          rangeVectors: BROADSIDE_RANGE_VECTORS,
        },
      },
      {
        name: 'Fire 56-pound carronade grape shot',
        id: 'attack-56-carronade-grape',
        config: {
          energyCost: 5,
          evadeCost: 0,
          type: 'attack',
          minHullDamage: 0,
          maxHullDamage: 0,
          minSailsDamage: 0,
          maxSailsDamage: 18,
          minCrewDamage: 0,
          maxCrewDamage: 20,
          rangeVectors: BROADSIDE_RANGE_VECTORS,
        },
      },
      {
        name: 'Fire long nine chain shot',
        id: 'attack-9-long-chain',
        config: {
          energyCost: 1,
          evadeCost: 0,
          type: 'attack',
          minHullDamage: 1,
          maxHullDamage: 1,
          minSailsDamage: 1,
          maxSailsDamage: 2,
          minCrewDamage: 0,
          maxCrewDamage: 1,
          rangeVectors: BOW_CHASER_RANGE_VECTORS,
        },
      },
      {
        name: 'Fire 6-pounder chain shot',
        id: 'attack-6-chain',
        config: {
          energyCost: 1,
          evadeCost: 0,
          type: 'attack',
          minHullDamage: 0,
          maxHullDamage: 0,
          minSailsDamage: 3,
          maxSailsDamage: 4,
          minCrewDamage: 0,
          maxCrewDamage: 1,
          rangeVectors: FAR_BROADSIDE_RANGE_VECTORS,
        },
      },
      {
        name: 'Fire 12-pounder chain shot',
        id: 'attack-12-chain',
        config: {
          energyCost: 1,
          evadeCost: 0,
          type: 'attack',
          minHullDamage: 0,
          maxHullDamage: 0,
          minSailsDamage: 5,
          maxSailsDamage: 6,
          minCrewDamage: 0,
          maxCrewDamage: 2,
          rangeVectors: FAR_BROADSIDE_RANGE_VECTORS,
        },
      },
      {
        name: 'Fire 18-pounder chain shot',
        id: 'attack-18-chain',
        config: {
          energyCost: 2,
          evadeCost: 0,
          type: 'attack',
          minHullDamage: 0,
          maxHullDamage: 0,
          minSailsDamage: 7,
          maxSailsDamage: 8,
          minCrewDamage: 0,
          maxCrewDamage: 1,
          rangeVectors: FAR_BROADSIDE_RANGE_VECTORS,
        },
      },
      {
        name: 'Fire 24-pounder chain shot',
        id: 'attack-24-chain',
        config: {
          energyCost: 2,
          evadeCost: 0,
          type: 'attack',
          minHullDamage: 0,
          maxHullDamage: 0,
          minSailsDamage: 10,
          maxSailsDamage: 11,
          minCrewDamage: 1,
          maxCrewDamage: 4,
          rangeVectors: FAR_BROADSIDE_RANGE_VECTORS,
        },
      },
      {
        name: 'Fire 32-pounder chain shot',
        id: 'attack-32-chain',
        config: {
          energyCost: 3,
          evadeCost: 0,
          type: 'attack',
          minHullDamage: 0,
          maxHullDamage: 0,
          minSailsDamage: 12,
          maxSailsDamage: 14,
          minCrewDamage: 0,
          maxCrewDamage: 5,
          rangeVectors: FAR_BROADSIDE_RANGE_VECTORS,
        },
      },
      {
        name: 'Fire 36-pounder chain shot',
        id: 'attack-36-chain',
        config: {
          energyCost: 3,
          evadeCost: 0,
          type: 'attack',
          minHullDamage: 0,
          maxHullDamage: 0,
          minSailsDamage: 2,
          maxSailsDamage: 4,
          minCrewDamage: 0,
          maxCrewDamage: 1,
          rangeVectors: FAR_BROADSIDE_RANGE_VECTORS,
        },
      },
      {
        name: 'Fire 42-pounder chain shot',
        id: 'attack-42-chain',
        config: {
          energyCost: 4,
          evadeCost: 0,
          type: 'attack',
          minHullDamage: 0,
          maxHullDamage: 0,
          minSailsDamage: 6,
          maxSailsDamage: 8,
          minCrewDamage: 0,
          maxCrewDamage: 2,
          rangeVectors: FAR_BROADSIDE_RANGE_VECTORS,
        },
      },
      {
        name: 'Fire 6-pound carronade chain shot',
        id: 'attack-6-carronade-chain',
        config: {
          energyCost: 1,
          evadeCost: 0,
          type: 'attack',
          minHullDamage: 0,
          maxHullDamage: 0,
          minSailsDamage: 4,
          maxSailsDamage: 6,
          minCrewDamage: 0,
          maxCrewDamage: 1,
          rangeVectors: FAR_BROADSIDE_RANGE_VECTORS,
        },
      },
      {
        name: 'Fire 12-pound carronade chain shot',
        id: 'attack-12-carronade-chain',
        config: {
          energyCost: 1,
          evadeCost: 0,
          type: 'attack',
          minHullDamage: 0,
          maxHullDamage: 0,
          minSailsDamage: 8,
          maxSailsDamage: 10,
          minCrewDamage: 0,
          maxCrewDamage: 2,
          rangeVectors: FAR_BROADSIDE_RANGE_VECTORS,
        },
      },
      {
        name: 'Fire 18-pound carronade chain shot',
        id: 'attack-18-carronade-chain',
        config: {
          energyCost: 2,
          evadeCost: 0,
          type: 'attack',
          minHullDamage: 0,
          maxHullDamage: 0,
          minSailsDamage: 10,
          maxSailsDamage: 12,
          minCrewDamage: 1,
          maxCrewDamage: 2,
          rangeVectors: FAR_BROADSIDE_RANGE_VECTORS,
        },
      },
      {
        name: 'Fire 24-pound carronade chain shot',
        id: 'attack-24-carronade-chain',
        config: {
          energyCost: 2,
          evadeCost: 0,
          type: 'attack',
          minHullDamage: 0,
          maxHullDamage: 0,
          minSailsDamage: 12,
          maxSailsDamage: 14,
          minCrewDamage: 0,
          maxCrewDamage: 3,
          rangeVectors: FAR_BROADSIDE_RANGE_VECTORS,
        },
      },
      {
        name: 'Fire 32-pound carronade chain shot',
        id: 'attack-32-carronade-chain',
        config: {
          energyCost: 3,
          evadeCost: 0,
          type: 'attack',
          minHullDamage: 0,
          maxHullDamage: 0,
          minSailsDamage: 14,
          maxSailsDamage: 16,
          minCrewDamage: 0,
          maxCrewDamage: 4,
          rangeVectors: FAR_BROADSIDE_RANGE_VECTORS,
        },
      },
      {
        name: 'Fire 42-pound carronade chain shot',
        id: 'attack-42-carronade-chain',
        config: {
          energyCost: 4,
          evadeCost: 0,
          type: 'attack',
          minHullDamage: 0,
          maxHullDamage: 0,
          minSailsDamage: 16,
          maxSailsDamage: 18,
          minCrewDamage: 0,
          maxCrewDamage: 6,
          rangeVectors: FAR_BROADSIDE_RANGE_VECTORS,
        },
      },
      {
        name: 'Fire 48-pound carronade chain shot',
        id: 'attack-48-carronade-chain',
        config: {
          energyCost: 4,
          evadeCost: 0,
          type: 'attack',
          minHullDamage: 0,
          maxHullDamage: 0,
          minSailsDamage: 16,
          maxSailsDamage: 18,
          minCrewDamage: 0,
          maxCrewDamage: 10,
          rangeVectors: FAR_BROADSIDE_RANGE_VECTORS,
        },
      },
      {
        name: 'Fire 56-pound carronade chain shot',
        id: 'attack-56-carronade-chain',
        config: {
          energyCost: 5,
          evadeCost: 0,
          type: 'attack',
          minHullDamage: 0,
          maxHullDamage: 0,
          minSailsDamage: 18,
          maxSailsDamage: 20,
          minCrewDamage: 0,
          maxCrewDamage: 16,
          rangeVectors: FAR_BROADSIDE_RANGE_VECTORS,
        },
      },

      {
        id: 'move-evade',
        name: 'Sail',
        config: {
          energyCost: 0,
          evadeCost: 5,
          type: 'move',
          rangeVector: [0, -1],
        },
      },
      {
        id: 'turn-right-evade',
        name: 'Turn to starboard',
        config: {
          energyCost: 0,
          evadeCost: 5,
          type: 'turn',
          angle: 60,
        },
      },
      {
        id: 'turn-left-evade',
        name: 'Turn to port',
        config: {
          energyCost: 0,
          evadeCost: 5,
          type: 'turn',
          angle: -60,
        },
      },
      {
        id: 'move-1',
        name: 'Sail',
        config: {
          energyCost: 5,
          evadeCost: 0,
          type: 'move',
          rangeVector: [0, -1],
        },
      },
      {
        id: 'move-2',
        name: 'Sail',
        config: {
          energyCost: 10,
          evadeCost: 0,
          type: 'move',
          rangeVector: [0, -2],
        },
      },
      {
        id: 'turn-180',
        name: 'Turn around',
        config: {
          energyCost: 15,
          evadeCost: 0,
          type: 'turn',
          angle: 180,
        },
      },
      {
        id: 'turn-right-60',
        name: 'Turn to starboard',
        config: {
          energyCost: 5,
          evadeCost: 0,
          type: 'turn',
          angle: 60,
        },
      },
      {
        id: 'turn-right-120',
        name: 'Turn more to starboard',
        config: {
          energyCost: 10,
          evadeCost: 0,
          type: 'turn',
          angle: 120,
        },
      },
      {
        id: 'turn-left-60',
        name: 'Turn to port',
        config: {
          energyCost: 5,
          evadeCost: 0,
          type: 'turn',
          angle: -60,
        },
      },
      {
        id: 'turn-left-120',
        name: 'Turn more to port',
        config: {
          energyCost: 10,
          evadeCost: 0,
          type: 'turn',
          angle: -120,
        },
      },
      {
        id: 'trash-1',
        name: 'Report!',
        config: {
          energyCost: 1,
          evadeCost: 0,
          type: 'effect',
        },
      },
      {
        id: 'effect-set-sails',
        name: 'Set sails',
        config: {
          energyCost: 5,
          evadeCost: 0,
          type: 'effect',
        },
      },
      {
        id: 'effect-lower-sails',
        name: 'Lower sails',
        config: {
          energyCost: 5,
          evadeCost: 0,
          type: 'effect',
        },
      },
      {
        id: 'effect-board',
        name: 'Board ship',
        config: {
          energyCost: 10,
          evadeCost: 0,
          type: 'effect',
        },
      },
      {
        id: 'evade-1',
        name: '+1 evade',
        config: {
          energyCost: 1,
          evadeCost: 0,
          type: 'evade',
          evade: 1,
        },
      },
      {
        id: 'evade-2',
        name: '+2 evade',
        config: {
          energyCost: 2,
          evadeCost: 0,
          type: 'evade',
          evade: 2,
        },
      },
      {
        id: 'evade-3',
        name: '+3 evade',
        config: {
          energyCost: 3,
          evadeCost: 0,
          type: 'evade',
          evade: 3,
        },
      },
      {
        id: 'evade-4',
        name: '+4 evade',
        config: {
          energyCost: 4,
          evadeCost: 0,
          type: 'evade',
          evade: 4,
        },
      },
      {
        id: 'evade-5',
        name: '+5 evade',
        config: {
          energyCost: 5,
          evadeCost: 0,
          type: 'evade',
          evade: 5,
        },
      },
      {
        id: 'evade-6',
        name: '+6 evade',
        config: {
          energyCost: 6,
          evadeCost: 0,
          type: 'evade',
          evade: 6,
        },
      },
      {
        id: 'evade-7',
        name: '+7 evade',
        config: {
          energyCost: 7,
          evadeCost: 0,
          type: 'evade',
          evade: 7,
        },
      },
      {
        id: 'evade-8',
        name: '+8 evade',
        config: {
          energyCost: 8,
          evadeCost: 0,
          type: 'evade',
          evade: 8,
        },
      },
      {
        id: 'evade-9',
        name: '+9 evade',
        config: {
          energyCost: 9,
          evadeCost: 0,
          type: 'evade',
          evade: 9,
        },
      },
      {
        id: 'evade-10',
        name: '+10 evade',
        config: {
          energyCost: 10,
          evadeCost: 0,
          type: 'evade',
          evade: 10,
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
