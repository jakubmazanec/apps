import * as pixi from 'pixi.js';

import {type EventEmit} from '../scheduler/EventEmit.js';
import {type Spriteset} from './Spriteset.js';

export type SpriteOptions<N extends readonly string[] = string[]> = {
  spriteset: Spriteset;
  spriteNames: N;
};

export type SpriteShowOptions = {emit?: EventEmit | undefined};

export class Sprite<const N extends readonly string[] = string[]> {
  /** TBD */
  currentSpriteName: N[number];

  /** TBD */
  readonly sprites: Record<N[number], pixi.AnimatedSprite>;

  /** TBD */
  view: pixi.AnimatedSprite;

  /** TBD */
  #hasWarnedLoopEmit = false;

  /** TBD */
  #hasWarnedUnknownName = false;

  /** TBD */
  #isOneShotPlaying = false;

  /** TBD */
  #pendingEmit: EventEmit | null = null;

  constructor({spriteset, spriteNames}: SpriteOptions<N>) {
    let sprites: Record<string, pixi.AnimatedSprite> = {};

    for (let spriteName of spriteNames) {
      let animation = spriteset.animation(spriteName);
      // Off Pixi's shared clock: graphicsSystem advances the current sprite via
      // view.update(ticker) on the world's update path, so a paused world
      // freezes it by construction (game UI design §3).
      let sprite = new pixi.AnimatedSprite(animation.textures, false);

      sprite.visible = false;
      sprite.animationSpeed = animation.speed;
      sprite.loop = animation.loop;
      sprites[spriteName] = sprite;
    }

    this.sprites = sprites;
    this.view = this.sprites[spriteNames[0] as N[number]];
    this.currentSpriteName = spriteNames[0] as N[number];

    // Visible from birth: a single-animation sprite that never gets a
    // *different* show() call would otherwise never appear.
    this.view.visible = true;

    // AnimatedSprite.update() no-ops unless playing, and show() early-returns
    // for a loop whose name already matches currentSpriteName — so a sprite
    // whose first shown name equals its first constructed name would never
    // start. One-shots must NOT auto-fire here: no emit can be attached yet
    // at construction time, so firing one now would silently drop it.
    if (this.view.loop) {
      this.view.play();
    }
  }

  /** TBD */
  show(spriteName: N[number], options?: SpriteShowOptions): this {
    // Widened: a caller with a plain-string name type can pass a name the
    // sprite was not constructed with; prod handles it as a warn-once no-op.
    // Read through a string-indexed view so the lookup's type honestly
    // reflects that — `Record<N[number], …>` alone looks total to the
    // compiler even though N[number] can be widened to plain `string` at
    // the call boundary.
    let sprites: Record<string, pixi.AnimatedSprite | undefined> = this.sprites;
    let target = sprites[spriteName];

    if (!target) {
      let message = `Sprite doesn't contain animated sprite "${String(spriteName)}"!`;

      if (import.meta.env.DEV) {
        throw new Error(message);
      }

      if (!this.#hasWarnedUnknownName) {
        this.#hasWarnedUnknownName = true;
        // eslint-disable-next-line no-console -- loud failure in production builds (DEV throws)
        console.warn(message);
      }

      return this;
    }

    let isOneShot = !target.loop;

    if (options?.emit && !isOneShot) {
      let message = `Animated sprite "${String(spriteName)}" loops and never completes, so its emit would never fire!`;

      if (import.meta.env.DEV) {
        throw new Error(message);
      }

      if (!this.#hasWarnedLoopEmit) {
        this.#hasWarnedLoopEmit = true;
        // eslint-disable-next-line no-console -- loud failure in production builds (DEV throws)
        console.warn(message);
      }
    }

    // Precedence: loops are ambient state pushed every frame by generic
    // systems; one-shots are deliberate acts by gameplay code. Deliberate
    // beats ambient; ambient never interrupts deliberate. This is what lets
    // graphicsSystem keep calling show('walking-…') every frame — the calls
    // bounce off during a one-shot, and land again the frame after it
    // completes, restoring idle/walk with no coordination.
    if (this.#isOneShotPlaying && !isOneShot) {
      return this;
    }

    if (!isOneShot && spriteName === this.currentSpriteName) {
      return this;
    }

    // Replacing a playing one-shot discards its pending emit, never fires it —
    // the same posture as removing an entity mid-timer, which drops the
    // timer's emit. Gameplay that awaits a completion event is the code that
    // starts one-shots, so it controls interruption.
    this.#detachOnComplete(this.view);
    this.#pendingEmit = null;
    this.#isOneShotPlaying = false;

    this.view.stop();
    this.view.visible = false;
    this.view = target;
    this.currentSpriteName = spriteName;

    if (isOneShot) {
      this.#isOneShotPlaying = true;
      this.#pendingEmit = options?.emit ?? null;

      // Fires inside view.update(ticker), i.e. on the world's update path;
      // EventChannel.push is mid-update-safe and the event surfaces next
      // frame — identical ordering to a timer emit.
      this.view.onComplete = () => {
        let emit = this.#pendingEmit;

        this.#detachOnComplete(this.view);
        this.#isOneShotPlaying = false;
        this.#pendingEmit = null;
        emit?.channel.push(emit.event);
      };

      this.view.gotoAndPlay(0);
    } else {
      this.view.play();
    }

    this.view.visible = true;

    return this;
  }

  // exactOptionalPropertyTypes forbids assigning `undefined` to pixi's
  // optional onComplete, so the detach goes through a widened local alias:
  // its onComplete type includes `undefined`, so the assignment satisfies
  // exactOptionalPropertyTypes, whereas pixi's own optional declaration on
  // the parameter's type does not.
  /** TBD */
  #detachOnComplete(sprite: pixi.AnimatedSprite): void {
    let widened: {onComplete?: (() => void) | undefined} = sprite;

    widened.onComplete = undefined;
  }
}
