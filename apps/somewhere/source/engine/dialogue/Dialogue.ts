import {failUnsupported} from '../utilities/failUnsupported.js';
import {type DialogueChoice, type DialogueNode} from './DialogueScript.js';

/**
 * The runtime shape of an authored script. TNodeId is a compile-time guarantee
 * (defineDialogueScript); at runtime node ids are plain strings, and `nodes`
 * is read through an optional-key record so any authored
 * Record<'a' | 'b', ...> is assignable via its implicit index signature.
 */
export type RunnableDialogueScript<TContext> = {
  start:
    | DialogueNode<TContext, string>
    | ((context: TContext) => DialogueNode<TContext, string> | string)
    | string;
  nodes?: Readonly<Partial<Record<string, DialogueNode<TContext, string>>>>;
};

export type DialoguePhase = 'choosing' | 'ended' | 'idle' | 'revealing';

export type DialogueOptions<TContext> = {
  script: RunnableDialogueScript<TContext>;
  context: TContext;
  /** Characters per second, > 0 (DEV-throw). */
  revealSpeed?: number;
};

const DEFAULT_REVEAL_SPEED = 40;

/**
 * The dialogue runner: a plain class, no pixi and no world dependency. The
 * owner ticks it on world time; setBreaks lets the owner window long pages
 * (the runner stays layout-blind, it only honors offsets).
 */
export class Dialogue<TContext = unknown> {
  readonly #script: RunnableDialogueScript<TContext>;
  readonly #context: TContext;
  readonly #revealSpeed: number;

  #phase: DialoguePhase = 'revealing';
  #node: DialogueNode<TContext, string> | null = null;
  #pages: string[] = [];
  #pageIndex = 0;
  #revealedCount = 0;
  #revealBudget = 0; // fractional characters carried between ticks
  #breaks: number[] = [];
  #visibleChoices: Array<DialogueChoice<TContext, string>> = [];
  #selectedIndex = 0;

  constructor({script, context, revealSpeed = DEFAULT_REVEAL_SPEED}: DialogueOptions<TContext>) {
    if (revealSpeed <= 0) {
      failUnsupported(
        `Dialogue revealSpeed must be > 0, got ${revealSpeed}! Falling back to ${DEFAULT_REVEAL_SPEED}.`,
      );
    }

    this.#script = script;
    this.#context = context;
    this.#revealSpeed = revealSpeed > 0 ? revealSpeed : DEFAULT_REVEAL_SPEED;

    let start = typeof script.start === 'function' ? script.start(context) : script.start;

    this.#enterNode(start);
  }

  get phase(): DialoguePhase {
    return this.#phase;
  }

  get node(): DialogueNode<TContext, string> | null {
    return this.#node;
  }

  get pageIndex(): number {
    return this.#pageIndex;
  }

  get pageText(): string {
    return this.#pages[this.#pageIndex] ?? '';
  }

  get revealedCount(): number {
    return this.#revealedCount;
  }

  get visibleChoices(): ReadonlyArray<DialogueChoice<TContext, string>> {
    return this.#visibleChoices;
  }

  get selectedIndex(): number {
    return this.#selectedIndex;
  }

