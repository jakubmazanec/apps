import workletUrl from './audio.worklet.ts?worker&url';
import {type Core} from './boot.js';

export async function startAudio({
  module,
  memory,
  addresses: {stackTop},
}: Core): Promise<AudioContext> {
  let context = new AudioContext({latencyHint: 'interactive', sampleRate: 48000});

  await context.audioWorklet.addModule(workletUrl);
  new AudioWorkletNode(context, 'groovebox', {
    numberOfInputs: 0,
    outputChannelCount: [2],
    processorOptions: {module, memory, stackTop},
  }).connect(context.destination);

  return context;
}
