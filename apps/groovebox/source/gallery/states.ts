// The screens the gallery shows: `frame` is a picture under `packages/groovebox-core/scenes/` (the
// core's own drawing, blessed by the drift scenes) and `approved` a file in Look's picture folder
// (`docs/superpowers/specs/2026-11-07-groovebox-look/`), where Look drew the same screen
export const STATES: ReadonlyArray<{title: string; frame: string; approved?: string}> = [
  {title: 'MENU held over STEP', frame: 'menu-and-pages/frame-6400.png', approved: 'menu-held.png'},
  {
    title: 'PAGE held on SETTINGS',
    frame: 'menu-and-pages/frame-19200.png',
    approved: 'page-held.png',
  },
  {title: 'SETTINGS with Velocity on', frame: 'menu-and-pages/frame-32000.png'},
  {
    title: 'SOUND Pad page with an empty pad 1',
    frame: 'new-synth/frame-9600.png',
    approved: 'sound-pad.png',
  },
  {
    title: 'Sound picker on Empty',
    frame: 'new-synth/frame-16000.png',
    approved: 'picker-sound.png',
  },
  {
    title: 'SOUND Pad page with Syn 1 on pad 1',
    frame: 'new-synth/frame-25600.png',
    approved: 'sound-pad.png',
  },
  {
    title: 'SOUND Pad page on track 2',
    frame: 'new-synth/frame-70400.png',
    approved: 'sound-pad.png',
  },
  {
    title: 'STEP with the strip of Syn 2',
    frame: 'new-synth/frame-83200.png',
    approved: 'step-stopped.png',
  },
  {
    title: 'Sound picker on Syn 1',
    frame: 'picker-while-playing/frame-22400.png',
    approved: 'picker-sound.png',
  },
  {
    title: 'Sound picker on Syn 1 with MENU held and T2 and PADS/KEYS pressed',
    frame: 'picker-while-playing/frame-40960.png',
    approved: 'picker-sound.png',
  },
  {title: 'SOUND Synth page', frame: 'synth-pages/frame-25600.png'},
  {
    title: 'SOUND Filter page with the cursor on Cutoff',
    frame: 'synth-pages/frame-348800.png',
    approved: 'sound-filter.png',
  },
  {title: 'SOUND Filter envelope page', frame: 'synth-pages/frame-358400.png'},
  {
    title: 'SOUND Volume envelope page with the cursor on Sustain',
    frame: 'synth-pages/frame-393600.png',
    approved: 'sound-volume-envelope.png',
  },
  {title: 'SOUND Voice page', frame: 'synth-pages/frame-403200.png'},
  {
    title: 'SOUND Synth page, Oscillator 2 fine tune holding still',
    frame: 'scrolling-text/frame-69120.png',
  },
  {
    title: 'SOUND Synth page, Oscillator 2 fine tune scrolled 30 pixels',
    frame: 'scrolling-text/frame-140800.png',
  },
  {
    title: 'SOUND Synth page, Oscillator 2 fine tune coming round',
    frame: 'scrolling-text/frame-316800.png',
  },
  {
    title: 'SOUND Synth page, Oscillator 2 fine tune shortened after the cursor left',
    frame: 'scrolling-text/frame-352000.png',
  },
  {
    title: 'PAGE held on SOUND',
    frame: 'synth-pages/frame-409600.png',
    approved: 'page-held.png',
  },
  {
    title: 'Sample picker inside drums/ on snare-room.wav',
    frame: 'sample-sounds/frame-60800.png',
    approved: 'picker-sample.png',
  },
  {
    title: 'SOUND Sample page of snare-room with Start 4.0% and End 92.0%',
    frame: 'sample-sounds/frame-243200.png',
    approved: 'sound-sample.png',
  },
  {
    title: 'SOUND Pad page with the sample sound snare-room on pad 1',
    frame: 'sample-sounds/frame-579200.png',
    approved: 'sound-pad.png',
  },
  {title: 'SAMPLES at the top level', frame: 'samples-screen/frame-12800.png'},
  {
    title: 'SAMPLES inside drums/ on ".."',
    frame: 'samples-screen/frame-36864.png',
    approved: 'picker-sample.png',
  },
  {
    title: 'SAMPLES inside drums/ on snare-room.wav',
    frame: 'samples-screen/frame-54400.png',
    approved: 'samples.png',
  },
  {title: 'Delete picker on Bass.wav', frame: 'samples-delete/frame-17664.png'},
  {
    title: 'Question before deleting Bass.wav',
    frame: 'samples-delete/frame-22400.png',
    approved: 'question.png',
  },
  {
    title: 'Question before deleting kick.wav, which 2 sounds use',
    frame: 'sample-delete/frame-76800.png',
    approved: 'question.png',
  },
  {
    title: 'Sound picker on kick, missing as kick 2 is',
    frame: 'sample-delete/frame-108800.png',
    approved: 'picker-sound.png',
  },
  {
    title: 'POOL on snare-room, with hat missing',
    frame: 'pool/frame-217600.png',
    approved: 'pool.png',
  },
  {
    title: 'SOUND Pad page of Syn 1 on no pad, with Engine alone',
    frame: 'pool/frame-259200.png',
    approved: 'sound-pad.png',
  },
  {
    title: 'Question before deleting kick, on 2 pads',
    frame: 'pool/frame-288000.png',
    approved: 'question.png',
  },
  {title: 'Question before removing 1 unused sound', frame: 'pool/frame-326400.png'},
  {title: 'POOL saying "No unused sounds"', frame: 'pool/frame-336000.png'},
  {title: 'SETTINGS Dev page', frame: 'samples-screen/frame-190464.png'},
  {
    title: 'STEP while importing 3 files',
    frame: 'library-import/frame-4864.png',
    approved: 'step-message.png',
  },
  {
    title: 'STEP after 3 files imported',
    frame: 'library-import/frame-11264.png',
    approved: 'step-message.png',
  },
  {
    title: 'STEP after 2 files imported and 1 not',
    frame: 'library-import/frame-19200.png',
    approved: 'step-message.png',
  },
  {title: 'Every glyph of the font', frame: 'gallery/font.png', approved: 'font.png'},
  {
    title: 'Every named colour of the palette',
    frame: 'gallery/palette.png',
    approved: 'palette.png',
  },
];
