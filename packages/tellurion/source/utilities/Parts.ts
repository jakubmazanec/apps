export type Parts<T extends object> = {readonly [Name in keyof T]: T[Name]};
