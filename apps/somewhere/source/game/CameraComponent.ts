import {defineComponent} from '../engine/Component.js';
import {type Vector} from '../engine/Vector.js';

export const CameraComponent = defineComponent<{position: Vector}>();
