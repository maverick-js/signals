export type Observable<T> = {
  id?: string;
  (): T;
};

export type ObservableOptions<T> = {
  id?: string;
  dirty?: (prev: T, next: T) => boolean;
};

export type ComputedOptions<T, R = never> = ObservableOptions<T> & {
  /**
   * It can be fatal if a computed fails by throwing an error during its first run. A `fallback`
   * can be specified to indicate that this was expected, and that the given value should be
   * returned in the event it does happen.
   */
  fallback?: R;
};

export type ObservableValue<T> = T extends Observable<infer R> ? R : T;

export type ObservableSubject<T> = Observable<T> & {
  set: (value: T) => void;
  next: (next: (prevValue: T) => T) => void;
};

export type Dispose = () => void;
export type Effect = () => MaybeStopEffect;
export type StopEffect = () => void;

export type Maybe<T> = T | void | null | undefined | false;
export type MaybeFunction = Maybe<(...args: any) => any>;
export type MaybeDispose = Maybe<Dispose>;
export type MaybeStopEffect = Maybe<StopEffect>;
export type MaybeObservable<T> = MaybeFunction | Observable<T>;

export type ContextRecord = Record<string | symbol, unknown>;
