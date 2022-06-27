import { createScheduler } from './scheduler';

export type Observable<T> = {
  $id?: string;
  (): T;
  set: (value: T) => void;
  next: (next: (prevValue: T) => T) => void;
};

export type ReadonlyObservable<T> = {
  $id?: string;
  (): T;
};

export type Computed<T> = ReadonlyObservable<T>;

export type MaybeFunction = ((...args: any) => any) | null | undefined | false;
export type MaybeObservable<T = unknown> = MaybeFunction | Observable<T>;
export type MaybeComputed<T = unknown> = MaybeFunction | Computed<T>;

export type Dispose = () => void;
export type StopEffect = (deep?: boolean) => void;

const OBSERVABLE = Symbol(__DEV__ ? 'OBSERVABLE' : '');
const COMPUTED = Symbol(__DEV__ ? 'COMPUTED' : '');
const DIRTY = Symbol(__DEV__ ? 'DIRTY' : '');
const DISPOSED = Symbol(__DEV__ ? 'DISPOSED' : '');
const OBSERVERS = Symbol(__DEV__ ? 'OBSERVERS' : '');
const DEPENDENCIES = Symbol(__DEV__ ? 'DEPENDENCIES' : '');
const DISPOSAL = Symbol(__DEV__ ? 'DISPOSAL' : '');

let _peeking: Computable | null = null;

// Used only for debugging to determine how a cycle occurred.
let _callStack: Computable[] = [];

const _computeStack: Computable[] = [];
const _currentCompute = () => _computeStack[_computeStack.length - 1];

const _scheduler = createScheduler(
  __DEV__
    ? () => {
        _callStack = [];
      }
    : undefined,
);

/**
 * Creates a computation root which is given a `dispose()` function to dispose of all inner
 * computations.
 *
 * @example
 * ```js
 * const result = $root((dispose) => {
 *   // ...
 *   dispose();
 *   return 10;
 * });
 *
 * console.log(result); // logs `10`
 * ```
 */
export function $root<T>(fn: (dispose: Dispose) => T): T {
  const $root = () => fn(dispose);
  const dispose = () => $dispose($root, true);
  return compute($root, $root);
}

/**
 * Returns the current value stored inside an observable without triggering a dependency.
 *
 * @example
 * ```js
 * const $a = $observable(10);
 *
 * $computed(() => {
 *  // `$a` will not be considered a dependency.
 *  const value = $peek($a);
 * });
 * ```
 */
export function $peek<T>(fn: () => T): T {
  _peeking = fn;
  const result = fn();
  _peeking = null;
  return result;
}

/**
 * Wraps the given value into an observable function. The observable function will return the
 * current value when invoked `fn()`, and provide a simple write API via `set()` and `next()`. The
 * value can now be observed when used inside other computations created with `$computed` and `$effect`.
 *
 * @example
 * ```
 * const $a = $observable(10);
 *
 * $a(); // read
 * $a.set(20); // write (1)
 * $a.next(prev => prev + 10); // write (2)
 * ```
 */
export function $observable<T>(initialValue: T, $id?: string): Observable<T> {
  let currentValue = initialValue;

  const $observable: Observable<T> = () => {
    if (__DEV__) _callStack.push($observable);

    if (_computeStack.length) {
      const observer = _computeStack[_computeStack.length - 1];
      observe($observable, observer);
    }

    return currentValue;
  };

  $observable.set = (nextValue: T) => {
    if (!$observable[DISPOSED] && safeNotEqual(nextValue, currentValue)) {
      currentValue = nextValue!;
      dirty($observable);
    }
  };

  $observable.next = (next: (prevValue: T) => T) => {
    $observable.set(next(currentValue));
  };

  if (__DEV__) $observable.$id = $id ?? '$observable';

  $observable[OBSERVABLE] = true;
  return $observable;
}

/**
 * Whether the given function is an observable.
 *
 * @example
 * ```js
 * // True
 * isObservable($observable(10));
 * // False
 * isObservable(false);
 * isObservable(null);
 * isObservable(undefined);
 * isObservable($computed(() => 10));
 * isObservable($effect(() => {}));
 * ```
 */
export function isObservable<T>(fn: MaybeObservable<T>): fn is Observable<T> {
  return fn ? OBSERVABLE in fn : false;
}

/**
 * Creates a new observable whose value is computed and returned by the given function. The given
 * compute function is _only_ re-run when one of it's dependencies are updated. Dependencies are
 * are all observables that are read during execution.
 *
 * @example
 *
 * ```js
 * const $a = $observable(10);
 * const $b = $observable(10);
 * const $c = $computed(() => $a() + $b());
 *
 * console.log($c()); // logs 20
 *
 * $a.set(20);
 * await $tick();
 * console.log($c()); // logs 30
 *
 * $b.set(20);
 * await $tick();
 * console.log($c()); // logs 40
 * ```
 */
export function $computed<T>(fn: () => T, $id?: string): Computed<T> {
  let currentValue;
  const $computed: Computed<T> = () => {
    if (__DEV__) _callStack.push($computed);

    // Computed is observing another computed.
    if (_computeStack.length) {
      if (_computeStack.includes($computed)) {
        if (__DEV__) {
          const calls = _callStack.map((c) => c.$id ?? '?').join(' --> ');
          throw Error(`cyclic dependency detected\n\n${calls}\n`);
        }

        return currentValue;
      }

      const observer = _computeStack[_computeStack.length - 1];
      observe($computed, observer);
    }

    if (!$computed[DISPOSED] && $computed[DIRTY]) {
      currentValue = compute($computed, fn);
      $computed[DIRTY] = false;
      dirty($computed);
    }

    return currentValue;
  };

  if (__DEV__) $computed.$id = $id ?? `$computed`;

  // Starts off dirty because it hasn't run yet.
  $computed[DIRTY] = true;
  $computed[COMPUTED] = true;

  return $computed;
}

