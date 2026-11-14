import {encoderName, type ShellInput, type StampedInput} from './protocol.js';

/* eslint-disable default-case, @typescript-eslint/consistent-return -- the switch covers every kind, which TypeScript checks */
// The words of a scene line after its sample. They are the kind and its values, as the drift
// harness's `scene.rs` parses them
function sceneWords(input: ShellInput): string {
  switch (input.kind) {
    case 'channel-pressure': {
      return `channel-pressure ${input.pressure}`;
    }

    case 'note-off': {
      return `note-off ${input.note}`;
    }

    case 'note-on': {
      return `note-on ${input.note} ${input.velocity}`;
    }

    case 'note-pressure': {
      return `note-pressure ${input.note} ${input.pressure}`;
    }

    case 'pad-hit': {
      return `pad-hit ${input.pad} ${input.velocity}`;
    }

    case 'pad-pressure': {
      return `pad-pressure ${input.pad} ${input.pressure}`;
    }

    case 'pad-release': {
      return `pad-release ${input.pad}`;
    }

    case 'press': {
      return `press ${input.button}`;
    }

    case 'release': {
      return `release ${input.button}`;
    }

    case 'turn': {
      return `turn ${encoderName(input.encoder)} ${input.clicks}`;
    }
  }
}
/* eslint-enable default-case, @typescript-eslint/consistent-return */

export class SessionLog {
  readonly #lines: string[] = ['groovebox-scene 1'];

  input({sample, input}: StampedInput) {
    this.#lines.push(`input ${sample} ${sceneWords(input)}`);
  }

  step(sample: bigint) {
    this.#lines.push(`step ${sample}`);
  }

  applied(messageNumber: number, sample: bigint) {
    this.#lines.push(`applied ${messageNumber} ${sample}`);
  }

  finish(position: bigint, fingerprint: bigint) {
    return `${[
      ...this.#lines,
      `expect-audio ${position} ${BigInt.asUintN(64, fingerprint).toString(16).padStart(16, '0')}`,
      `end ${position}`,
    ].join('\n')}\n`;
  }
}
