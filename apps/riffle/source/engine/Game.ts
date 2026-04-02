import _ from 'lodash';
import {makeAutoObservable} from 'mobx';

import {Card} from './Card.js';
import {
  DISCARDS_PER_ROUND,
  HAND_SIZE,
  HANDS_PER_ROUND,
  MAX_ROUNDS,
  POINTS_NEEDED,
} from './constants.js';
// import {type Effect} from './Effect.js';
import words from './words.json';

export type GameStatus = 'finished' | 'in-progress' | 'not-started';
export type GameResult = 'lost' | 'won';

// export type GameOptions = {};

export class Game {
  drawPile: Card[] = [];
  discardPile: Card[] = [];
  cards: Card[] = [];

  status: GameStatus = 'not-started';
  result?: GameResult;
  handsRemaining = 0;
  discardsRemaining = 0;
  round = 0;
  score = 0;
  coins = 0;

  handSize = HAND_SIZE;
  discardsPerRound = DISCARDS_PER_ROUND;
  handsPerRound = HANDS_PER_ROUND;

  constructor(/*{}: GameOptions = {}*/) {
    makeAutoObservable(this);

    // TODO: hard-coded values, fix this
    this.drawPile = Card.fromString(
      'etaoinsrhdlucmfywgpbvkxqjz, etaoinsrhdlucmfywgpbvkxqjz, etaoiny, etaoiny',
    );

    // TODO: remove
    if (typeof window !== 'undefined') {
      // @ts-expect-error -- needed
      window.game = this;
    }
  }

  get pointsNeeded() {
    let pointsNeeded = POINTS_NEEDED[this.round];

    if (pointsNeeded === undefined) {
      throw new Error('Unexpected undefined!');
    }

    return pointsNeeded;
  }

  start() {
    console.log('Game.start()...');

    if (this.status === 'in-progress') {
      throw new Error('Cannot start game that is in progress!');
    }

    this.status = 'in-progress';
    this.round = 0;
    this.score = 0;
    this.coins = 0;

    this.startRound();
  }

  reset() {
    this.status = 'not-started';
  }

  end() {
    this.status = 'finished';

    if (this.score >= this.pointsNeeded) {
      this.result = 'won';
    } else {
      this.result = 'lost';
    }
  }

  startRound() {
    console.log('Game.startRound()...');

    this.round += 1;
    this.score = 0;
    this.handsRemaining = this.handsPerRound;
    this.discardsRemaining = this.discardsPerRound;

    // shuffle draw pile
    this.drawPile = _.shuffle(this.drawPile);

    this.startHand();
  }

  endRound() {
    console.log('Game.endRound()...', this.pointsNeeded);

    if (this.score < this.pointsNeeded || this.round >= MAX_ROUNDS) {
      this.end();
    } else {
      this.startRound();
    }
  }

  startHand() {
    console.log('Game.startHand()...');

    this.handsRemaining -= 1;

    this.drawCards();
  }

  endHand() {
    console.log('Game.endHand()...');

    if (this.handsRemaining === 0 || this.score >= this.pointsNeeded) {
      this.endRound();
    } else {
      this.startHand();
    }
  }

  drawCards(count?: number) {
    if (count === undefined && this.handSize > this.cards.length) {
      this.cards.push(
        ..._.pullAt(this.drawPile, _.range(this.handSize - this.cards.length)).filter((card) =>
          Boolean(card),
        ),
      );
    } else if (count !== undefined) {
      this.cards.push(..._.pullAt(this.drawPile, _.range(count)).filter((card) => Boolean(card)));
    }
  }

  // canPlayCards() {
  //   return this.handsRemaining > 0;
  // }

  playCards(cards: Card[]) {
    if (this.status !== 'in-progress') {
      throw new Error('Game must be in progress!');
    }

    // if (!this.canPlayCards()) {
    //   throw new Error('No hands remaining!');
    // }

    if (cards.some((card) => !this.cards.includes(card))) {
      throw new Error('Cards must be all in hand!');
    }

    console.log('Game.playCards()...');

    let word = cards
      .map((card) => card.config.symbol)
      .join('')
      .toLowerCase();

    let points = 0;
    let amp = 0;

    if (words.includes(word)) {
      points = cards.map((card) => card.config.value).reduce((a, b) => a + b, 0);
      amp = cards.length;
    }

    let score = points * amp;

    console.log('Score:', points, amp, score);

    this.score += score;

    for (let card of cards) {
      let index = this.cards.indexOf(card);

      if (index > -1) {
        this.cards.splice(index, 1);
      }
    }

    this.endHand();
  }

  canDiscardCards() {
    return this.discardsRemaining > 0;
  }

  discardCards(cards: Card[]) {
    if (this.status !== 'in-progress') {
      throw new Error('Game must be in progress!');
    }

    if (!this.canDiscardCards()) {
      throw new Error('No discards remaining!');
    }

    if (cards.some((card) => !this.cards.includes(card))) {
      throw new Error('Cards must be all in hand!');
    }

    console.log('Game.discardCards()...');

    for (let card of cards) {
      let index = this.cards.indexOf(card);

      if (index > -1) {
        this.cards.splice(index, 1);
      }
    }

    this.drawCards();

    this.discardsRemaining -= 1;
  }
}
