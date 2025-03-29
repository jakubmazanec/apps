import {makeAutoObservable} from 'mobx';

import {shuffle} from '../internals.js';
import {Card} from './Card.js';

const CARDS_IN_HAND = 5;

export type ShipOptions = {
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
  name: string;
  className: string;
  team: string;

  maxHull = 0;
  maxSails = 0;
  maxCrew = 0;

  energyPerTurn = 0; // how much energy ships gets at start of each round
  maxEnergy = 0; // max energy the ship can have
  initiative = 0; // determines order of ships action in a round; lower means it executes its actions earlier
  moveCardCostBonus = 0; // additive modifier (positive or negative) to energy costs of move cards; higher is better
  turnCardCostBonus = 0; // additive modifier (positive or negative) to energy costs of turn cards; higher is better
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

  drawPile: Card[] = [];
  discardPile: Card[] = [];
  exhaustPile: Card[] = [];
  hand: Card[] = [];

  nextRound = 0;

  constructor({
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

  static getTemplate(templateId: string): ShipOptions {
    let templates: Array<ShipOptions & {id: string}> = [
      {
        id: 'ship-1',
        name: "Droits de l'Homme",
        className: 'Ship of the line',
        team: 'France',
        maxHull: 114,
        maxSails: 85,
        maxCrew: 105,
        energyPerTurn: 8,
        maxEnergy: 10,
        initiative: 1,
        moveCardCostBonus: 0,
        turnCardCostBonus: 0,
        attackCardCostBonus: 0,
        maxAttackCards: 7,
        cards: [
          // new Card(Card.getTemplate('effect-set-sails')),
          // new Card(Card.getTemplate('effect-lower-sails')),
          // new Card(Card.getTemplate('trash-1')),
          new Card(Card.getTemplate('move-1')),
          new Card(Card.getTemplate('move-1')),
          new Card(Card.getTemplate('turn-right-60')),
          new Card(Card.getTemplate('turn-left-60')),
          new Card(Card.getTemplate('turn-right-60')),
          new Card(Card.getTemplate('turn-left-60')),
          new Card(Card.getTemplate('evade-1')),
          new Card(Card.getTemplate('evade-2')),
          new Card(Card.getTemplate('evade-4')),
          new Card(Card.getTemplate('attack-36')),
          new Card(Card.getTemplate('attack-36')),
          new Card(Card.getTemplate('attack-18')),
          new Card(Card.getTemplate('attack-18')),
          new Card(Card.getTemplate('attack-18-chain')),
          new Card(Card.getTemplate('attack-36-carronade')),
          new Card(Card.getTemplate('attack-36-carronade-grape')),
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
        maxEnergy: 10,
        initiative: 2,
        moveCardCostBonus: 2,
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
          new Card(Card.getTemplate('attack-24')),
          new Card(Card.getTemplate('attack-12')),
          new Card(Card.getTemplate('attack-42-carronade')),
          new Card(Card.getTemplate('attack-9-long')),
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
          new Card(Card.getTemplate('attack-32-grape')),
          new Card(Card.getTemplate('attack-32-chain')),
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

    let {id, ...card} = template;

    return {...card};
  }

  startRound(round: number) {
    console.log(`Ship "${this.name}" startRound()...`);

    this.nextRound = round + 1;

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
    this.energy = Math.min(this.energy + this.energyPerTurn, this.maxEnergy);
  }
}
