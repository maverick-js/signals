import type { SCOPE } from './symbols';

export interface Computation<T = any> extends Scope {
  id?: string | undefined;

  /** @internal */
  _scoped: boolean;
  /** @internal */
  _init: boolean;

  /** @internal */
  _value: T;
  /** @internal */
  _sources: Computation[] | null;
  /** @internal */
  _observers: Computation[] | null;

  /** @internal */
  _compute: (() => T) | null;
  /** @internal */
  _changed: (prev: T, next: T) => boolean;
  /** read */
  call(this: Computation<T>): T;
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
  set: (value: T | NextValue<T>) => T;
}

export interface NextValue<T> {
  (prevValue: T): T;
}

export interface Scope {
  [SCOPE]: Scope | null;
  /** @internal */
  _state: number;
  /** @internal */
  _compute: unknown;
  /** @internal */
  _prevSibling: Scope | null;
  /** @internal */
  _nextSibling: Scope | null;
  /** @internal */
  _context: ContextRecord | null;
  /** @internal */
  _disposal: Disposable | Disposable[] | null;
  append(scope: Scope): void;
}

export interface Dispose {
  (): void;
}

export interface Disposable extends Callable {}

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
export type MaybeDisposable = Maybe<Disposable>;
export type MaybeStopEffect = Maybe<StopEffect>;
export type MaybeSignal<T> = MaybeFunction | ReadSignal<T>;
export type ContextRecord = Record<string | symbol, unknown>;
