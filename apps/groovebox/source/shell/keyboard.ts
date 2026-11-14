import {type ButtonName, type ShellInput} from './protocol.js';

// The keys of pads 0 to 11, from C to B
const PAD_KEYS = [
  'KeyZ',
  'KeyS',
  'KeyX',
  'KeyD',
  'KeyC',
  'KeyV',
  'KeyG',
  'KeyB',
  'KeyH',
  'KeyN',
  'KeyJ',
  'KeyM',
];

const BUTTON_KEYS: ReadonlyMap<string, ButtonName> = new Map([
  ['ArrowDown', 'down'],
  ['ArrowLeft', 'left'],
  ['ArrowRight', 'right'],
  ['ArrowUp', 'up'],
  ['Backslash', 'pads-keys'],
  ['BracketLeft', 't3'],
  ['BracketRight', 't4'],
  ['Comma', 'rec'],
  ['Digit1', 'step-1'],
  ['Digit2', 'step-2'],
  ['Digit3', 'step-3'],
  ['Digit4', 'step-4'],
  ['Digit5', 'step-5'],
  ['Digit6', 'step-6'],
  ['Digit7', 'step-7'],
  ['Digit8', 'step-8'],
  ['Enter', 'ok'],
  ['Equal', 'plus'],
  ['Escape', 'cancel'],
  ['KeyE', 'step-11'],
  ['KeyI', 'step-16'],
  ['KeyK', 'roll'],
  ['KeyL', 'menu'],
  ['KeyO', 't1'],
  ['KeyP', 't2'],
  ['KeyQ', 'step-9'],
  ['KeyR', 'step-12'],
  ['KeyT', 'step-13'],
  ['KeyU', 'step-15'],
  ['KeyW', 'step-10'],
  ['KeyY', 'step-14'],
  ['Minus', 'minus'],
  ['NumpadAdd', 'plus'],
  ['NumpadSubtract', 'minus'],
  ['Period', 'stop'],
  ['Quote', 'copy'],
  ['Semicolon', 'page'],
  ['ShiftLeft', 'shift'],
  ['ShiftRight', 'shift'],
  ['Slash', 'tempo'],
  ['Space', 'play'],
]);

// Keys are mapped by position (`KeyboardEvent.code`). A repeat gives null, and so does a key down
// with Ctrl, Alt or Meta held. A key up lets go whatever modifiers are held, so a key that was
// pressed before Ctrl still comes up. Shift is the SHIFT button, not a filter
export function keyToInput(
  event: Pick<KeyboardEvent, 'altKey' | 'code' | 'ctrlKey' | 'metaKey' | 'repeat' | 'type'>,
): ShellInput | null {
  let down = event.type === 'keydown';

  if (
    event.repeat ||
    (!down && event.type !== 'keyup') ||
    (down && (event.ctrlKey || event.altKey || event.metaKey))
  ) {
    return null;
  }

  let pad = PAD_KEYS.indexOf(event.code);

  if (pad !== -1) {
    return down ? {kind: 'pad-hit', pad, velocity: 127} : {kind: 'pad-release', pad};
  }

  let button = BUTTON_KEYS.get(event.code);

  if (!button) {
    return null;
  }

  return {kind: down ? 'press' : 'release', button};
}
