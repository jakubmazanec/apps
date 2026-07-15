import * as pixi from 'pixi.js';

// The single AudioContext used to decode compressed audio into AudioBuffers.
// Set once at bootstrap (game/audio.ts) before the first audio bundle loads;
// decoding needs a real context and the mixer owns the only one. AudioBuffers
// are context-portable per spec, so a dedicated decode context is possible if
// this parser is ever wanted fully standalone.
let decodeContext: AudioContext | null = null;

export function setAudioDecodeContext(context: AudioContext): void {
  decodeContext = context;
}

const AUDIO_EXTENSION = /\.(?:ogg|wav)$/i;

// A LoaderParser that owns the whole fetch→decode step for audio URLs; unlike
// the Tiled parsers (which transform JSON already loaded by the default
// loader) audio has no default loader, so `load` does everything. The decoded
// AudioBuffer lands in the normal Assets cache under its asset name.
const loader: pixi.LoaderParser<AudioBuffer> = {
  id: 'audioBufferAsset',
  extension: {
    type: pixi.ExtensionType.LoadParser,
    priority: pixi.LoaderParserPriority.High,
  },

  test: (url: string) => AUDIO_EXTENSION.test(url),

  load: async <T>(url: string): Promise<T> => {
    if (decodeContext === null) {
      throw new Error(
        'Audio decode context is not set — call setAudioDecodeContext() before loading audio assets!',
      );
    }

    let response = await fetch(url);
    let arrayBuffer = await response.arrayBuffer();
    let audioBuffer = await decodeContext.decodeAudioData(arrayBuffer);

    return audioBuffer as T;
  },
};

export const audioBufferAsset = {
  extension: pixi.ExtensionType.Asset,
  loader,
};
