// eslint-disable-next-line @typescript-eslint/no-explicit-any -- needed
export type Constructor<T, Arguments extends unknown[] = any[]> = new (...args: Arguments) => T;
