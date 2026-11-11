import {type StampedInput} from './protocol.js';

export class SessionLog {
  readonly #lines: string[] = ['groovebox-scene 1'];

  input({sample, input}: StampedInput) {
    this.#lines.push(
      input.kind === 'pad-hit' ?
        `input ${sample} pad-hit ${input.pad} ${input.velocity}`
      : `input ${sample} pad-release ${input.pad}`,
    );
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
      `expect-audio ${position} ${fingerprint.toString(16).padStart(16, '0')}`,
      `end ${position}`,
    ].join('\n')}\n`;
  }
}