  /** Advance the reveal on world time; a paused world simply stops calling this. */
  tick(deltaMS: number): void {
    if (this.#phase !== 'revealing') {
      return;
    }

    this.#revealBudget += (this.#revealSpeed * deltaMS) / 1000;

    let count = Math.floor(this.#revealBudget);

    if (count <= 0) {
      return;
    }

    this.#revealBudget -= count;

    let stop = this.#nextStop();

    this.#revealedCount = Math.min(this.#revealedCount + count, stop);

    if (this.#revealedCount >= stop) {
      this.#revealBudget = 0; // a pause discards the surplus; resume types from zero
      this.#pauseAtStop();
    }
  }

  /**
   * The one-button action: while revealing, completes the current stretch
   * instantly; while idle at a break, resumes; while idle at page end, shows
   * the next page, else follows next, else ends; while choosing, confirms the
   * selected choice.
   */
  advance(): void {
    if (this.#phase === 'revealing') {
      this.#revealedCount = this.#nextStop();
      this.#revealBudget = 0;
      this.#pauseAtStop();

      return;
    }

    if (this.#phase === 'idle') {
      if (this.#revealedCount < this.pageText.length) {
        this.#phase = 'revealing'; // resume from a break
      } else if (this.#pageIndex < this.#pages.length - 1) {
        this.#pageIndex += 1;
        this.#enterPage();
      } else if (this.#node?.next === undefined) {
        this.#end();
      } else {
        this.#enterNode(this.#node.next);
      }

      return;
    }

    if (this.#phase === 'choosing') {
      this.choose(this.#selectedIndex);
    }
  }

  /** Move the selection through visibleChoices, wrapping. */
  moveSelection(delta: number): void {
    let count = this.#visibleChoices.length;

    if (this.#phase !== 'choosing' || count === 0) {
      return;
    }

    this.#selectedIndex = (((this.#selectedIndex + delta) % count) + count) % count;
  }

  /** Set the selection directly (pointer hover); ignored unless choosing and valid. */
  select(index: number): void {
    if (!this.#isValidChoiceIndex(index)) {
      return;
    }

    this.#selectedIndex = index;
  }

  /** Confirm a choice directly (pointer tap); indices address visibleChoices. */
  choose(index: number): void {
    if (!this.#isValidChoiceIndex(index)) {
      return;
    }

    let choice = this.#visibleChoices[index];

    if (choice === undefined) {
      return;
    }

    if (choice.next === undefined) {
      this.#end();
    } else {
      this.#enterNode(choice.next);
    }
  }

  /**
   * Pause offsets inside the current page, ascending, in page-character
   * space. Offsets at or before revealedCount are ignored; node and page
   * changes clear them.
   */
  setBreaks(offsets: readonly number[]): void {
    if (this.#phase === 'ended') {
      return;
    }

    this.#breaks = offsets.filter((offset) => offset > this.#revealedCount);
  }

  #isValidChoiceIndex(index: number): boolean {
    return (
      this.#phase === 'choosing' &&
      Number.isInteger(index) &&
      index >= 0 &&
      index < this.#visibleChoices.length
    );
  }

  #nextStop(): number {
    for (let offset of this.#breaks) {
      if (offset > this.#revealedCount) {
        return Math.min(offset, this.pageText.length);
      }
    }

    return this.pageText.length;
  }

  #pauseAtStop(): void {
    let isPageEnd = this.#revealedCount >= this.pageText.length;
    let isLastPage = this.#pageIndex === this.#pages.length - 1;

    this.#phase = isPageEnd && isLastPage && this.#visibleChoices.length > 0 ? 'choosing' : 'idle';
  }

  #enterPage(): void {
    this.#phase = 'revealing';
    this.#revealedCount = 0;
    this.#revealBudget = 0;
    this.#breaks = [];
  }

  #enterNode(reference: DialogueNode<TContext, string> | string): void {
    let node = typeof reference === 'string' ? this.#script.nodes?.[reference] : reference;

    if (node === undefined) {
      failUnsupported(`Dialogue node "${String(reference)}" wasn't found in the script!`);
      this.#end();

      return;
    }

    this.#node = node;
    node.onEnter?.(this.#context);

    let text = typeof node.text === 'function' ? node.text(this.#context) : node.text;

    this.#pages = typeof text === 'string' ? [text] : [...text];

    if (this.#pages.length === 0) {
      failUnsupported('Dialogue node entered with an empty page list!');
      this.#end();

      return;
    }

    if (node.choices !== undefined && node.next !== undefined) {
      failUnsupported(
        'A dialogue node cannot carry both choices and next; its next could never be followed!',
      );
    }

    this.#visibleChoices = (node.choices ?? []).filter(
      (choice) => choice.isVisible?.(this.#context) ?? true,
    );

    if (
      (node.choices?.length ?? 0) > 0 &&
      this.#visibleChoices.length === 0 &&
      import.meta.env.DEV
    ) {
      // eslint-disable-next-line no-console -- authoring-hole warning; the node degrades to choice-less
      console.warn(
        'Every choice on a dialogue node filtered invisible; the node is treated as choice-less.',
      );
    }

    this.#selectedIndex = 0;
    this.#pageIndex = 0;
    this.#enterPage();
  }

  #end(): void {
    this.#phase = 'ended';
  }
}
