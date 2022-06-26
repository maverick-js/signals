import { createScheduler } from './scheduler';

export type Observable<T> = {
  $id?: string;
  (): T;
  set: (nextValue: T) => void;
  update: (next: (prevValue: T) => T) => void;
};

export type Computation<T> = {
  $id?: string;
  (): T;
};

export type Dispose = () => void;
export type StopEffect = (deep?: boolean) => void;

const COMPUTED = Symbol(__DEV__ ? 'COMPUTED' : '');
const DIRTY = Symbol(__DEV__ ? 'DIRTY' : '');
const DISPOSED = Symbol(__DEV__ ? 'DISPOSED' : '');
const OBSERVERS = Symbol(__DEV__ ? 'OBSERVERS' : '');
const DEPENDENCIES = Symbol(__DEV__ ? 'DEPENDENCIES' : '');

let _peeking: Computable | null = null;

// Used only for debugging to determine how a cycle occurred.
let _callStack: Computable[] = [];

const _computeStack: Computable[] = [];

const _scheduler = createScheduler(
  __DEV__
    ? () => {
        _callStack = [];
      }
    : undefined,
);

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
 * current value when invoked `fn()`, and provide a simple write API via `set()` and `update()`. The
 * value can now be observed when used inside other computations created with `$computed` and `$effect`.
 *
 * @example
 * ```
 * const $a = $observable(10);
 *
 * $a(); // read
 * $a.set(20); // write (1)
 * $a.update(prev => prev + 10); // write (2)
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

  $observable.update = (next: (prevValue: T) => T) => {
    $observable.set(next(currentValue));
  };

  if (__DEV__) $observable.$id = $id ?? '$observable';

  return $observable;
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
export function $computed<T>(fn: () => T, $id?: string): Computation<T> {
  let currentValue;
  const $computed: Computation<T> = () => {
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
      _computeStack.push($computed);
      const nextValue = fn();
      _computeStack.pop();

      currentValue = nextValue;
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
  const dependencies = (fn as Computable)[DEPENDENCIES];

  if (dependencies) {
    for (const dep of dependencies) {
      if (deep) $dispose(dep, deep);
      dep[OBSERVERS]?.delete(fn);
    }

    dependencies.clear();
    fn[DEPENDENCIES] = undefined;
  }

  fn[OBSERVERS]?.clear();
  fn[OBSERVERS] = undefined;

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
 * operations (i.e., `set()` and `update()`).
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
export function $readonly<T>($observable: Observable<T>): Computation<T> {
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
 * Whether the given function is a computed observable.
 *
 * @example
 * ```js
 * isComputed(() => {}); // false
 *
 * const $a = $observable(10);
 * isComputed($a); // false
 *
 * const $b = $computed(() => $a() + 10);
 * isComputed($b); // true
 * ```
 */
export function isComputed(fn: () => void) {
  return COMPUTED in fn;
}

export function safeNotEqual(a, b) {
  return a != a ? b == b : a !== b || (a && typeof a === 'object') || typeof a === 'function';
}

type Computable = {
  $id?: string;
  (): any;
  [COMPUTED]?: boolean;
  [DIRTY]?: boolean;
  [DISPOSED]?: boolean;
  [OBSERVERS]?: Set<Computable>;
  [DEPENDENCIES]?: Set<Computable>;
};

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
