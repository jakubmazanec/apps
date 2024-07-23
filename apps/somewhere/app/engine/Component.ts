const tag: unique symbol = Symbol('Component');

export abstract class Component {
  private readonly [tag] = tag;
}
