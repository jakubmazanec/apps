import type * as pixi from 'pixi.js';

import {type Scheduler} from '../scheduler/Scheduler.js';
import {type Focusable} from './Focusable.js';
import {type UiChild} from './UiChild.js';

export type ModalOptions = {
  children?: UiChild[] | undefined;
  // Content placement inside the full-screen root (e.g. {justifyContent:
  // 'center', alignItems: 'center'} for a centered dialog); passed through
  // verbatim — the primitive has no placement opinion for its content.
  layout?: pixi.ContainerOptions['layout'] | undefined;
  scrimAlpha?: number | undefined;
  // Applied via ui.focus() on open (programmatic — no ring shown). When
  // omitted nothing is focused, same as screens.
  initialFocus?: Focusable | undefined;
  // Fired when a user-facing close() completes (never on destroy()); the
  // owning screen clears its `openModal` reference here.
  onClose?: (() => void) | undefined;
  // Escape, routed through the focus scope this modal pushes. Defaults to
  // close(); the pause menu passes the same closure its Resume button uses, so
  // the world cannot be left frozen behind a closed overlay.
  onCancel?: (() => void) | undefined;
  // Both or neither — enables the open/close fade, driven by the owning
  // screen's Scheduler (which deliberately keeps running while the world is
  // paused).
} & (
  {fadeDuration: number; scheduler: Scheduler} | {fadeDuration?: undefined; scheduler?: undefined}
);
