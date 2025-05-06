// TODO: flippable cards?
// TODO: cards usable only once per battle (exhaustable)?
// TODO: report karta aktualizuje informace o soupeřích? něco jako že se hlídka v koši zeptala
// TODO: cardy na signalizování spojeneckým lodím?
// TODO: grape shot and chain shot varianty
// TODO: fire card, when in hand, damages the ship, when played it is exhausted?
// TODO: karta, která zvyšuje, kolik má loď energie za kolo
// TODO: karta, která uzdraví hull, sails, crew
// TODO: karta, co dá soupeři nějakou dočasnou akrtu do balíčku, podobně jako v Cobalt core - tzn. story vysvětlení je, mateš rozkazy soupeřeova kapitána
// TODO: karty pro manipulaci s balíčkem - najít kartu a nachystat ji navrch draw decku, karta co nabere dvě další karty, atp.
// TODO: karta, co zrychlí palbu
// TODO: karta, co změní střelbu na 2x za jednu kartu, za cenu snížení pravděpodobnosti třeba?
// TODO: karta co zvýší počet karet v ruce

import {type TupleCoordinates} from '../honeycomb/index.js';
import {Effect, type EffectDurationType} from './Effect.js';

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
  damage: number;
  accuracy: number;
  rangeVectors: TupleCoordinates[];
};

export type MoveCardConfig = {
  type: 'move';
  rangeVector: TupleCoordinates;
};

export type EffectCardConfig = {
  type: 'effect';
  useOnSelf: boolean;
  // TODO: use EffectOptions type instead, so you don't have to call Effect.from later, and just use new Effect
  effects: Effect[];
};

export type TurnCardConfig = {
  type: 'turn';
  angle: number;
};

export type EvadeCardConfig = {
  type: 'evade';
  evade: number;
};

export type BoardCardConfig = {
  type: 'board';
  advantageNeeded: number;
};

export type CardConfig = {
  energyCost: number;
  evadeCost: number;
  isExhaustible?: boolean;
  isTemporary?: boolean;
} & (
  | AttackCardConfig
  | BoardCardConfig
  | EffectCardConfig
  | EvadeCardConfig
  | MoveCardConfig
  | TurnCardConfig
);

export type CardType = CardConfig['type'];

export type CardOptions = {
  name: string;
  config: CardConfig;
};

export class Card {
  name: string;
  readonly #config: CardConfig;

  effects: Effect[] = [];

  constructor({name, config}: CardOptions) {
    this.name = name;
    this.#config = config;
  }

