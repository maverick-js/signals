import type { SCOPE, SIGNAL } from './symbols.js';

export interface Computation<T = any> extends Scope {
  readonly [SIGNAL]: true;
  id?: string | undefined;

  /** @internal */
  _value: T;
  /** @internal */
  _sources: Computation[] | null;
  /** @internal */
  _observers: Computation[] | null;
  /** @internal */
  _mark: number;

  /** @internal */
  _compute: (() => T) | null;
  /** @internal - `null` means `Object.is`. */
  _equals: ((prev: T, next: T) => boolean) | null;
  /** Reads the current value and tracks it as a dependency of the running computation. */
  get(): T;
  /** Reads the current value without tracking it. */
  peek(): T;
}

export interface ReadSignal<T> {
  readonly [SIGNAL]: true;
  /** Reads the current value and tracks it as a dependency of the running computation. */
  get(): T;
  /** Reads the current value without tracking it. */
  peek(): T;
}

export interface SignalOptions<T> {
  /** Debugging identifier (development builds only). */
  id?: string;
  /**
   * Decides whether a new value equals the previous one, in which case observers are not notified.
   * Defaults to `Object.is`.
   */
  equals?: (prev: T, next: T) => boolean;
}

export interface ComputedSignalOptions<T, R = never> extends SignalOptions<T> {
  initial?: R;
}

export type InferSignalValue<T> = T extends ReadSignal<infer R> ? R : T;

export interface WriteSignal<T> extends ReadSignal<T> {
  /** Sets the value, or derives it from the previous one when given a function. */
  set(value: T | NextValue<T>): T;
}

export interface NextValue<T> {
  (prevValue: T): T;
}

export interface Scope {
  [SCOPE]: Scope | null;
  /** @internal - low two bits are the state, remaining bits are flags. */
  _state: number;
  /** @internal */
  _compute: unknown;
  /** @internal */
  _children: Scope[] | null;
  /** @internal */
  _context: ContextRecord | null;
  /** @internal */
  _handlers: ErrorHandler<any>[] | null;
  /** @internal */
  _disposal: Disposable | Disposable[] | null;
  append(scope: Scope): void;
  dispose(): void;
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
export type MaybeSignal<T> = Maybe<T> | ReadSignal<T>;
export type ContextRecord = Record<string | symbol, unknown>;

export interface ErrorHandler<T = Error> {
  (error: T): void;
}
