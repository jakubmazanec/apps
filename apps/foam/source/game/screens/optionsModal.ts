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

export type OptionsModalOptions = {
  /** UI root of the screen that opens the window. */
  ui: UiRoot;

  /** Scheduler of that screen; it drives the fade. */
  scheduler: Scheduler;

  /** Called once the window has closed. */
  onClosed: () => void;
};

// One row per bus: a label plus a Slider seeded from the current setting.
// onChange fires on every value change, including each pointermove tick of a
// drag. audio.setVolume is cheap and wants every tick; the settings write is
// not, so it goes through saveSettingsSoon and collapses to one write on the
// drag's trailing edge.
function volumeRow(label: string, bus: AudioBus) {
  let slider = new Slider({
    theme: game.theme,
    value: settings.volumes[bus],
    onChange: (changed) => {
      audio.setVolume(bus, changed.value);
      settings.volumes[bus] = changed.value;
      saveSettingsSoon();
    },
  });

  return new Container({
    children: [new Text({text: label, theme: game.theme, layout: true}), slider],
    layout: {gap: 3},
  });
}

// The window is built per call, so the sliders read the current settings at
// build time and no re-sync code exists. No initialFocus: nothing is focused
// on open; the first focus command lands via the normal focus walk.
export function openOptionsModal({ui, scheduler, onClosed}: OptionsModalOptions): Modal {
  let panel = new Panel({
    theme: game.theme,
    children: [
      new Text({text: 'Options', theme: game.theme, layout: true}),
      volumeRow('Master', 'master'),
      volumeRow('Music', 'music'),
      volumeRow('SFX', 'sfx'),
      volumeRow('UI', 'ui'),
    ],
    layout: {
      padding: 8,
      alignItems: 'center',
      flexDirection: 'column',
      gap: 4,
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
      onClick: () => {
        modal.close();
      },
    }),
  );
  ui.addOverlay(modal);

  return modal;
}