  get config(): CardConfig {
    let resolvedConfig: Record<string, unknown> = {...this.#config};

    for (let effect of this.effects) {
      if (
        effect.config.type === 'change-card' &&
        effect.config.propertyName in resolvedConfig &&
        typeof resolvedConfig[effect.config.propertyName] === 'number'
      ) {
        if (effect.config.value !== null) {
          resolvedConfig[effect.config.propertyName] = effect.config.value;

          continue;
        }

        resolvedConfig[effect.config.propertyName] =
          ((resolvedConfig[effect.config.propertyName] as number) + effect.config.bonus) *
          effect.config.multiplier;
      }
    }

    return resolvedConfig as unknown as CardConfig;
  }

  static getTemplate(templateId: string): CardOptions {
    let templates: Array<CardOptions & {id: string}> = [
      {
        name: 'Fire long nine',
        id: 'attack-9-long',
        config: {
          energyCost: 2,
          evadeCost: -1,
          type: 'attack',
          damage: 4,
          accuracy: 0.1,
          rangeVectors: BOW_CHASER_RANGE_VECTORS,
        },
      },
      {
        name: 'Fire 6-pounder',
        id: 'attack-6',
        config: {
          energyCost: 2,
          evadeCost: -1,
          type: 'attack',
          damage: 2,
          accuracy: 0.25,
          rangeVectors: FAR_BROADSIDE_RANGE_VECTORS,
        },
      },
      {
        name: 'Fire 12-pounder',
        id: 'attack-12',
        config: {
          energyCost: 2,
          evadeCost: -1,
          type: 'attack',
          damage: 4,
          accuracy: 0.25,
          rangeVectors: FAR_BROADSIDE_RANGE_VECTORS,
        },
      },
      {
        name: 'Fire 18-pounder',
        id: 'attack-18',
        config: {
          energyCost: 2,
          evadeCost: -1,
          type: 'attack',
          damage: 6,
          accuracy: 0.25,
          rangeVectors: FAR_BROADSIDE_RANGE_VECTORS,
        },
      },
      {
        name: 'Fire 24-pounder',
        id: 'attack-24',
        config: {
          energyCost: 4,
          evadeCost: -1,
          type: 'attack',
          damage: 8,
          accuracy: 0.25,
          rangeVectors: FAR_BROADSIDE_RANGE_VECTORS,
        },
      },
      {
        name: 'Fire 32-pounder',
        id: 'attack-32',
        config: {
          energyCost: 4,
          evadeCost: -1,
          type: 'attack',
          damage: 10,
          accuracy: 0.25,
          rangeVectors: FAR_BROADSIDE_RANGE_VECTORS,
        },
      },
      {
        name: 'Fire 36-pounder',
        id: 'attack-36',
        config: {
          energyCost: 4,
          evadeCost: -1,
          type: 'attack',
          damage: 12,
          accuracy: 0.25,
          rangeVectors: FAR_BROADSIDE_RANGE_VECTORS,
        },
      },
      {
        name: 'Fire 12-pound carronade',
        id: 'attack-12-carronade',
        config: {
          energyCost: 4,
          evadeCost: -1,
          type: 'attack',
          damage: 6,
          accuracy: 0.2,
          rangeVectors: BROADSIDE_RANGE_VECTORS,
        },
      },
      {
        name: 'Fire 18-pound carronade',
        id: 'attack-18-carronade',
        config: {
          energyCost: 4,
          evadeCost: -1,
          type: 'attack',
          damage: 10,
          accuracy: 0.2,
          rangeVectors: BROADSIDE_RANGE_VECTORS,
        },
      },
      {
        name: 'Fire 24-pound carronade',
        id: 'attack-24-carronade',
        config: {
          energyCost: 4,
          evadeCost: -1,
          type: 'attack',
          damage: 14,
          accuracy: 0.2,
          rangeVectors: BROADSIDE_RANGE_VECTORS,
        },
      },
      {
        name: 'Fire 32-pound carronade',
        id: 'attack-32-carronade',
        config: {
          energyCost: 6,
          evadeCost: -1,
          type: 'attack',
          damage: 18,
          accuracy: 0.2,
          rangeVectors: BROADSIDE_RANGE_VECTORS,
        },
      },
      {
        name: 'Fire 36-pound carronade',
        id: 'attack-36-carronade',
        config: {
          energyCost: 6,
          evadeCost: -1,
          type: 'attack',
          damage: 22,
          accuracy: 0.2,
          rangeVectors: BROADSIDE_RANGE_VECTORS,
        },
      },
      {
        name: 'Fire 42-pound carronade',
        id: 'attack-42-carronade',
        config: {
          energyCost: 6,
          evadeCost: -1,
          type: 'attack',
          damage: 26,
          accuracy: 0.2,
          rangeVectors: BROADSIDE_RANGE_VECTORS,
        },
      },
      {
        name: 'Fire 48-pound carronade',
        id: 'attack-48-carronade',
        config: {
          energyCost: 8,
          evadeCost: -1,
          type: 'attack',
          damage: 30,
          accuracy: 0.2,
          rangeVectors: BROADSIDE_RANGE_VECTORS,
        },
      },
      {
        name: 'Fire 56-pound carronade',
        id: 'attack-56-carronade',
        config: {
          energyCost: 8,
          evadeCost: -1,
          type: 'attack',
          damage: 34,
          accuracy: 0.2,
          rangeVectors: BROADSIDE_RANGE_VECTORS,
        },
      },
      {
        name: 'Fire 68-pound carronade',
        id: 'attack-68-carronade',
        config: {
          energyCost: 8,
          evadeCost: -1,
          type: 'attack',
          damage: 38,
          accuracy: 0.2,
          rangeVectors: BROADSIDE_RANGE_VECTORS,
        },
      },

      {
        id: 'internal-move-wind',
        name: 'Sail',
        config: {
          energyCost: -1,
          evadeCost: -1,
          type: 'move',
          rangeVector: [0, -1],
        },
      },
      {
        id: 'internal-move-evade',
        name: 'Sail',
        config: {
          energyCost: -1,
          evadeCost: 1,
          type: 'move',
          rangeVector: [0, -1],
        },
      },
      {
        id: 'internal-turn-right-evade',
        name: 'Turn to starboard',
        config: {
          energyCost: -1,
          evadeCost: 1,
          type: 'turn',
          angle: 60,
        },
      },
      {
        id: 'internal-turn-left-evade',
        name: 'Turn to port',
        config: {
          energyCost: -1,
          evadeCost: 1,
          type: 'turn',
          angle: -60,
        },
      },
      {
        id: 'move-1',
        name: 'Sail',
        config: {
          energyCost: 1,
          evadeCost: -1,
          type: 'move',
          rangeVector: [0, -1],
        },
      },
      {
        id: 'move-2',
        name: 'Sail',
        config: {
          energyCost: 2,
          evadeCost: -1,
          type: 'move',
          rangeVector: [0, -2],
        },
      },
      {
        id: 'turn-180',
        name: 'Turn around',
        config: {
          energyCost: 3,
          evadeCost: -1,
          type: 'turn',
          angle: 180,
        },
      },
      {
        id: 'turn-right-60',
        name: 'Turn to starboard',
        config: {
          energyCost: 1,
          evadeCost: -1,
          type: 'turn',
          angle: 60,
        },
      },
      {
        id: 'turn-right-120',
        name: 'Turn more to starboard',
        config: {
          energyCost: 2,
          evadeCost: -1,
          type: 'turn',
          angle: 120,
        },
      },
      {
        id: 'turn-left-60',
        name: 'Turn to port',
        config: {
          energyCost: 1,
          evadeCost: -1,
          type: 'turn',
          angle: -60,
        },
      },
      {
        id: 'turn-left-120',
        name: 'Turn more to port',
        config: {
          energyCost: 2,
          evadeCost: -1,
          type: 'turn',
          angle: -120,
        },
      },
      // {
      //   id: 'trash-1',
      //   name: 'Report!',
      //   config: {
      //     energyCost: 1,
      //     evadeCost: -1,
      //     type: 'effect',
      //   },
      // },
      // {
      //   id: 'effect-set-sails',
      //   name: 'Set sails',
      //   config: {
      //     energyCost: 5,
      //     evadeCost: -1,
      //     type: 'effect',
      //   },
      // },
      // {
      //   id: 'effect-lower-sails',
      //   name: 'Lower sails',
      //   config: {
      //     energyCost: 5,
      //     evadeCost: -1,
      //     type: 'effect',
      //   },
      // },
      // {
      //   id: 'effect-board',
      //   name: 'Board ship',
      //   config: {
      //     energyCost: 10,
      //     evadeCost: -1,
      //     type: 'effect',
      //   },
      // },
      {
        id: 'evade-1',
        name: '+1 evade',
        config: {
          energyCost: 1,
          evadeCost: -1,
          type: 'evade',
          evade: 1,
        },
      },
      {
        id: 'evade-2',
        name: '+2 evade',
        config: {
          energyCost: 2,
          evadeCost: -1,
          type: 'evade',
          evade: 2,
        },
      },
      {
        id: 'evade-3',
        name: '+3 evade',
        config: {
          energyCost: 3,
          evadeCost: -1,
          type: 'evade',
          evade: 3,
        },
      },
      {
        id: 'evade-4',
        name: '+4 evade',
        config: {
          energyCost: 4,
          evadeCost: -1,
          type: 'evade',
          evade: 4,
        },
      },
      {
        id: 'evade-5',
        name: '+5 evade',
        config: {
          energyCost: 5,
          evadeCost: -1,
          type: 'evade',
          evade: 5,
        },
      },
      {
        id: 'evade-6',
        name: '+6 evade',
        config: {
          energyCost: 6,
          evadeCost: -1,
          type: 'evade',
          evade: 6,
        },
      },
      {
        id: 'evade-7',
        name: '+7 evade',
        config: {
          energyCost: 7,
          evadeCost: -1,
          type: 'evade',
          evade: 7,
        },
      },
      {
        id: 'evade-8',
        name: '+8 evade',
        config: {
          energyCost: 8,
          evadeCost: -1,
          type: 'evade',
          evade: 8,
        },
      },
      {
        id: 'evade-9',
        name: '+9 evade',
        config: {
          energyCost: 9,
          evadeCost: -1,
          type: 'evade',
          evade: 9,
        },
      },
      {
        id: 'evade-10',
        name: '+10 evade',
        config: {
          energyCost: 10,
          evadeCost: -1,
          type: 'evade',
          evade: 10,
        },
      },

      {
        id: 'effect-ammo-chain-1',
        name: 'Chain shot (1 use)',
        config: {
          energyCost: 1,
          evadeCost: -1,
          type: 'effect',
          useOnSelf: true,
          effects: [
            new Effect({
              config: {
                duration: {
                  type: 'uses',
                  usesUntilEnd: 1,
                },
                type: 'ammo',
                ammo: 'chain',
              },
            }),
          ],
        },
      },
      {
        id: 'effect-ammo-chain-2',
        name: 'Chain shot (2 uses)',
        config: {
          energyCost: 1,
          evadeCost: -1,
          type: 'effect',
          useOnSelf: true,
          effects: [
            new Effect({
              config: {
                duration: {
                  type: 'uses',
                  usesUntilEnd: 2,
                },
                type: 'ammo',
                ammo: 'chain',
              },
            }),
          ],
        },
      },
      {
        id: 'effect-ammo-grape-1',
        name: 'Grape shot (1 use)',
        config: {
          energyCost: 1,
          evadeCost: -1,
          type: 'effect',
          useOnSelf: true,
          effects: [
            new Effect({
              config: {
                duration: {
                  type: 'uses',
                  usesUntilEnd: 1,
                },
                type: 'ammo',
                ammo: 'grape',
              },
            }),
          ],
        },
      },
      {
        id: 'effect-ammo-grape-2',
        name: 'Grape shot (2 uses)',
        config: {
          energyCost: 1,
          evadeCost: -1,
          type: 'effect',
          useOnSelf: true,
          effects: [
            new Effect({
              config: {
                duration: {
                  type: 'uses',
                  usesUntilEnd: 2,
                },
                type: 'ammo',
                ammo: 'grape',
              },
            }),
          ],
        },
      },
      {
        id: 'effect-accuracy-bonus-5',
        name: 'Better aim',
        config: {
          energyCost: 2,
          evadeCost: -1,
          type: 'effect',
          useOnSelf: true,
          effects: [
            new Effect({
              config: {
                duration: {
                  type: 'rounds',
                  roundsUntilEnd: 2,
                },
                type: 'accuracy',
                accuracyBonus: 0.05,
                accuracyMultiplier: 0,
              },
            }),
          ],
        },
      },
      {
        id: 'effect-accuracy-bonus-10',
        name: 'Better aim',
        config: {
          energyCost: 4,
          evadeCost: -1,
          type: 'effect',
          useOnSelf: true,
          effects: [
            new Effect({
              config: {
                duration: {
                  type: 'rounds',
                  roundsUntilEnd: 2,
                },
                type: 'accuracy',
                accuracyBonus: 0.1,
                accuracyMultiplier: 0,
              },
            }),
          ],
        },
      },

      {
        id: 'effect-change-card-attack-accuracy-*2',
        name: 'Train aiming',
        config: {
          energyCost: 2,
          evadeCost: -1,
          isExhaustible: true,
          type: 'effect',
          useOnSelf: true,
          effects: [
            new Effect({
              config: {
                duration: {
                  type: 'rounds',
                  roundsUntilEnd: 2,
                },
                type: 'change-card',
                cardType: 'attack',
                propertyName: 'accuracy',
                value: null,
                bonus: 0,
                multiplier: 2,
              },
            }),
          ],
        },
      },

      {
        id: 'effect-change-ship-energy-per-turn-+1',
        name: 'Double time!',
        config: {
          energyCost: 4,
          evadeCost: -1,
          type: 'effect',
          useOnSelf: true,
          effects: [
            new Effect({
              config: {
                duration: {
                  type: 'rounds',
                  roundsUntilEnd: 2,
                },
                type: 'change-ship',
                propertyName: 'energyPerTurn',
                value: 20,
                bonus: 0,
                multiplier: 1,
              },
            }),
          ],
        },
      },

      {
        id: 'effect-change-enemy-chip-energy-per-turn-2rounds-1',
        name: 'Fire below the deck!',
        config: {
          energyCost: 4,
          evadeCost: -1,
          type: 'effect',
          useOnSelf: false,
          effects: [
            new Effect({
              config: {
                duration: {
                  type: 'rounds',
                  roundsUntilEnd: 4,
                },
                type: 'change-ship',
                propertyName: 'energyPerTurn',
                value: null,
                bonus: 0,
                multiplier: 0.5,
              },
            }),
          ],
        },
      },

      {
        id: 'board-1',
        name: 'Board enemy ship',
        config: {
          energyCost: 4,
          evadeCost: -1,
          type: 'board',
          advantageNeeded: 1.5,
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

  applyEffect(effect: Effect) {
    this.effects.push(Effect.from(effect));
  }

  removeInactiveEffects() {
    let remainingEffects = [];

    for (let effect of this.effects) {
      if (effect.isActive) {
        remainingEffects.push(effect);
      }
    }

    this.effects = remainingEffects;
  }

  decreaseEffectsDuration(durationType: Omit<EffectDurationType, 'battle' | 'permanent' | 'uses'>) {
    for (let effect of this.effects) {
      if (effect.duration.type === durationType) {
        effect.decreaseDuration();
      }
    }

    this.removeInactiveEffects();
  }

  decreaseEffectDuration(effect: Effect) {
    if (!this.effects.includes(effect)) {
      throw new Error('Effect must belong to the ship!');
    }

    effect.decreaseDuration();

    this.removeInactiveEffects();
  }
}
