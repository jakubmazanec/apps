import {Container, Fader, Panel, type Scheduler, Text, wrapText} from 'tellurion';

import {game} from '../core/game.js';
import {LINE_HEIGHT, MARGIN, WINDOW_GAP} from '../core/getSceneArea.js';
import {measureText} from '../core/measureText.js';
import {UI_FADE_DURATION} from '../core/theme.js';
import {createWindowTitle, WINDOW_PADDING} from './windowTitle.js';

export type ToastOptions = {
  scheduler: Scheduler;
  title: string;

  /** The width the title wraps at: the story window's text width. */
  textWidth: number;

  /** Called once the toast has faded out. */
  onDone: () => void;
};

// How long the toast stays between its fades, in ms.
const TOAST_DURATION = 3000;
const TOAST_TITLE = 'A story';

/**
 * The notice that a story was achieved, at the bottom of the screen above every window: "A story"
 * over the title. It takes no tap: a tap on it reaches what is under it.
 */
export class Toast extends Container {
  /** Cancels the wait between the fades. */
  #cancelWait: (() => void) | null = null;

  readonly #fader: Fader;
  readonly #onDone: () => void;
  readonly #panel: Panel;
  readonly #scheduler: Scheduler;
  readonly #title: string;

  constructor({scheduler, title, textWidth, onDone}: ToastOptions) {
    let panel = new Panel({
      theme: game.theme,
      layout: {...WINDOW_PADDING, flexDirection: 'column', gap: WINDOW_GAP},
    });

    // A strip as wide as the screen, one margin above its bottom edge, so the
    // layout centres the panel and a resize needs no centring.
    super({
      children: [panel],
      layout: {
        position: 'absolute',
        left: 0,
        bottom: MARGIN,
        width: '100%',
        justifyContent: 'center',
      },
    });
    this.#panel = panel;
    this.#scheduler = scheduler;
    this.#title = title;
    this.#onDone = onDone;
    this.#fader = new Fader({duration: UI_FADE_DURATION, scheduler, view: this.view});
    // Pixi hit-tests neither the strip nor the panel in it.
    this.view.eventMode = 'none';
    this.#fill(textWidth);
  }

  /** Cancels the fade and the wait, then destroys the view. */
  override destroy(): void {
    this.#fader.cancel();
    this.#cancelWait?.();
    super.destroy();
  }

  /** Lays the toast out again at a new width. */
  resize(textWidth: number): void {
    this.#fill(textWidth);
  }

  /** Fades in, waits, fades out, then calls `onDone`. */
  show(): void {
    this.view.alpha = 0;
    this.#fader.to(1, () => {
      this.#cancelWait = this.#scheduler.after(TOAST_DURATION, () => {
        this.#fader.to(0, this.#onDone);
      });
    });
  }

  // Replaces the panel's content: the title line and, under it, the title
  // wrapped at the width, both as wide as the longest line.
  #fill(textWidth: number): void {
    let children = [...this.#panel.children];

    this.#panel.removeChild(...children);

    for (let child of children) {
      child.destroy?.();
    }

    let wrapped = wrapText(this.#title, textWidth, measureText);
    let lines = wrapped.split('\n');
    let width = Math.max(measureText(TOAST_TITLE), ...lines.map((line) => measureText(line)));

    this.#panel.addChild(
      createWindowTitle(TOAST_TITLE, width),
      new Text({
        text: wrapped,
        theme: game.theme,
        role: 'body',
        layout: {width, height: lines.length * LINE_HEIGHT},
      }),
    );
  }
}
