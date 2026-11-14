/* eslint-disable no-bitwise -- the status byte holds the type in its high nibble and the channel in its low one */
import {type ShellInput} from './protocol.js';

type Knob = {encoder: number; kind: 'absolute' | 'relative'};

// The controller numbers that turn an encoder, 4 being the volume. This is the one place that says
// whether a knob is absolute, the default, or relative
export const KNOBS: ReadonlyMap<number, Knob> = new Map<number, Knob>([
  [20, {encoder: 0, kind: 'absolute'}],
  [21, {encoder: 1, kind: 'absolute'}],
  [22, {encoder: 2, kind: 'absolute'}],
  [23, {encoder: 3, kind: 'absolute'}],
  [7, {encoder: 4, kind: 'absolute'}],
]);

// The high nibbles of the status bytes that are used. The low nibble is the channel: every channel
// is accepted
const NOTE_OFF = 0x80;
const NOTE_ON = 0x90;
const POLY_PRESSURE = 0xa0;
const CONTROL_CHANGE = 0xb0;
const CHANNEL_PRESSURE = 0xd0;

// A relative knob sends 1–63 for up and 65–127 for down by 128 − value; 0 and 64 do nothing
function relativeClicks(value: number) {
  if (value === 64) {
    return 0;
  }

  return value < 64 ? value : value - 128;
}

// Returns a function that turns the bytes of one MIDI message into inputs. It remembers the last
// value of each absolute knob, per channel and number, so each mapper makes its own. Every
// message that is not mapped gives an empty list
export function createMidiMapper(knobs: ReadonlyMap<number, Knob> = KNOBS) {
  let lastValues = new Map<number, number>();

  return (data: Uint8Array): ShellInput[] => {
    let [status = 0, first = 0, second = 0] = data;
    let type = status & 0xf0;

    if (data.length < (type === CHANNEL_PRESSURE ? 2 : 3)) {
      return [];
    }

    switch (type) {
      case CHANNEL_PRESSURE: {
        return [{kind: 'channel-pressure', pressure: first}];
      }

      case CONTROL_CHANGE: {
        let knob = knobs.get(first);

        if (!knob) {
          return [];
        }

        let clicks: number;

        if (knob.kind === 'relative') {
          clicks = relativeClicks(second);
        } else {
          let key = (status & 0x0f) * 128 + first;
          let last = lastValues.get(key);

          lastValues.set(key, second);
          clicks = last === undefined ? 0 : second - last;
        }

        return clicks === 0 ? [] : [{kind: 'turn', encoder: knob.encoder, clicks}];
      }

      case NOTE_OFF: {
        return [{kind: 'note-off', note: first}];
      }

      case NOTE_ON: {
        // A note on with velocity 0 is a note off
        return second === 0 ?
            [{kind: 'note-off', note: first}]
          : [{kind: 'note-on', note: first, velocity: second}];
      }

      case POLY_PRESSURE: {
        return [{kind: 'note-pressure', note: first, pressure: second}];
      }

      default: {
        return [];
      }
    }
  };
}
