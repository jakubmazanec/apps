import {type Runtime} from '../utilities/Runtime.js';

export type SliderRuntime = Runtime<{isDragging: boolean; value: number}>;
