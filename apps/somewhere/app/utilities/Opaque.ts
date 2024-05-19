declare const tag: unique symbol;

declare type Tagged<Token> = {
  readonly [tag]: Token;
};

export type Opaque<Type, Token = unknown> = Tagged<Token> & Type;

export type UnwrapOpaque<OpaqueType extends Tagged<unknown>> =
  OpaqueType extends Opaque<infer Type, OpaqueType[typeof tag]> ? Type : OpaqueType;

// based on https://github.com/sindresorhus/type-fest/blob/3ec8dbad575899c3c09d705963873a0397b0e6c9/source/opaque.d.ts (see https://github.com/sindresorhus/type-fest/blob/3ec8dbad575899c3c09d705963873a0397b0e6c9/license-mit for license)
