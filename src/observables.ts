import { createScheduler, type Scheduler } from '@maverick-js/scheduler';
import {
  CHILDREN,
  COMPUTED,
  CONTEXT,
  DIRTY,
  DISPOSAL,
  DISPOSED,
  ERROR,
  OBSERVABLE,
  OBSERVED_BY,
  OBSERVING,
  SCOPE,
} from './symbols';

export type Observable<T> = {
  id?: string;
  (): T;
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

const _scheduler = createScheduler(),
  NOOP = () => {};

type Node = {
  id?: string;
  (): any;
  [SCOPE]?: Node;
  [OBSERVABLE]?: boolean;
  [COMPUTED]?: boolean;
  [DIRTY]?: boolean;
  [DISPOSED]?: boolean;
  [OBSERVING]?: Set<Node>;
  [OBSERVED_BY]?: Set<Node>;
  [CHILDREN]?: Set<Node>;
  [CONTEXT]?: ContextRecord;
  [DISPOSAL]?: Set<Dispose>;
};

let currentScope: Node | undefined;
let currentObserver: Node | undefined;

// These are used only for debugging to determine how a cycle occurred.
let callStack: Node[] = [];
let computeStack: Node[] = [];

if (__DEV__) {
  _scheduler.onFlush(() => {
    callStack = [];
  });
}

/**
 * Creates a computation root which is given a `dispose()` function to dispose of all inner
 * computations.
 *
 * @see {@link https://github.com/maverick-js/observables#root}
 */
export function root<T>(fn: (dispose: Dispose) => T): T {
  const $root = () => {};
  $root[SCOPE] = currentScope;
  return compute($root, () => fn(() => dispose($root)));
}

/**
 * Returns the current value stored inside an observable without triggering a dependency.
 *
 * @see {@link https://github.com/maverick-js/observables#peek}
 */
export function peek<T>(fn: () => T): T {
  const prev = currentObserver;

  currentObserver = undefined;
  const result = fn();
  currentObserver = prev;

  return result;
}

/**
 * Wraps the given value into an observable function. The observable function will return the
 * current value when invoked `fn()`, and provide a simple write API via `set()` and `next()`. The
 * value can now be observed when used inside other computations created with `computed` and
 * `effect`.
 *
 * @see {@link https://github.com/maverick-js/observables#observable}
 */
export function observable<T>(
  initialValue: T,
  opts?: { id?: string; dirty?: (prev: T, next: T) => boolean },
): ObservableSubject<T> {
  let currentValue = initialValue;

  const isDirty = opts?.dirty ?? notEqual;

  const $observable: ObservableSubject<T> = () => {
    if (__DEV__) callStack.push($observable);
    if (currentObserver) observe($observable, currentObserver);
    return currentValue;
  };

  $observable.set = (nextValue: T) => {
    if (!$observable[DISPOSED] && isDirty(currentValue, nextValue)) {
      currentValue = nextValue!;
      dirtyNode($observable);
    }
  };

  $observable.next = (next: (prevValue: T) => T) => {
    $observable.set(next(currentValue));
  };

  if (__DEV__) $observable.id = opts?.id ?? 'observable';

  $observable[OBSERVABLE] = true;
  adopt($observable);
  return $observable;
}

/**
 * Whether the given value is an observable (readonly).
 *
 * @see {@link https://github.com/maverick-js/observables#isobservable}
 */
export function isObservable<T>(fn: MaybeObservable<T>): fn is Observable<T> {
  return !!fn?.[OBSERVABLE];
}

/**
 * Creates a new observable whose value is computed and returned by the given function. The given
 * compute function is _only_ re-run when one of it's dependencies are updated. Dependencies are
 * are all observables that are read during execution.
 *
 * @see {@link https://github.com/maverick-js/observables#computed}
 */
export function computed<T>(
  fn: () => T,
  opts?: { id?: string; dirty?: (prev: T, next: T) => boolean },
): Observable<T> {
  let currentValue,
    init = false;

  const isDirty = opts?.dirty ?? notEqual;

  const $computed: Observable<T> = () => {
    if (__DEV__ && computeStack.includes($computed)) {
      const calls = callStack.map((c) => c.id ?? '?').join(' --> ');
      throw Error(`cyclic dependency detected\n\n${calls}\n`);
    }

    if (__DEV__) callStack.push($computed);

    // Computed is observing another computed.
    if (currentObserver) observe($computed, currentObserver);

    if ($computed[DIRTY] && !$computed[DISPOSED]) {
      try {
        if ($computed[CHILDREN]) {
          for (const child of $computed[CHILDREN]) dispose(child);
          $computed[CHILDREN].clear();
        }

        emptyDisposal($computed);

        const nextValue = compute($computed, fn);
        $computed[DIRTY] = false;

        if (!init) {
          currentValue = nextValue;
          init = true;
        } else if (isDirty(currentValue, nextValue)) {
          currentValue = nextValue;
          dirtyNode($computed);
        }

        if (!$computed[OBSERVING]?.size) dispose($computed);
      } catch (error) {
        handleError($computed, error);
      }
    }

    return currentValue;
  };

  if (__DEV__) $computed.id = opts?.id ?? `computed`;

  // Starts off dirty because it hasn't run yet.
  $computed[DIRTY] = true;
  $computed[OBSERVABLE] = true;
  $computed[COMPUTED] = true;

  adopt($computed);
  return $computed;
}

/**
 * Whether the current scope has any active observers.
 */
export function isObserved(): boolean {
  return !!currentObserver?.[OBSERVING]?.size;
}

/**
 * Invokes the given function each time any of the observables that are read inside are updated
 * (i.e., their value changes). The effect is immediately invoked on initialization.
 *
 * @see {@link https://github.com/maverick-js/observables#effect}
 */
export function effect(fn: Effect, opts?: { id?: string }): StopEffect {
  const $effect = computed(() => onDispose(fn()), {
    id: __DEV__ ? opts?.id ?? 'effect' : opts?.id,
  });

  $effect();
  return () => dispose($effect);
}

/**
 * Takes in the given observable and makes it read only by removing access to write
 * operations (i.e., `set()` and `next()`).
 *
 * @see {@link https://github.com/maverick-js/observables#readonly}
 */
export function readonly<T>(observable: Observable<T>): Observable<T> {
  const $readonly = () => observable();
  $readonly[OBSERVABLE] = true;
  return $readonly;
}

/**
 * Tasks are batched onto the microtask queue. This means only the last write of multiple write
 * actions performed in the same execution window is applied. You can wait for the microtask
 * queue to be flushed before writing a new value so it takes effect.
 *
 * @see {@link https://github.com/maverick-js/observables#tick}
 */
export function tick() {
  _scheduler.flush();
  return _scheduler.tick;
}

/**
 * Whether the given value is an observable subject (i.e., can produce new values via write API).
 *
 * @see {@link https://github.com/maverick-js/observables#issubject}
 */
export function isSubject<T>(fn: MaybeObservable<T>): fn is ObservableSubject<T> {
  return isObservable(fn) && !!(fn as ObservableSubject<T>).set;
}

/**
 * Returns the owning scope of the given function. If no function is given it'll return the
 * currently executing parent scope. You can use this to walk up the computation tree.
 *
 * @see {@link https://github.com/maverick-js/observables#getscope}
 */
export function getScope(fn?: Observable<unknown>): Observable<unknown> | undefined {
  return !arguments.length ? currentScope : fn?.[SCOPE];
}

/** @deprecated use `getScope` */
export const getParent = getScope;

/**
 * Returns the global scheduler.
 *
 * @see {@link https://github.com/maverick-js/observables#getscheduler}
 */
export function getScheduler(): Scheduler {
  return _scheduler;
}

/**
 * Scopes the given function to the given parent scope so context and error handling continue to
 * work as expected. Generally this should be called on non-observable functions. A scoped
 * function will return `undefined` if an error is thrown.
 *
 * This is more compute and memory efficient than the alternative `effect(() => peek(callback))`
 * because it doesn't require creating and tracking a `computed` observable.
 */
export function scope<T>(fn: () => T, scope = getScope()!): () => T | undefined {
  adopt(fn, scope);
  return () => {
    try {
      return compute(scope, fn, currentObserver);
    } catch (error) {
      handleError(fn, error);
      return; // make TS happy
    }
  };
}

/**
 * Attempts to get a context value for the given key. It will start from the parent scope and
 * walk up the computation tree trying to find a context record and matching key. If no value can
 * be found `undefined` will be returned.
 *
 * @see {@link https://github.com/maverick-js/observables#getcontext}
 */
export function getContext<T>(key: string | symbol): T | undefined {
  return lookup(currentScope, key);
}

/**
 * Attempts to set a context value on the parent scope with the given key. This will be a no-op if
 * no parent is defined.
 *
 * @see {@link https://github.com/maverick-js/observables#setcontext}
 */
export function setContext<T>(key: string | symbol, value: T) {
  if (currentScope) (currentScope[CONTEXT] ??= {})[key] = value;
}

/**
 * Runs the given function when an error is thrown in a child scope. If the error is thrown again
 * inside the error handler, it will trigger the next available parent scope handler.
 *
 * @see {@link https://github.com/maverick-js/observables#onerror}
 */
export function onError<T = Error>(handler: (error: T) => void): void {
  if (!currentScope) return;
  (((currentScope[CONTEXT] ??= {})[ERROR] as Set<any>) ??= new Set()).add(handler);
}

/**
 * Runs the given function when the parent scope computation is being disposed.
 *
 * @see {@link https://github.com/maverick-js/observables#ondispose}
 */
export function onDispose(dispose: MaybeDispose): Dispose {
  if (!dispose || !currentScope || currentScope[DISPOSED]) return NOOP;
  (currentScope[DISPOSAL] ??= new Set()).add(dispose);
  return () => {
    (dispose as Dispose)();
    currentScope![DISPOSAL]?.delete(dispose as Dispose);
  };
}

/**
 * Unsubscribes the given observable and all inner computations. Disposed functions will retain
 * their current value but are no longer reactive.
 *
 * @see {@link https://github.com/maverick-js/observables#dispose}
 */
export function dispose(fn: () => void) {
  if (fn[DISPOSED]) return;

  if (fn[CHILDREN]) for (const node of fn[CHILDREN]) dispose(node);
  if (fn[OBSERVING]) for (const node of fn[OBSERVING]) node[OBSERVED_BY]?.delete(fn);
  if (fn[OBSERVED_BY]) for (const node of fn[OBSERVED_BY]) node[OBSERVING]?.delete(fn);

  emptyDisposal(fn);
  fn[SCOPE]?.[CHILDREN]?.delete(fn);
  fn[SCOPE] = undefined;
  fn[CHILDREN]?.clear();
  fn[CHILDREN] = undefined;
  fn[OBSERVING]?.clear();
  fn[OBSERVING] = undefined;
  fn[OBSERVED_BY]?.clear();
  fn[OBSERVED_BY] = undefined;
  fn[DISPOSAL] = undefined;
  fn[CONTEXT] = undefined;
  fn[DISPOSED] = true;
}

function compute<T>(scope: () => void, node: () => T, observer: () => void = scope): T {
  const prevScope = currentScope;
  const prevObserver = currentObserver;

  currentScope = scope;
  currentObserver = observer;
  if (__DEV__) computeStack.push(scope);

  const nextValue = node();

  currentScope = prevScope;
  currentObserver = prevObserver;
  if (__DEV__) computeStack.pop();

  return nextValue;
}

function lookup(node: Node | undefined, key: string | symbol): any {
  let current = node,
    value;

  while (current) {
    value = current[CONTEXT]?.[key];
    if (value !== undefined) return value;
    current = current[SCOPE];
  }
}

function adopt(node: Node, scope = currentScope) {
  if (!scope) return;
  node[SCOPE] = scope;
  (scope[CHILDREN] ??= new Set()).add(node);
}

function observe(observable: Node, observer: Node) {
  if (observable[DISPOSED] || observer[DISPOSED]) return;
  (observable[OBSERVED_BY] ??= new Set()).add(observer);
  (observer[OBSERVING] ??= new Set()).add(observable);
}

function dirtyNode(node: Node) {
  if (!node[OBSERVED_BY]) return;
  for (const observer of node[OBSERVED_BY]) {
    if (!observer[COMPUTED] || observer === currentObserver) continue;
    observer[DIRTY] = true;
    _scheduler.enqueue(() => {
      try {
        observer();
      } catch (error) {
        handleError(observer, error);
      }
    });
  }
}

function emptyDisposal(node: Node) {
  if (!node[DISPOSAL]) return;
  for (const dispose of node[DISPOSAL]) dispose();
  node[DISPOSAL].clear();
}

function notEqual(a: unknown, b: unknown) {
  return a !== b;
}

function handleError(node: () => void, error: unknown) {
  const handlers = lookup(node, ERROR);
  if (!handlers) throw error;
  try {
    for (const handler of handlers) handler(error);
  } catch (error) {
    handleError(node[SCOPE], error);
  }
}
