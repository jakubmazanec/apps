import {type LayoutContainer} from '@pixi/layout/components';

// Moves the widget to 'hovered' when the pointer enters and back to 'normal'
// when it leaves, unless the widget is disabled or already in the target state.
export function attachHoverHandlers(
  view: LayoutContainer,
  getState: () => string,
  setState: (state: 'hovered' | 'normal') => void,
): void {
  view.on('pointerover', () => {
    let state = getState();

    if (state === 'disabled' || state === 'hovered') {
      return;
    }

    setState('hovered');
  });

  view.on('pointerout', () => {
    let state = getState();

    if (state === 'disabled' || state === 'normal') {
      return;
    }

    setState('normal');
  });
}
