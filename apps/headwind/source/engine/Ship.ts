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
  moveCardCostBonus = 0; // additive modifier (positive or negative) to energy costs of move cards
  turnCardCostBonus = 0; // additive modifier (positive or negative) to energy costs of turn cards
  attackCardCostBonus = 0; // additive modifier (positive or negative) to energy costs of attack cards

  hull = 0;
  sails = 0;
  crew = 0;
  energy = 0;
  q = 0;
  r = 0;
  direction = 0;

  drawPile: Card[] = [];
  discardPile: Card[] = [];
  exhaustPile: Card[] = [];
  hand: Card[] = [];

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

    this.drawPile = [...cards];

    this.reset();
  }

  reset() {
    this.hull = this.maxHull;
    this.sails = this.maxSails;
    this.crew = this.maxCrew;
    this.energy = 0;

    this.drawPile.push(...this.discardPile, ...this.exhaustPile, ...this.hand);
    shuffle(this.drawPile);

    this.discardPile = [];
    this.exhaustPile = [];
    this.hand = [];
  }

  static getTemplate(templateId: string): ShipOptions {
    let templates: Array<ShipOptions & {id: string}> = [
      {
        id: 'ship-1',
        name: 'HMS Indefatigable',
        className: 'Frigate',
        team: 'UK',

        maxHull: 20,
        maxSails: 10,
        maxCrew: 10,

        energyPerTurn: 10,
        maxEnergy: 15,
        initiative: 1,
        moveCardCostBonus: 1,
        turnCardCostBonus: 1,
        attackCardCostBonus: 0,

        cards: [
          new Card(Card.getTemplate('effect-set-sails')),
          new Card(Card.getTemplate('effect-lower-sails')),
          new Card(Card.getTemplate('trash-1')),
          new Card(Card.getTemplate('move-1')),
          new Card(Card.getTemplate('move-2')),
          new Card(Card.getTemplate('turn-right-60')),
          new Card(Card.getTemplate('turn-left-60')),
          new Card(Card.getTemplate('turn-right-120')),
          new Card(Card.getTemplate('turn-left-120')),
          new Card(Card.getTemplate('turn-180')),
          new Card(Card.getTemplate('attack-24')),
          new Card(Card.getTemplate('attack-42-carronade')),

          // new Card(Card.getTemplate('move-1')),
          // new Card(Card.getTemplate('move-2')),
        ],
      },
      {
        id: 'ship-2',
        name: "Droits de l'Homme",
        className: 'Frigate',
        team: 'French',

        maxHull: 20,
        maxSails: 10,
        maxCrew: 10,

        energyPerTurn: 10,
        maxEnergy: 15,
        initiative: 1,
        moveCardCostBonus: -1,
        turnCardCostBonus: -1,
        attackCardCostBonus: 0,

        cards: [
          new Card(Card.getTemplate('effect-set-sails')),
          new Card(Card.getTemplate('effect-lower-sails')),
          new Card(Card.getTemplate('trash-1')),
          new Card(Card.getTemplate('move-1')),
          new Card(Card.getTemplate('turn-right-60')),
          new Card(Card.getTemplate('turn-left-60')),
          new Card(Card.getTemplate('turn-right-120')),
          new Card(Card.getTemplate('turn-left-120')),
          new Card(Card.getTemplate('turn-180')),
          new Card(Card.getTemplate('attack-18')),
          new Card(Card.getTemplate('attack-24')),
          new Card(Card.getTemplate('attack-36-carronade')),
        ],
      },
    ];

    let template = templates.find((template) => template.id === templateId);

    if (!template) {
      throw new Error(`Ship template "${templateId}" not found!`);
    }

    let {id, ...card} = template;

    return {...card};
  }

  startRound() {
    console.log(`Ship "${this.name}" startRound()...`);

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
