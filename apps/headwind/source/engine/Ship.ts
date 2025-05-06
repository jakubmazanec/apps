import {makeAutoObservable} from 'mobx';

import {shuffle} from '../internals.js';
import {Card} from './Card.js';
import {Effect, type EffectDurationType} from './Effect.js';
import {type Game} from './Game.js';

const CARDS_IN_HAND = 5;

export type ShipAmmo = 'chain' | 'grape' | 'round';

export type ShipOptions = {
  game: Game;

  name: string;
  className: string;
  team: string;

  maxHull: number;
  maxSails: number;
  maxCrew: number;

  energyPerTurn: number;
  maxEnergy: number;
  initiative: number;
  moveCardCostBonus: number;
  turnCardCostBonus: number;
  attackCardCostBonus: number;
  maxAttackCards: number;

  cards: Card[];
};

export class Ship {
  game: Game;

  name: string;
  className: string;
  team: string;

  maxHull = 0;
  maxSails = 0;
  maxCrew = 0;

  #energyPerTurn = 0; // how much energy ships gets at start of each round
  maxEnergy = 0; // max energy the ship can have
  #initiative = 0; // determines order of ships action in a round; lower means it executes its actions earlier
  #moveCardCostBonus = 0; // additive modifier (positive or negative) to energy costs of move cards; higher is better
  #turnCardCostBonus = 0; // additive modifier (positive or negative) to energy costs of turn cards; higher is better
  attackCardCostBonus = 0; // additive modifier (positive or negative) to energy costs of attack cards; higher is better
  maxAttackCards = 0; // how many attack cards ship can have

  hull = 0;
  sails = 0;
  crew = 0;
  energy = 0;
  evade = 0;
  q = 0;
  r = 0;
  direction = 0;
  // ammo: ShipAmmo = 'round';

  drawPile: Card[] = [];
  discardPile: Card[] = [];
  exhaustPile: Card[] = [];
  hand: Card[] = [];

  effects: Effect[] = [];

  nextRound = 0;
  roundsUntilAutomove = 3;

  constructor({
    game,
    name,
    className,
    team,
    maxHull,
    maxSails,
    maxCrew,
    energyPerTurn,
    maxEnergy,
    initiative,
    moveCardCostBonus,
    turnCardCostBonus,
    attackCardCostBonus,
    maxAttackCards,
    cards,
  }: ShipOptions) {
    makeAutoObservable(this);

    this.game = game;

    this.name = name;
    this.className = className;
    this.team = team;

    this.maxHull = maxHull;
    this.maxSails = maxSails;
    this.maxCrew = maxCrew;

    this.energyPerTurn = energyPerTurn;
    this.maxEnergy = maxEnergy;
    this.initiative = initiative;
    this.moveCardCostBonus = moveCardCostBonus;
    this.turnCardCostBonus = turnCardCostBonus;
    this.attackCardCostBonus = attackCardCostBonus;
    this.maxAttackCards = maxAttackCards;

    this.drawPile = [...cards];

    this.reset();
  }

  get isDestroyed() {
    return this.hull <= 0;
  }

  get allCards() {
    return [...this.drawPile, ...this.discardPile, ...this.exhaustPile, ...this.hand];
  }

  get energyPerTurn() {
    let resolvedValue = this.#energyPerTurn;

    // TODO:
    for (let effect of this.effects) {
      if (effect.config.type === 'change-ship' && effect.config.propertyName === 'energyPerTurn') {
        if (effect.config.value !== null) {
          resolvedValue = effect.config.value;

          continue;
        }

        resolvedValue = (resolvedValue + effect.config.bonus) * effect.config.multiplier;
      }
    }

    return Math.max(resolvedValue, 0);
  }

  set energyPerTurn(value: number) {
    this.#energyPerTurn = value;
  }

  get initiative() {
    let resolvedValue = this.#initiative;

    // TODO:
    for (let effect of this.effects) {
      if (effect.config.type === 'change-ship' && effect.config.propertyName === 'initiative') {
        if (effect.config.value !== null) {
          resolvedValue = effect.config.value;

          continue;
        }

        resolvedValue = (resolvedValue + effect.config.bonus) * effect.config.multiplier;
      }
    }

    return resolvedValue;
  }

  set initiative(value: number) {
    this.#initiative = value;
  }

