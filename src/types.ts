export interface Computation<T = any> extends Scope {
  id?: string | undefined;

  get value(): T;
  set value(newValue: T);

  /** @internal The effect type. */
  _effect: number;
  /** @internal Whether the derived has been initialized. */
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

  call(this: Computation<T>): T;

  /**
   * Reads the current value of the computation and notifies the parent computation that this
   * computation is being used.
   */
  read(): T;

  /**
   * Writes the new value of the computation. If the value has changed it will notify all observers.
   */
  write(value: T | NextValue<T>): T;

  /**
   * Disposes the computation, its observers, and its children.
   */
  dispose(): void;
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
  /** @internal */
  _parent: Scope | null;
  /** @internal */
  _state: number;
  /** @internal */
  _compute: unknown;
  /** @internal */
  _next: Scope | null;
  /** @internal */
  _prev: Scope | null;
  /** @internal */
  _context: ContextRecord | null;
  /** @internal */
  _handlers: ErrorHandler<any>[] | null;
  /** @internal */
  _disposal: Disposable | Disposable[] | null;

  /**
   * Append child scope.
   */
  append(scope: Scope): void;

  /**
   * Walks the scope tree (bottom-up) and runs the given callback for each child scope. The tail
   * scope is returned that does not belong to the given scope root.
   */
  walk(callback: (child: Scope) => void): Scope | null;

  /**
   * Disposes the scope and its children.
   */
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
export type MaybeSignal<T> = MaybeFunction | ReadSignal<T>;
export type ContextRecord = Record<string | symbol, unknown>;

export interface ErrorHandler<T = Error> {
  (error: T): void;
}
