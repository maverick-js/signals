import type { FLAGS, SCOPE } from './symbols';

export interface Computation<T = any> {
  id?: string | undefined;

  [FLAGS]: number;
  [SCOPE]: Computation | null;
  _prevSibling: Computation | null;
  _nextSibling: Computation | null;

  _value: T;
  _disposal: Dispose | Dispose[] | null;
  _context: ContextRecord | null;
  _sources: Computation[] | null;
  _observers: Computation[] | null;

  call(this: Computation<T>): T;
  _compute: (() => T) | null;
  _changed: (prev: T, next: T) => boolean;
}

export interface ReadSignal<T> {
  (): T;
  /** only available during dev. */
  node?: Computation;
}

export interface SignalOptions<T> {
  id?: string;
  dirty?: (prev: T, next: T) => boolean;
}

export interface ComputedSignalOptions<T, R = never> extends SignalOptions<T> {
  initial?: R;
  scoped?: boolean;
}

export type InferSignalValue<T> = T extends ReadSignal<infer R> ? R : T;

export interface WriteSignal<T> extends ReadSignal<T> {
  /** only available during dev. */
  node?: Computation;
  set: (value: T extends Function ? T : T | NextValue<T>) => T;
}

export interface NextValue<T> {
  (prevValue: T): T;
}

export interface SelectorSignal<T> {
  (key: T): ReadSignal<Boolean>;
}

export interface Scope extends Computation<unknown> {}

export interface ScopeConstructor {
  new (): Scope;
}

export interface Dispose extends Callable {}

export interface Effect {
  (): MaybeStopEffect;
}

export interface StopEffect {
  (): void;
}

export interface Callable<This = unknown, Return = void> {
  call($this: This): Return;
}

export type Maybe<T> = T | void | null | undefined | false;
export type MaybeFunction = Maybe<(...args: any) => any>;
export type MaybeDispose = Maybe<Dispose>;
export type MaybeStopEffect = Maybe<StopEffect>;
export type MaybeSignal<T> = MaybeFunction | ReadSignal<T>;
export type ContextRecord = Record<string | symbol, unknown>;
