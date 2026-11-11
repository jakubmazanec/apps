import {type ShellInput} from './protocol.js';

export function keyToInput(
  event: Pick<KeyboardEvent, 'code' | 'repeat' | 'type'>,
): ShellInput | null {
  if (event.code !== 'KeyZ' || event.repeat) {
    return null;
  }

  if (event.type === 'keydown') {
    return {kind: 'pad-hit', pad: 0, velocity: 127};
  }

  return event.type === 'keyup' ? {kind: 'pad-release', pad: 0} : null;
}