  get moveCardCostBonus() {
    let resolvedValue = this.#moveCardCostBonus;

    // TODO:
    for (let effect of this.effects) {
      if (
        effect.config.type === 'change-ship' &&
        effect.config.propertyName === 'moveCardCostBonus'
      ) {
        if (effect.config.value !== null) {
          resolvedValue = effect.config.value;

          continue;
        }

        resolvedValue = (resolvedValue + effect.config.bonus) * effect.config.multiplier;
      }
    }

    return resolvedValue;
  }

  set moveCardCostBonus(value: number) {
    this.#moveCardCostBonus = value;
  }

  get turnCardCostBonus() {
    let resolvedValue = this.#turnCardCostBonus;

    // TODO:
    for (let effect of this.effects) {
      if (
        effect.config.type === 'change-ship' &&
        effect.config.propertyName === 'turnCardCostBonus'
      ) {
        if (effect.config.value !== null) {
          resolvedValue = effect.config.value;

          continue;
        }

        resolvedValue = (resolvedValue + effect.config.bonus) * effect.config.multiplier;
      }
    }

    return resolvedValue;
  }

  set turnCardCostBonus(value: number) {
    this.#turnCardCostBonus = value;
  }

  reset() {
    this.hull = this.maxHull;
    this.sails = this.maxSails;
    this.crew = this.maxCrew;
    this.energy = 0;

    this.drawPile.push(...this.discardPile, ...this.exhaustPile, ...this.hand);
    shuffle(this.drawPile);

    let attackCardsCount = this.drawPile.filter((card) => card.config.type === 'attack').length;

    if (attackCardsCount > this.maxAttackCards) {
      throw new Error(`Ship "${this.name}" has more than ${attackCardsCount} attack cards!`);
    }

    this.discardPile = [];
    this.exhaustPile = [];
    this.hand = [];
  }

