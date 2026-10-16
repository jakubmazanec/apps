export type Runtime<T extends object> = {-readonly [Name in keyof T]: T[Name]};
