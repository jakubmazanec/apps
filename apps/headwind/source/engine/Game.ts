import {makeAutoObservable} from 'mobx';

import {canAttack} from './canAttack.js';
import {canPlayCard} from './canPlayCard.js';
import {Card} from './Card.js';
import {getCardEnergyCost} from './getCardCost.js';
import {getCardEvadeCost} from './getCardEvadeCost.js';
import {Map} from './Map.js';
import {rotateHex} from './rotateHex.js';
import {Ship} from './Ship.js';
import _ from 'lodash';

export const evadeMoveCard = new Card(Card.getTemplate('move-evade'));
export const evadeTurnRightCard = new Card(Card.getTemplate('turn-right-evade'));
export const evadeTurnLeftCard = new Card(Card.getTemplate('turn-left-evade'));

export type GameStatus = 'finished' | 'in-progress' | 'not-started';

export type GameAttack = {
  card: Card;
  ship: Ship;
  target: Ship;
};

export type GameOptions = {
  map?: Map;
};

export class Game {
  map: Map;
  ships: Ship[];

  round = 0;
  status: GameStatus = 'not-started';

  activeShipIndex = 0;

  attacks: GameAttack[] = [];

  get activeShip() {
    return this.ships[this.activeShipIndex]!;
  }

  constructor({map}: GameOptions = {}) {
    makeAutoObservable(this);

    // TODO: hard-coded game settings, fix!
    this.map = new Map({
      name: 'test',
    });
    this.ships = [new Ship(Ship.getTemplate('ship-1')), new Ship(Ship.getTemplate('ship-2'))];

    this.ships[0]!.q = 7;
    this.ships[0]!.r = 3;
    this.ships[1]!.q = 8;
    this.ships[1]!.r = 2;
  }

  get result() {
    let result: Record<string, boolean> = {};
    let teams = _.groupBy(this.ships, 'team');

    for (let [teamName, teamShips] of Object.entries(teams)) {
      result[teamName] = teamShips.some((ship) => !ship.isDestroyed);
    }

    return result;
  }

  start() {
    this.status = 'in-progress';

    for (let ship of this.ships) {
      ship.reset();
    }

    this.round = 0;

    this.nextRound();
  }

  reset() {
    this.status = 'not-started';
  }

  end() {
    this.status = 'finished';
  }

  nextRound() {
    console.log('Game.nextRound()...');

    this.round += 1;

    // apply attacks
    for (let attack of this.attacks) {
      if (canAttack(this, attack.ship, attack.card, attack.target)) {
        if (attack.card.config.type !== 'attack') {
          throw new Error('Card must be attack card!');
        }

        // TODO: implmenet relative orientation of ships

        let hullDamage = Math.round(
          attack.card.config.minHullDamage +
            Math.random() * (attack.card.config.maxHullDamage - attack.card.config.minHullDamage),
        );
        let sailsDamage = Math.round(
          attack.card.config.minSailsDamage +
            Math.random() * (attack.card.config.maxSailsDamage - attack.card.config.minSailsDamage),
        );
        let crewDamage = Math.round(
          attack.card.config.minCrewDamage +
            Math.random() * (attack.card.config.maxCrewDamage - attack.card.config.minCrewDamage),
        );

        attack.target.hull = Math.max(attack.target.hull - hullDamage, 0);
        attack.target.sails = Math.max(attack.target.sails - sailsDamage, 0);
        attack.target.crew = Math.max(attack.target.crew - crewDamage, 0);

        console.log(
          `"${attack.ship.name}" damages "${attack.target.name}": ${hullDamage}/${sailsDamage}/${crewDamage}.`,
        );
      }
    }

    this.attacks = [];

    // check if game needs to end
    if (Object.values(this.result).filter(Boolean).length === 1) {
      this.end();
    } else {
      // select next ship
      this.nextShip();
    }
  }

