declare const __brand: unique symbol;

export type Brand<T, TBrand extends string> = T & {
  readonly [__brand]: TBrand;
};
