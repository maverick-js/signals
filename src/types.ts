export interface ReadSignal<T> {
  id?: string;
  (): T;
}

export interface SignalOptions<T> {
  id?: string;
  dirty?: (prev: T, next: T) => boolean;
}

export interface ComputedSignalOptions<T, R = never> extends SignalOptions<T> {
  /**
   * It can be fatal if a computed fails by throwing an error during its first run. A `fallback`
   * can be specified to indicate that this was expected, and that the given value should be
   * returned in the event it does happen.
   */
  fallback?: R;
}

export type InferSignalValue<T> = T extends ReadSignal<infer R> ? R : T;

export interface WriteSignal<T> extends ReadSignal<T> {
  set: (value: T) => void;
  next: (next: (prevValue: T) => T) => void;
}

export type Dispose = () => void;
export type Effect = () => MaybeStopEffect;
export type StopEffect = () => void;

export type Maybe<T> = T | void | null | undefined | false;
export type MaybeFunction = Maybe<(...args: any) => any>;
export type MaybeDispose = Maybe<Dispose>;
export type MaybeStopEffect = Maybe<StopEffect>;
export type MaybeSignal<T> = MaybeFunction | ReadSignal<T>;

export type ContextRecord = Record<string | symbol, unknown>;