/**
 * Runs the given function when the parent computation is being disposed.
 *
 * @example
 * ```js
 * const listen = (type, callback) => {
 *   window.addEventListener(type, callback);
 *   onDispose(() => window.removeEventListener(type, callback));
 * };
 *
 * const stop = $effect(() => {
 *   // This will be disposed of when the effect is.
 *   listen('click', () => {
 *     // ...
 *   });
 * });
 *
 * stop(); // `onDispose` is called
 * ```
 */
export function onDispose(fn?: () => void) {
  const compute = _currentCompute() as Computable;

  if (__DEV__ && !compute) {
    console.warn('[maverick]: trying to add a `onDispose` function but no parent exists.');
  }

  if (fn && compute) (compute[DISPOSAL] ??= new Set()).add(fn);
}

/**
 * Unsubscribes the given observable and optionally all inner computations. Disposed functions will
 * retain their current value but are no longer reactive.
 *
 * @example
 * ```js
 * const $a = $observable(10);
 * const $b = $computed(() => $a());
 *
 * // `$b` will no longer update if `$a` is updated.
 * $dispose($a);
 *
 * $a.set(100);
 * console.log($b()); // still logs `10`
 * ```
 */
export function $dispose(fn: () => void, deep?: boolean) {
  if ((fn as Computable)[DEPENDENCIES]) {
    for (const dep of fn[DEPENDENCIES]) {
      if (deep) $dispose(dep, deep);
      dep[OBSERVERS]?.delete(fn);
    }

    unrefSet(fn, DEPENDENCIES);
  }

  if ((fn as Computable)[DISPOSAL]) {
    for (const dispose of fn[DISPOSAL]) dispose();
    unrefSet(fn, DISPOSAL);
  }

  unrefSet(fn, OBSERVERS);

  fn[DIRTY] = false;
  fn[DISPOSED] = true;
}

/**
 * Invokes the given function each time any of the observables that are read inside are updated
 * (i.e., their value changes). The effect is immediately invoked on initialization.
 *
 * @example
 * ```js
 * const $a = $observable(10);
 * const $b = $observable(20);
 * const $c = $computed(() => $a() + $b());
 *
 * // This effect will run each time `$a` or `$b` is updated.
 * const stop = $effect(() => console.log($c()));
 *
 * stop();
 * ```
 */
export function $effect(fn: () => void, $id?: string): StopEffect {
  const $compute = $computed(fn, __DEV__ ? $id ?? '$effect' : $id);
  $compute();
  return (deep?: boolean) => $dispose($compute, deep);
}

/**
 * Takes in the given observable and makes it read only by removing access to write
 * operations (i.e., `set()` and `next()`).
 *
 * @example
 * ```js
 * const $a = $observable(10);
 * const $b = $readonly($a);
 *
 * console.log($b()); // logs 10
 *
 * // We can still update value through `$a`.
 * $a.set(20);
 *
 * console.log($b()); // logs 20
 * ```
 */
export function $readonly<T>($observable: Observable<T>): ReadonlyObservable<T> {
  return () => $observable();
}

/**
 * Tasks are batched onto the microtask queue. This means only the last write of multiple write
 * actions performed in the same execution window is applied. You can wait for the microtask
 * queue to be flushed before writing a new value so it takes effect.
 *
 * @example
 * ```js
 * const $a = $observable(10);
 *
 * $a.set(10);
 * $a.set(20);
 * $a.set(30); // only this write is applied
 *
 * // ----
 *
 * // All writes are applied
 * $a.set(10);
 * await $tick();
 * $a.set(20);
 * await $tick();
 * $a.set(30);
 * ```
 */
export function $tick() {
  _scheduler.flush();
  return _scheduler.tick;
}

/**
 * Whether the given function is computed.
 *
 * @example
 * ```js
 * // True
 * isComputed($computed(() => 10));
 * // False
 * isComputed(false);
 * isComputed(null);
 * isComputed(undefined);
 * isComputed($observable(10));
 * isComputed($effect(() => {}));
 * ```
 */
export function isComputed<T>(fn: MaybeComputed<T>): fn is Computed<T> {
  return fn ? COMPUTED in fn : false;
}

export function safeNotEqual(a, b) {
  return a != a ? b == b : a !== b || (a && typeof a === 'object') || typeof a === 'function';
}

type Computable = {
  $id?: string;
  (): any;
  [OBSERVABLE]?: boolean;
  [COMPUTED]?: boolean;
  [DIRTY]?: boolean;
  [DISPOSED]?: boolean;
  [OBSERVERS]?: Set<Computable>;
  [DEPENDENCIES]?: Set<Computable>;
  [DISPOSAL]?: Set<() => void>;
};

function compute<T>(parent: () => void, child: () => T): T {
  _computeStack.push(parent);
  const nextValue = child();
  _computeStack.pop();
  return nextValue;
}

function observe(node: Computable, observer: Computable) {
  if (!node[DISPOSED] && node !== _peeking) {
    (node[OBSERVERS] ??= new Set()).add(observer);
    (observer[DEPENDENCIES] ??= new Set()).add(node);
  }
}

function dirty(node: Computable) {
  if (_scheduler.seen.has(node)) return;

  const observers = node[OBSERVERS];

  if (observers) {
    const computation = _computeStack[_computeStack.length - 1];
    for (const observer of observers) {
      if (observer[COMPUTED] && observer !== computation) {
        observer[DIRTY] = true;
        _scheduler.enqueue(observer);
      }
    }
  }
}

function unrefSet(parent: any, key: symbol) {
  parent[key]?.clear();
  parent[key] = undefined;
}
