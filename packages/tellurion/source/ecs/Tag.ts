// TODO: could we somehow merge this with how Opaque type works? 🤔
/** Key used to privately brand ECS classes for nominal typing. */
export const tag: unique symbol = Symbol('Tag');
