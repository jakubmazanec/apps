export type Disposables<Permanent extends string, Renewable extends string = never> = {
  [Name in Renewable]: DisposableStack | null;
} & {
  readonly [Name in Permanent]: DisposableStack;
};
