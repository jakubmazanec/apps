import {defineComponent} from '../ecs/Component.js';
import {type Input} from './Input.js';

// Purely discoverability: game systems find input through a query, the way
// playerSystem finds the camera through cameraQuery. Singleton entity + query
// per T1.1 — not a module singleton, not a world resource (that API arrives
// with T2.15; the query reads migrate to resource reads then).
export const InputComponent = defineComponent<{input: Input}>();
