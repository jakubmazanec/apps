// eslint-disable-next-line @typescript-eslint/no-explicit-any -- needed
export type Class<T, Arguments extends unknown[] = any[]> = {
  prototype: Pick<T, keyof T>;
  new (...args: Arguments): T;
};
