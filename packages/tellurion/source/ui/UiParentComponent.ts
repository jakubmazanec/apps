import {type UiChildComponent} from './UiChildComponent.js';
import {type UiComponent} from './UiComponent.js';

// A component that exposes the components added to it in a public children
// array. Focus discovery recurses through these, so a focusable is only
// discoverable while it is reachable through component-level addChild calls
// from the screen's UI root; raw Pixi containers are leaves.
export type UiParentComponent = UiComponent & {children: UiChildComponent[]};