  static getTemplate(templateId: string): Omit<ShipOptions, 'game'> {
    let templates: Array<Omit<ShipOptions, 'game'> & {id: string}> = [
      {
        id: 'ship-1',
        name: "Droits de l'Homme",
        className: 'Ship of the line',
        team: 'France',
        maxHull: 114,
        maxSails: 85,
        maxCrew: 105,
        energyPerTurn: 6,
        maxEnergy: 8,
        initiative: 1,
        moveCardCostBonus: -1,
        turnCardCostBonus: -1,
        attackCardCostBonus: 0,
        maxAttackCards: 7,
        cards: [
          // new Card(Card.getTemplate('effect-set-sails')),
          // new Card(Card.getTemplate('effect-lower-sails')),
          // new Card(Card.getTemplate('trash-1')),
          new Card(Card.getTemplate('move-1')),
          new Card(Card.getTemplate('move-1')),
          // new Card(Card.getTemplate('move-1')),
          // new Card(Card.getTemplate('move-1')),
          // new Card(Card.getTemplate('turn-right-60')),
          new Card(Card.getTemplate('turn-right-60')),
          // new Card(Card.getTemplate('turn-left-60')),
          new Card(Card.getTemplate('turn-left-60')),
          new Card(Card.getTemplate('evade-1')),
          new Card(Card.getTemplate('evade-2')),
          // new Card(Card.getTemplate('evade-4')),
          new Card(Card.getTemplate('attack-36')),
          new Card(Card.getTemplate('attack-36')),
          new Card(Card.getTemplate('attack-18')),
          new Card(Card.getTemplate('attack-18')),
          new Card(Card.getTemplate('attack-18')),
          // new Card(Card.getTemplate('attack-36-carronade')),
          // new Card(Card.getTemplate('attack-36-carronade')),

          // new Card(Card.getTemplate('effect-ammo-chain-2')),
          // new Card(Card.getTemplate('effect-ammo-grape-2')),

          // new Card(Card.getTemplate('effect-accuracy-bonus-5')),
          // new Card(Card.getTemplate('effect-accuracy-bonus-10')),

          new Card(Card.getTemplate('board-1')),
          new Card(Card.getTemplate('board-1')),
        ],
      },
      {
        id: 'ship-2',
        name: 'HMS Indefatigable',
        className: 'Frigate',
        team: 'UK',
        maxHull: 67,
        maxSails: 65,
        maxCrew: 46,
        energyPerTurn: 4,
        maxEnergy: 6,
        initiative: 2,
        moveCardCostBonus: 1,
        turnCardCostBonus: 1,
        attackCardCostBonus: 0,
        maxAttackCards: 4,
        cards: [
          // new Card(Card.getTemplate('effect-set-sails')),
          // new Card(Card.getTemplate('effect-lower-sails')),
          // new Card(Card.getTemplate('trash-1')),
          new Card(Card.getTemplate('move-1')),
          new Card(Card.getTemplate('move-1')),
          new Card(Card.getTemplate('move-1')),
          new Card(Card.getTemplate('move-1')),
          new Card(Card.getTemplate('turn-right-60')),
          new Card(Card.getTemplate('turn-right-60')),
          // new Card(Card.getTemplate('turn-right-120')),
          // new Card(Card.getTemplate('turn-left-60')),
          // new Card(Card.getTemplate('turn-left-60')),
          // new Card(Card.getTemplate('turn-left-120')),
          // new Card(Card.getTemplate('turn-180')),
          // new Card(Card.getTemplate('evade-2')),
          // new Card(Card.getTemplate('evade-4')),
          new Card(Card.getTemplate('attack-24')),
          new Card(Card.getTemplate('attack-12')),
          new Card(Card.getTemplate('attack-42-carronade')),
          new Card(Card.getTemplate('attack-9-long')),

          new Card(Card.getTemplate('effect-change-card-attack-accuracy-*2')),
          new Card(Card.getTemplate('effect-change-card-attack-accuracy-*2')),
        ],
      },
      {
        id: 'ship-3',
        name: 'HMS Endymion',
        className: 'Frigate',
        team: 'UK',
        maxHull: 75,
        maxSails: 81,
        maxCrew: 45,
        energyPerTurn: 4,
        maxEnergy: 10,
        initiative: 2,
        moveCardCostBonus: 3,
        turnCardCostBonus: 0,
        attackCardCostBonus: 0,
        maxAttackCards: 4,
        cards: [
          // new Card(Card.getTemplate('effect-set-sails')),
          // new Card(Card.getTemplate('effect-lower-sails')),
          // new Card(Card.getTemplate('trash-1')),
          new Card(Card.getTemplate('move-1')),
          new Card(Card.getTemplate('move-1')),
          new Card(Card.getTemplate('turn-right-60')),
          new Card(Card.getTemplate('turn-left-60')),
          new Card(Card.getTemplate('turn-right-120')),
          new Card(Card.getTemplate('turn-left-120')),
          new Card(Card.getTemplate('turn-180')),
          new Card(Card.getTemplate('evade-1')),
          new Card(Card.getTemplate('evade-2')),
          new Card(Card.getTemplate('attack-12-carronade')),
          new Card(Card.getTemplate('attack-12-carronade')),
          new Card(Card.getTemplate('attack-12-carronade')),
          new Card(Card.getTemplate('attack-12-carronade')),
        ],
      },
      {
        id: 'ship-4',
        name: 'USS Constitution',
        className: 'Frigate',
        team: 'USA',
        maxHull: 85,
        maxSails: 83,
        maxCrew: 67,
        energyPerTurn: 6,
        maxEnergy: 10,
        initiative: 2,
        moveCardCostBonus: 2,
        turnCardCostBonus: 0,
        attackCardCostBonus: 0,
        maxAttackCards: 5,
        cards: [
          // new Card(Card.getTemplate('effect-set-sails')),
          // new Card(Card.getTemplate('effect-lower-sails')),
          // new Card(Card.getTemplate('trash-1')),
          new Card(Card.getTemplate('move-1')),
          new Card(Card.getTemplate('move-1')),
          new Card(Card.getTemplate('turn-right-60')),
          new Card(Card.getTemplate('turn-left-60')),
          new Card(Card.getTemplate('turn-right-120')),
          new Card(Card.getTemplate('turn-left-120')),
          new Card(Card.getTemplate('turn-180')),
          new Card(Card.getTemplate('evade-1')),
          new Card(Card.getTemplate('evade-2')),
          new Card(Card.getTemplate('attack-12-carronade')),
          new Card(Card.getTemplate('attack-12-carronade')),
          new Card(Card.getTemplate('attack-12-carronade')),
          new Card(Card.getTemplate('attack-12-carronade')),
          new Card(Card.getTemplate('attack-12-carronade')),
        ],
      },
      {
        id: 'ship-5',
        name: 'HMS Victory',
        className: 'Ship of the line',
        team: 'UK',
        maxHull: 130,
        maxSails: 107,
        maxCrew: 127,
        energyPerTurn: 10,
        maxEnergy: 10,
        initiative: 1,
        moveCardCostBonus: 0,
        turnCardCostBonus: 0,
        attackCardCostBonus: 0,
        maxAttackCards: 10,
        cards: [
          // new Card(Card.getTemplate('effect-set-sails')),
          // new Card(Card.getTemplate('effect-lower-sails')),
          // new Card(Card.getTemplate('trash-1')),
          new Card(Card.getTemplate('move-1')),
          new Card(Card.getTemplate('move-1')),
          new Card(Card.getTemplate('turn-right-60')),
          new Card(Card.getTemplate('turn-left-60')),
          new Card(Card.getTemplate('turn-right-120')),
          new Card(Card.getTemplate('turn-left-120')),
          new Card(Card.getTemplate('turn-180')),
          new Card(Card.getTemplate('evade-1')),
          new Card(Card.getTemplate('evade-2')),
          new Card(Card.getTemplate('attack-32')),
          new Card(Card.getTemplate('attack-32')),
          new Card(Card.getTemplate('attack-32')),
          new Card(Card.getTemplate('attack-32')),
          new Card(Card.getTemplate('attack-24')),
          new Card(Card.getTemplate('attack-24')),
          new Card(Card.getTemplate('attack-24')),
          new Card(Card.getTemplate('attack-12')),
          new Card(Card.getTemplate('attack-9-long')),
          new Card(Card.getTemplate('attack-68-carronade')),
        ],
      },
      {
        id: 'ship-6',
        name: 'HMS Nimble',
        className: 'Cutter',
        team: 'UK',
        maxHull: 7,
        maxSails: 6,
        maxCrew: 7,
        energyPerTurn: 2,
        maxEnergy: 10,
        initiative: 8,
        moveCardCostBonus: 1,
        turnCardCostBonus: 0,
        attackCardCostBonus: 0,
        maxAttackCards: 1,
        cards: [
          // new Card(Card.getTemplate('effect-set-sails')),
          // new Card(Card.getTemplate('effect-lower-sails')),
          // new Card(Card.getTemplate('trash-1')),
          new Card(Card.getTemplate('move-1')),
          new Card(Card.getTemplate('move-1')),
          new Card(Card.getTemplate('turn-right-60')),
          new Card(Card.getTemplate('turn-left-60')),
          new Card(Card.getTemplate('turn-right-120')),
          new Card(Card.getTemplate('turn-left-120')),
          new Card(Card.getTemplate('turn-180')),
          new Card(Card.getTemplate('evade-1')),
          new Card(Card.getTemplate('evade-2')),
          new Card(Card.getTemplate('attack-12-carronade')),
        ],
      },

      // {
      //   id: 'ship-1',
      //   name: 'HMS Indefatigable',
      //   className: 'Frigate',
      //   team: 'UK',

      //   maxHull: 20,
      //   maxSails: 10,
      //   maxCrew: 10,

      //   energyPerTurn: 10,
      //   maxEnergy: 15,
      //   initiative: 2,
      //   moveCardCostBonus: 2,
      //   turnCardCostBonus: 1,
      //   attackCardCostBonus: 0,
      //   maxAttackCards: 5,

      //   cards: [
      //     // new Card(Card.getTemplate('effect-set-sails')),
      //     // new Card(Card.getTemplate('effect-lower-sails')),
      //     new Card(Card.getTemplate('trash-1')),
      //     new Card(Card.getTemplate('move-1')),
      //     new Card(Card.getTemplate('move-1')),
      //     new Card(Card.getTemplate('evade-2')),
      //     new Card(Card.getTemplate('evade-4')),
      //     new Card(Card.getTemplate('evade-6')),
      //     new Card(Card.getTemplate('turn-right-60')),
      //     new Card(Card.getTemplate('turn-left-60')),
      //     new Card(Card.getTemplate('turn-right-120')),
      //     new Card(Card.getTemplate('turn-left-120')),
      //     new Card(Card.getTemplate('turn-180')),
      //     new Card(Card.getTemplate('attack-24')),
      //     new Card(Card.getTemplate('attack-42-carronade')),
      //     new Card(Card.getTemplate('attack-9-long')),

      //     // new Card(Card.getTemplate('attack-42-carronade')),
      //     // new Card(Card.getTemplate('attack-42-carronade')),
      //     // new Card(Card.getTemplate('attack-42-carronade')),
      //     // new Card(Card.getTemplate('attack-42-carronade')),
      //     // new Card(Card.getTemplate('attack-42-carronade')),
      //     // new Card(Card.getTemplate('attack-42-carronade')),
      //   ],
      // },
      // {
      //   id: 'ship-2',
      //   name: "Droits de l'Homme",
      //   className: 'Frigate',
      //   team: 'French',

      //   maxHull: 1,
      //   maxSails: 10,
      //   maxCrew: 10,

      //   energyPerTurn: 10,
      //   maxEnergy: 15,
      //   initiative: 1,
      //   moveCardCostBonus: -1,
      //   turnCardCostBonus: -1,
      //   attackCardCostBonus: 0,
      //   maxAttackCards: 5,

      //   cards: [
      //     // new Card(Card.getTemplate('effect-set-sails')),
      //     // new Card(Card.getTemplate('effect-lower-sails')),
      //     new Card(Card.getTemplate('trash-1')),
      //     new Card(Card.getTemplate('move-1')),
      //     new Card(Card.getTemplate('move-1')),
      //     new Card(Card.getTemplate('evade-1')),
      //     new Card(Card.getTemplate('evade-1')),
      //     new Card(Card.getTemplate('evade-1')),
      //     new Card(Card.getTemplate('evade-1')),
      //     new Card(Card.getTemplate('evade-1')),
      //     new Card(Card.getTemplate('turn-right-60')),
      //     new Card(Card.getTemplate('turn-left-60')),
      //     new Card(Card.getTemplate('turn-right-120')),
      //     new Card(Card.getTemplate('turn-left-120')),
      //     new Card(Card.getTemplate('turn-180')),
      //     new Card(Card.getTemplate('attack-18')),
      //     new Card(Card.getTemplate('attack-24')),
      //     new Card(Card.getTemplate('attack-36-carronade')),
      //     new Card(Card.getTemplate('attack-36-carronade')),

      //     // new Card(Card.getTemplate('move-1')),
      //     // new Card(Card.getTemplate('move-1')),
      //     // new Card(Card.getTemplate('move-1')),
      //     // new Card(Card.getTemplate('move-1')),
      //     // new Card(Card.getTemplate('move-1')),
      //     // new Card(Card.getTemplate('move-1')),
      //   ],
      // },
    ];

    let template = templates.find((template) => template.id === templateId);

    if (!template) {
      throw new Error(`Ship template "${templateId}" not found!`);
    }

    let {id, ...ship} = template;

    return {...ship};
  }