  nextShip() {
    if (this.status !== 'in-progress') {
      return;
    }

    console.log('Game.nextShip()...');

    const nextShipIndex = this.getNextShipIndex();

    console.log('nextShipIndex', nextShipIndex);

    if (nextShipIndex === null) {
      this.nextRound();
    } else {
      this.activeShipIndex = nextShipIndex;

      this.activeShip.startRound(this.round);
    }
  }

  playCard(card: Card, target?: Ship) {
    if (this.status !== 'in-progress') {
      return;
    }

    console.log('Game.playCard()...');
    if (!canPlayCard(this, this.activeShip, card, target)) {
      return;
    }

    let cardIndex = this.activeShip.hand.findIndex((handCard) => handCard === card);

    if (cardIndex < 0) {
      throw new Error('Invalid card played!');
    }

    this.activeShip.discardPile.push(this.activeShip.hand.splice(cardIndex, 1)[0]!);

    this.applyCard(card, target);
  }

  playEvadeSail() {
    if (!canPlayCard(this, this.activeShip, evadeMoveCard)) {
      return;
    }

    this.applyCard(evadeMoveCard);
  }

  playEvadeTurnStarboard() {
    if (!canPlayCard(this, this.activeShip, evadeTurnRightCard)) {
      return;
    }

    this.applyCard(evadeTurnRightCard);
  }

  playEvadeTurnPort() {
    if (!canPlayCard(this, this.activeShip, evadeTurnLeftCard)) {
      return;
    }

    this.applyCard(evadeTurnLeftCard);
  }

  applyCard(card: Card, target?: Ship) {
    switch (card.config.type) {
      case 'attack': {
        if (!target) {
          throw new Error('Target is undefined!');
        }

        let energyCost = getCardEnergyCost(this, this.activeShip, card);
        let evadeCost = getCardEvadeCost(this, this.activeShip, card);

        this.activeShip.energy -= energyCost;
        this.activeShip.evade -= evadeCost;

        this.attacks.push({
          card,
          ship: this.activeShip,
          target,
        });

        break;
      }

      case 'effect': {
        break;
      }

      case 'evade': {
        let energyCost = getCardEnergyCost(this, this.activeShip, card);
        let evadeCost = getCardEvadeCost(this, this.activeShip, card);

        this.activeShip.energy -= energyCost;
        this.activeShip.evade -= evadeCost;
        this.activeShip.evade += card.config.evade;

        break;
      }

      case 'move': {
        let energyCost = getCardEnergyCost(this, this.activeShip, card);
        let evadeCost = getCardEvadeCost(this, this.activeShip, card);

        this.activeShip.energy -= energyCost;
        this.activeShip.evade -= evadeCost;

        let [q, r] = rotateHex(card.config.rangeVector, this.activeShip.direction);

        this.activeShip.q += q;
        this.activeShip.r += r;

        break;
      }

      case 'turn': {
        let energyCost = getCardEnergyCost(this, this.activeShip, card);
        let evadeCost = getCardEvadeCost(this, this.activeShip, card);

        this.activeShip.energy -= energyCost;
        this.activeShip.evade -= evadeCost;
        this.activeShip.direction += card.config.angle;

        if (this.activeShip.direction >= 360) {
          this.activeShip.direction -= 360;
        }

        if (this.activeShip.direction < 0) {
          this.activeShip.direction += 360;
        }

        break;
      }

      // no default
    }
  }

  getNextShipIndex() {
    console.log('Game.getNextShipIndex()...');

    let result: number | null = null;

    for (const [shipIndex, ship] of this.ships.entries()) {
      if (
        ship.nextRound <= this.round &&
        !ship.isDestroyed &&
        (result === null || ship.initiative < this.ships[result]!.initiative)
      ) {
        result = shipIndex;
      }
    }

    return result;
  }

  getRemainingShips() {
    let ships = [...this.ships];

    ships = ships
      .filter((ship) => ship.nextRound <= this.round)
      .toSorted((shipA, shipB) => shipA.initiative - shipB.initiative);

    return ships;
  }
}
