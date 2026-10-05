import {
  type AudioBus,
  Button,
  Container,
  Modal,
  Panel,
  type Scheduler,
  Slider,
  Text,
  type UiRoot,
} from 'tellurion';

import {audio} from '../core/audio.js';
import {game} from '../core/game.js';
import {saveSettingsSoon, settings} from '../core/settings.js';
import {createWindowTitle} from './windowTitle.js';

export type OptionsModalOptions = {
  /** UI root of the screen that opens the window. */
  ui: UiRoot;

  /** Scheduler of that screen; it drives the fade. */
  scheduler: Scheduler;

  /** Called once the window has closed. */
  onClosed: () => void;
};

const WINDOW_PADDING = {paddingTop: 8, paddingBottom: 8, paddingLeft: 12, paddingRight: 12};
const NAME_WIDTH = 36;
const VALUE_WIDTH = 24;
const ROW_GAP = 6;
const ROW_WIDTH = 136;
const ROW_HEIGHT = 12;

function formatVolume(value: number): string {
  return `${Math.round(value * 100)}%`;
}

// One row per bus: a name, a Slider seeded from the current setting and its value as a percentage.
// onChange fires on every value change, including each pointermove tick of a
// drag. audio.setVolume is cheap and wants every tick; the settings write is
// not, so it goes through saveSettingsSoon and collapses to one write on the
// drag's trailing edge.
function volumeRow(label: string, bus: AudioBus) {
  // The value is created before the slider, whose onChange sets it.
  let value = new Text({
    text: formatVolume(settings.volumes[bus]),
    theme: game.theme,
    layout: {width: VALUE_WIDTH, height: ROW_HEIGHT},
  });
  let slider = new Slider({
    theme: game.theme,
    value: settings.volumes[bus],
    onChange: (changed) => {
      audio.setVolume(bus, changed.value);
      settings.volumes[bus] = changed.value;
      value.setText(formatVolume(changed.value));
      saveSettingsSoon();
    },
  });

  return new Container({
    children: [
      new Text({
        text: label,
        theme: game.theme,
        layout: {width: NAME_WIDTH, height: ROW_HEIGHT},
      }),
      slider,
      value,
    ],
    layout: {gap: ROW_GAP, width: ROW_WIDTH, height: ROW_HEIGHT, alignItems: 'center'},
  });
}

// The window is built per call, so the sliders read the current settings at
// build time and no re-sync code exists. No initialFocus: nothing is focused
// on open; the first focus command lands via the normal focus walk.
export function openOptionsModal({ui, scheduler, onClosed}: OptionsModalOptions): Modal {
  let panel = new Panel({
    theme: game.theme,
    children: [
      createWindowTitle('Options', ROW_WIDTH),
      volumeRow('Master', 'master'),
      volumeRow('Music', 'music'),
      volumeRow('SFX', 'sfx'),
      volumeRow('UI', 'ui'),
    ],
    layout: {
      ...WINDOW_PADDING,
      flexDirection: 'column',
      gap: 4,
      alignItems: 'stretch',
    },
  });
  let modal = new Modal({
    theme: game.theme,
    children: [panel],
    layout: {justifyContent: 'center', alignItems: 'center'},
    scheduler,
    fadeDuration: 200,
    onClosed: () => {
      saveSettingsSoon.flush();
      onClosed();
    },
  });

  // Added after the modal exists, because its handler closes that modal. Focus
  // returns to whatever was focused before the window opened, via the
  // focus-scope pop.
  panel.addChild(
    new Button({
      theme: game.theme,
      children: [new Text({text: 'Close', theme: game.theme, layout: true})],
      layout: {marginTop: 4},
      onClick: () => {
        modal.close();
      },
    }),
  );
  ui.addOverlay(modal);

  return modal;
}
