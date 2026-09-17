export type Config<T extends object> = {readonly [Name in keyof T]: T[Name]};
