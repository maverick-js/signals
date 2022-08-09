import { createScheduler, type Scheduler } from '@maverick-js/scheduler';

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

const NOOP = () => {};

const PARENT = Symbol();
const OBSERVABLE = Symbol();
const COMPUTED = Symbol();
const DIRTY = Symbol();
const DISPOSED = Symbol();
const OBSERVERS = Symbol();
const CHILDREN = Symbol();
const DISPOSAL = Symbol();

const _scheduler = createScheduler();

let _parent: Node | undefined;
let _observer: Node | undefined;

// These are used only for debugging to determine how a cycle occurred.
let _callStack: Node[] = [];
let _computeStack: Node[] = [];

if (__DEV__) {
  _scheduler.onFlush(() => {
    _callStack = [];
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
  $root[PARENT] = _parent;
  return compute($root, () => fn(() => dispose($root)));
}

/**
 * Returns the current value stored inside an observable without triggering a dependency.
 *
 * @see {@link https://github.com/maverick-js/observables#peek}
 */
export function peek<T>(fn: () => T): T {
  const prev = _observer;

  _observer = undefined;
  const result = fn();
  _observer = prev;

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
    if (__DEV__) _callStack.push($observable);
    if (_observer) addObserver($observable, _observer);
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

  adoptChild($observable);

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
    if (__DEV__ && _computeStack.includes($computed)) {
      const calls = _callStack.map((c) => c.id ?? '?').join(' --> ');
      throw Error(`cyclic dependency detected\n\n${calls}\n`);
    }

    if (__DEV__) _callStack.push($computed);

    // Computed is observing another computed.
    if (_observer) addObserver($computed, _observer);

    if (!$computed[DISPOSED] && $computed[DIRTY]) {
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
    }

    return currentValue;
  };

  if (__DEV__) $computed.id = opts?.id ?? `computed`;

  // Starts off dirty because it hasn't run yet.
  $computed[DIRTY] = true;
  $computed[OBSERVABLE] = true;
  $computed[COMPUTED] = true;

  adoptChild($computed);

  return $computed;
}

/**
 * Runs the given function when the parent computation is being disposed.
 *
 * @see {@link https://github.com/maverick-js/observables#ondispose}
 */
export function onDispose(fn?: MaybeDispose): Dispose {
  const valid = fn && _parent;

  if (valid) addNode(_parent!, DISPOSAL, fn as Dispose);

  return valid
    ? () => {
        (fn as Dispose)();
        _parent![DISPOSAL]?.delete(fn as Dispose);
      }
    : NOOP;
}

/**
 * Unsubscribes the given observable and all inner computations. Disposed functions will retain
 * their current value but are no longer reactive.
 *
 * @see {@link https://github.com/maverick-js/observables#dispose}
 */
export function dispose(fn: () => void) {
  forEachChild(fn, (child) => {
    dispose(child);
    child[OBSERVERS]?.delete(fn);
  });

  emptyDisposal(fn);

  fn[CHILDREN] = undefined;
  fn[DISPOSAL] = undefined;
  fn[OBSERVERS] = undefined;
  fn[PARENT] = undefined;
  fn[DIRTY] = false;
  fn[DISPOSED] = true;
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
 * Returns the parent/owner of the given function. If no function is given it'll return the
 * currently executing parent. You can use this to walk up the computation tree.
 *
 * @see {@link https://github.com/maverick-js/observables#getparent}
 */
export function getParent(fn?: Observable<unknown>): Observable<unknown> | undefined {
  return !arguments.length ? _parent : fn?.[PARENT];
}

/**
 * Returns the global scheduler.
 *
 * @see {@link https://github.com/maverick-js/observables#getscheduler}
 */
export function getScheduler(): Scheduler {
  return _scheduler;
}

// Adapted from: https://github.com/solidjs/solid/blob/main/packages/solid/src/reactive/array.ts#L153
/**
 * Reactive map helper that caches each item by index to reduce unnecessary mapping on updates.
 * It only runs the mapping function once per item and adds/removes as needed. In a non-keyed map
 * like this the index is fixed but value can change (opposite of a keyed map).
 *
 * Prefer `computedKeyedMap` when referential checks are required.
 *
 * @see {@link https://github.com/maverick-js/observables#computedmap}
 */
export function computedMap<Item, MappedItem>(
  list: Observable<Maybe<readonly Item[]>>,
  map: (value: Observable<Item>, index: number) => MappedItem,
  options?: { id?: string },
): Observable<MappedItem[]> {
  let items: Item[] = [],
    mapped: MappedItem[] = [],
    disposal: Dispose[] = [],
    observables: ((v: any) => void)[] = [],
    i: number,
    len = 0;

  onDispose(() => runAll(disposal));

  return computed(() => {
    const newItems = list() || [];
    return peek(() => {
      if (newItems.length === 0) {
        if (len !== 0) {
          runAll(disposal);
          disposal = [];
          items = [];
          mapped = [];
          len = 0;
          observables = [];
        }

        return mapped;
      }

      for (i = 0; i < newItems.length; i++) {
        if (i < items.length && items[i] !== newItems[i]) {
          observables[i](newItems[i]);
        } else if (i >= items.length) {
          mapped[i] = root(mapper);
        }
      }

      for (; i < items.length; i++) disposal[i]();

      len = observables.length = disposal.length = newItems.length;
      items = newItems.slice(0);
      return (mapped = mapped.slice(0, len));
    });

    function mapper(dispose: () => void) {
      disposal[i] = dispose;
      const $o = observable(newItems[i]);
      observables[i] = $o.set;
      return map($o, i);
    }
  }, options);
}

// Adapted from: https://github.com/solidjs/solid/blob/main/packages/solid/src/reactive/array.ts#L16
/**
 * Reactive map helper that caches each list item by reference to reduce unnecessary mapping on
 * updates. It only runs the mapping function once per item and then moves or removes it as needed. In
 * a keyed map like this the value is fixed but the index changes (opposite of non-keyed map).
 *
 * Prefer `computedMap` when working with primitives to avoid unncessary re-renders.
 *
 * @see {@link https://github.com/maverick-js/observables#computedkeyedmap}
 */
export function computedKeyedMap<Item, MappedItem>(
  list: Observable<Maybe<readonly Item[]>>,
  map: (value: Item, index: Observable<number>) => MappedItem,
  options?: { id?: string },
): Observable<MappedItem[]> {
  let items: Item[] = [],
    mapping: MappedItem[] = [],
    disposal: Dispose[] = [],
    len = 0,
    indicies: ((v: number) => number)[] | null = map.length > 1 ? [] : null;

  onDispose(() => runAll(disposal));

  return computed(() => {
    let newItems = list() || [],
      i: number,
      j: number;

    return peek(() => {
      let newLen = newItems.length;

      // fast path for empty arrays
      if (newLen === 0) {
        if (len !== 0) {
          runAll(disposal);
          disposal = [];
          items = [];
          mapping = [];
          len = 0;
          indicies && (indicies = []);
        }
      }
      // fast path for new create
      else if (len === 0) {
        mapping = new Array(newLen);

        for (j = 0; j < newLen; j++) {
          items[j] = newItems[j];
          mapping[j] = root(mapper);
        }

        len = newLen;
      } else {
        let start: number,
          end: number,
          newEnd: number,
          item: Item,
          newIndices: Map<Item, number>,
          newIndicesNext: number[],
          temp: MappedItem[] = new Array(newLen),
          tempDisposal: (() => void)[] = new Array(newLen),
          tempIndicies: ((v: number) => number)[] = new Array(newLen);

        // skip common prefix
        for (
          start = 0, end = Math.min(len, newLen);
          start < end && items[start] === newItems[start];
          start++
        );

        // common suffix
        for (
          end = len - 1, newEnd = newLen - 1;
          end >= start && newEnd >= start && items[end] === newItems[newEnd];
          end--, newEnd--
        ) {
          temp[newEnd] = mapping[end];
          tempDisposal[newEnd] = disposal[end];
          indicies && (tempIndicies![newEnd] = indicies[end]);
        }

        // 0) prepare a map of all indices in newItems, scanning backwards so we encounter them in natural order
        newIndices = new Map<Item, number>();
        newIndicesNext = new Array(newEnd + 1);
        for (j = newEnd; j >= start; j--) {
          item = newItems[j];
          i = newIndices.get(item)!;
          newIndicesNext[j] = i === undefined ? -1 : i;
          newIndices.set(item, j);
        }

        // 1) step through all old items and see if they can be found in the new set; if so, save them in a temp array and mark them moved; if not, exit them
        for (i = start; i <= end; i++) {
          item = items[i];
          j = newIndices.get(item)!;
          if (j !== undefined && j !== -1) {
            temp[j] = mapping[i];
            tempDisposal[j] = disposal[i];
            indicies && (tempIndicies![j] = indicies[i]);
            j = newIndicesNext[j];
            newIndices.set(item, j);
          } else disposal[i]();
        }

        // 2) set all the new values, pulling from the temp array if copied, otherwise entering the new value
        for (j = start; j < newLen; j++) {
          if (j in temp) {
            mapping[j] = temp[j];
            disposal[j] = tempDisposal[j];
            if (indicies) {
              indicies[j] = tempIndicies![j];
              indicies[j](j);
            }
          } else mapping[j] = root(mapper);
        }

        // 3) in case the new set is shorter than the old, set the length of the mapped array
        mapping = mapping.slice(0, (len = newLen));

        // 4) save a copy of the mapped items for the next update
        items = newItems.slice(0);
      }

      return mapping;
    });

    function mapper(dispose: () => void) {
      disposal[j] = dispose;

      if (indicies) {
        const $i = observable(j);
        indicies[j] = (v) => {
          $i.set(v);
          return v;
        };
        return map(newItems[j], readonly($i));
      }

      return map(newItems[j], () => -1);
    }
  }, options);
}

type Node = {
  id?: string;
  (): any;
  [PARENT]?: Node;
  [OBSERVABLE]?: boolean;
  [COMPUTED]?: boolean;
  [DIRTY]?: boolean;
  [DISPOSED]?: boolean;
  [OBSERVERS]?: Set<Node>;
  [CHILDREN]?: Set<Node>;
  [DISPOSAL]?: Set<Dispose>;
};

function compute<T>(parent: () => void, child: () => T): T {
  const prevParent = _parent;
  const prevObserver = _observer;

  _parent = parent;
  _observer = parent;
  if (__DEV__) _computeStack.push(parent);

  const nextValue = child();

  _parent = prevParent;
  _observer = prevObserver;
  if (__DEV__) _computeStack.pop();

  return nextValue;
}

function adoptChild(child: Node) {
  if (_parent) {
    child[PARENT] = _parent;
    addNode(_parent, CHILDREN, child);
  }
}

function addObserver(observable: Node, observer: Node) {
  addNode(observable, OBSERVERS, observer);
}

function addNode(node: Node, key: symbol, item: () => void) {
  if (!node[DISPOSED]) (node[key] ??= new Set<() => void>()).add(item);
}

function dirtyNode(node: Node) {
  if (node[OBSERVERS] && !_scheduler.served(node)) {
    for (const observer of node[OBSERVERS]!) {
      if (observer[COMPUTED] && observer !== _observer) {
        observer[DIRTY] = true;
        _scheduler.enqueue(observer);
      }
    }
  }
}

function forEachChild(node: Node, callback: (node: Node) => void) {
  if (node[CHILDREN]) for (const child of node[CHILDREN]!) callback(child);
}

function emptyDisposal(node: Node) {
  if (node[DISPOSAL]) {
    for (const dispose of node[DISPOSAL]!) dispose();
    node[DISPOSAL]!.clear();
  }
}

function notEqual(a: unknown, b: unknown) {
  return a !== b;
}

function runAll(fns: (() => void)[]) {
  for (let i = 0; i < fns.length; i++) fns[i]();
}
