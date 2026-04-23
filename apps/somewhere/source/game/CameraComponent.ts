import {defineComponent} from '../engine/ecs/Component.js';
import {type Vector} from '../engine/utilities/Vector.js';

export const CameraComponent = defineComponent<{position: Vector}>();
