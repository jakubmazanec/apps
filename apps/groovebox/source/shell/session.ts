// eslint-disable-next-line @typescript-eslint/triple-slash-reference -- `toBase64` is newer than the project's lib, which Carson writes
/// <reference lib="esnext.typedarrays" />
import {encoderName, type ShellInput, type StampedInput} from './protocol.js';
import {type StorageReply} from './storage.js';

/* eslint-disable default-case, @typescript-eslint/consistent-return -- the switch covers every kind, which TypeScript checks */
// The words of a scene line after its sample. They are the kind and its values, as the drift
// harness's `scene.rs` parses them
function sceneWords(input: ShellInput): string {
  switch (input.kind) {
    case 'channel-pressure': {
      return `channel-pressure ${input.pressure}`;
    }

    case 'dropped': {
      return `dropped ${input.files}`;
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

    case 'output-delay': {
      return `output-delay ${input.samples}`;
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

// The path and the source of a `file` or a `drop` line, as `scene.rs` parses them: the path spells
// a space as `%20` and a percent sign as `%25`, and a bare `base64` is an empty file
function fileWords(path: string, bytes: Uint8Array) {
  return `${path.replaceAll('%', '%25').replaceAll(' ', '%20')} base64 ${bytes.toBase64()}`.trimEnd();
}

export class SessionLog {
  // The files the storage held at the start, which the scene holds before everything else
  readonly #files: string[] = [];
  readonly #lines: string[] = [];

  file(path: string, bytes: Uint8Array) {
    this.#files.push(`file ${fileWords(path, bytes)}`);
  }

  drop(sample: bigint, path: string, bytes: Uint8Array) {
    this.#lines.push(`drop ${sample} ${fileWords(path, bytes)}`);
  }

  reply(requestNumber: number, sample: bigint, {status, value}: StorageReply) {
    this.#lines.push(`reply ${requestNumber} ${sample} ${status} ${value}`);
  }

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
      'groovebox-scene 1',
      ...this.#files,
      ...this.#lines,
      `expect-audio ${position} ${BigInt.asUintN(64, fingerprint).toString(16).padStart(16, '0')}`,
      `end ${position}`,
    ].join('\n')}\n`;
  }
}
