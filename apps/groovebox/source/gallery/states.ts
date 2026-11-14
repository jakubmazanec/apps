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
  {title: 'Every glyph of the font', frame: 'gallery/font.png', approved: 'font.png'},
  {
    title: 'Every named colour of the palette',
    frame: 'gallery/palette.png',
    approved: 'palette.png',
  },
];