  startRound() {
    console.log(`Ship "${this.name}" startRound()...`);

    // automove countdown
    if (this.roundsUntilAutomove <= 0) {
      this.roundsUntilAutomove = 3;
    }

    this.roundsUntilAutomove -= this.game.map.windStrength;

    // effects
    this.decreaseEffectsDuration('rounds');

    for (let card of this.allCards) {
      card.decreaseEffectsDuration('rounds');
    }
  }

  startAction() {
    console.log(`Ship "${this.name}" startAction()...`);

    // set next round
    this.nextRound = this.game.round + 1;

    // change cards
    this.discardPile.push(...this.hand);

    this.hand = [];

    while (this.hand.length < CARDS_IN_HAND) {
      if (!this.drawPile.length) {
        this.drawPile.push(...this.discardPile);
        shuffle(this.drawPile);

        this.discardPile = [];
      }

      this.hand.push(this.drawPile.shift()!);
    }

    // add energy
    let damageBonus = 0;

    if (this.crew / this.maxCrew <= 0.1) {
      damageBonus = -2;
    }

    if (this.crew / this.maxCrew <= 0.5) {
      damageBonus = -1;
    }

    this.energy = Math.min(
      this.energy + Math.max(this.energyPerTurn - damageBonus, 1),
      this.maxEnergy,
    );
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
