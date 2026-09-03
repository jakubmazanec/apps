/* eslint-disable max-classes-per-file -- needed */
const tag: unique symbol = Symbol('Tag');
const component: unique symbol = Symbol('Component');

/** Data attached to an entity. */
export abstract class Component {
  /** Tag making the type nominal. */
  private readonly [tag] = component;
}

export function defineComponent<T extends Record<string, unknown>>() {
  return class CustomComponent extends Component {
    constructor(data: T) {
      super();
      Object.assign(this, data);
    }
  } as new (data: T) => Component & T;
}
