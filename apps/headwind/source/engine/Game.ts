import {makeAutoObservable} from 'mobx';

import {type Card} from './Card.js';
import {Map} from './Map.js';
import {Ship} from './Ship.js';
import {canPlayCard} from './canPlayCard.js';
import {getCardCost} from './getCardCost.js';

export type GameOptions = {
  map?: Map;
};

export class Game {
  map: Map;
  ships: Ship[];

  round = 0;

  activeShipIndex = 0;

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

    this.ships[0]!.q = 6;
    this.ships[0]!.r = 4;
    this.ships[1]!.q = 8;
    this.ships[1]!.r = 2;
  }

  start() {
    for (let ship of this.ships) {
      ship.reset();
    }

    this.round = 0;

    this.nextRound();
  }

  nextRound() {
    this.round += 1;

    // TODO: set active ship based on iniciative
    this.activeShipIndex = 0;

    this.activeShip.startRound();
  }

  nextShip() {}

  playCard(card: Card, target?: Ship) {
    console.log('Game.playCard()...');
    if (!canPlayCard(this, this.activeShip, card, target)) {
      return;
    }

    let cardIndex = this.activeShip.hand.findIndex((handCard) => handCard === card);

    if (cardIndex < 0) {
      throw new Error('Invalid card played!');
    }

    this.activeShip.discardPile.push(this.activeShip.hand.splice(cardIndex, 1)[0]!);

    if (card.config.type === 'move') {
      // TODO
      return;
    } else if (card.config.type === 'turn') {
      let cost = getCardCost(this, this.activeShip, card);

      this.activeShip.energy -= cost;
      this.activeShip.direction += card.config.angle;

      if (this.activeShip.direction >= 360) {
        this.activeShip.direction -= 360;
      }

      if (this.activeShip.direction < 0) {
        this.activeShip.direction += 360;
      }

      return;
    } else if (card.config.type === 'attack') {
      // TODO
      return;
    }

    // TODO
  }
}
