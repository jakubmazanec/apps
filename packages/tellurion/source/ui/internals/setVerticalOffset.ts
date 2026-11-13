import {type ChildUiComponent} from '../ChildUiComponent.js';
import {resolveView} from './resolveView.js';

// Position composes on top of the yoga-computed placement rather than replacing it, so
// shifting children directly never touches yoga's style or triggers a relayout, unlike
// reassigning `layout`.
export function setVerticalOffset(children: ChildUiComponent[], offset: number): void {
  for (let child of children) {
    resolveView(child).y = offset;
  }
}
