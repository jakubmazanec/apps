import {type DialogueChoice, type DialogueNode} from 'tellurion';

import {formatCosts} from './formatCosts.js';
import {addDrinks, getDrunkenness, type Night, roll} from './night.js';

export type Choice<TNodeId extends string> = {
  text: string;
  next?: Reference<TNodeId>;

  /** Kč taken on the press. The choice is greyed out while the night has less. */
  price?: number;

  /** Minutes the clock moves on the press. */
  minutes?: number;

  /** Drinks added on the press, after the minutes. */
  drinks?: number;

  /**
   * The chance of success, above 0 and below 1. The press rolls, and `night.roll` holds the
   * result.
   */
  odds?: ((night: Night) => number) | number;

  /**
   * Offered only while the level is within these bounds, inclusive; read when the node is
   * entered.
   */
  drunkenness?: {min?: number; max?: number};

  isVisible?: (night: Night) => boolean;
  onChoose?: (night: Night) => void;
};

/** Tellurion's node, with Foam's choices and Foam's references. */
export type Node<TNodeId extends string> = Omit<
  DialogueNode<Night, TNodeId>,
  'choices' | 'next'
> & {
  choices?: Array<Choice<TNodeId>>;
  next?: Reference<TNodeId>;
};

/** Where a script goes: a node, an id or a function of the night that returns either. */
export type Reference<TNodeId extends string> =
  Node<TNodeId> | TNodeId | ((night: Night) => Node<TNodeId> | TNodeId);

export type Script<TNodeId extends string> = {
  start: Reference<TNodeId>;
  nodes?: Record<TNodeId, Node<TNodeId>>;
};

// Each mapped node is kept under the author's object and under itself, so a node reached twice,
// or a mapped node handed back by a function, is one node to the runner and the window.
const mappedNodes = new WeakMap<object, Node<string>>();

function mapReference(reference: Node<string> | string): Node<string> | string;
function mapReference(reference: Reference<string>): Reference<string>;
function mapReference(reference: Reference<string>): Reference<string> {
  if (typeof reference === 'function') {
    return (night) => mapReference(reference(night));
  }

  return typeof reference === 'string' ? reference : mapNode(reference);
}

function mapNode(node: Node<string>): Node<string> {
  let known = mappedNodes.get(node);

  if (known !== undefined) {
    return known;
  }

  let mapped: Node<string> = {...node};

  mappedNodes.set(node, mapped);
  mappedNodes.set(mapped, mapped);

  if (node.choices !== undefined) {
    mapped.choices = node.choices.map(mapChoice);
  }

  if (node.next !== undefined) {
    mapped.next = mapReference(node.next);
  }

  return mapped;
}

function mapChoice(choice: Choice<string>): Choice<string> {
  let {drinks, drunkenness, isVisible, minutes, next, odds, onChoose, price} = choice;
  let mapped: Choice<string> = {...choice};

  if (next !== undefined) {
    mapped.next = mapReference(next);
  }

  if (drunkenness !== undefined || isVisible !== undefined) {
    mapped.isVisible = (night) => {
      let level = getDrunkenness(night);

      return (
        (drunkenness?.min === undefined || level >= drunkenness.min) &&
        (drunkenness?.max === undefined || level <= drunkenness.max) &&
        (isVisible?.(night) ?? true)
      );
    };
  }

  if (
    odds !== undefined ||
    price !== undefined ||
    minutes !== undefined ||
    drinks !== undefined ||
    onChoose !== undefined
  ) {
    // The roll comes first, so a choice's own drinks never move its odds.
    mapped.onChoose = (night) => {
      if (odds !== undefined) {
        roll(night, typeof odds === 'function' ? odds(night) : odds);
      }

      if (price !== undefined) {
        night.money -= price;
      }

      if (minutes !== undefined) {
        night.minutes += minutes;
      }

      if (drinks !== undefined) {
        addDrinks(night, drinks);
      }

      onChoose?.(night);
    };
  }

  return mapped;
}

export function defineScript<TNodeId extends string>(script: {
  start: Reference<NoInfer<TNodeId>>;
  nodes?: Record<TNodeId, Node<NoInfer<TNodeId>>>;
}): Script<TNodeId> {
  let {nodes, start} = script;
  let mapped: Script<string> = {start: mapReference(start)};

  if (nodes !== undefined) {
    mapped.nodes = Object.fromEntries(
      Object.entries<Node<string>>(nodes).map(([id, node]) => [id, mapNode(node)]),
    );
  }

  // The mapping reads ids as strings; the signature has already checked them against the nodes.
  return mapped as Script<TNodeId>;
}

/** A runner's choice is a Foam choice: every script Foam runs went through defineScript. */
export function asChoice(choice: DialogueChoice<Night, string>): Choice<string> {
  return choice;
}

/** The choice's text and the numbers it has, two spaces apart: "Order a beer  10 min  45 Kč". */
export function formatChoice(choice: Choice<string>, night: Night): string {
  let {minutes, odds, price, text} = choice;
  let costs = formatCosts({minutes, price, odds: typeof odds === 'function' ? odds(night) : odds});

  return costs === '' ? text : `${text}  ${costs}`;
}
