export interface Computation<T = any> extends Scope {
  id?: string | undefined;

  _scoped: boolean;
  _init: boolean;

  _value: T;
  _sources: Computation[] | null;
  _observers: Computation[] | null;

  _compute: (() => T) | null;
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
  _scope: Scope | null;
  _state: number;
  _compute: unknown;
  _prevSibling: Scope | null;
  _nextSibling: Scope | null;
  _context: ContextRecord | null;
  _disposal: Disposable | Disposable[] | null;
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
