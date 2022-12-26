import { createScheduler, type Scheduler } from './scheduler';
import { FLAGS, HANDLERS, SCOPE } from './symbols';
import type {
  ComputedSignalOptions,
  Dispose,
  Effect,
  MaybeDispose,
  MaybeSignal,
  ReadSignal,
  SignalOptions,
  WriteSignal,
  StopEffect,
  Scope,
  SelectorSignal,
  Computation,
} from './types';

let i = 0,
  effects: Computation[] = [],
  currentScope: Computation | null = null,
  currentObserver: Computation | null = null,
  currentObservers: Computation[] | null = null,
  currentObserversIndex = 0;

const SCHEDULER = createScheduler(),
  NOOP = () => {},
  FLAGS_DIRTY = 1 << 0,
  FLAGS_SCOPED = 1 << 1,
  FLAGS_INIT = 1 << 2,
  FLAGS_DISPOSED = 1 << 3;

SCHEDULER.onFlush(function flushEffects() {
  let effect: Computation;

  for (let i = 0; i < effects.length; i++) {
    effect = effects[i];
    // If parent scope is dirty it means that this effect will be disposed of so we skip.
    if (!effect[SCOPE] || !(effect[SCOPE]![FLAGS] & FLAGS_DIRTY)) read.call(effect);
  }

  effects = effects.slice(i);
});

// These are used only for debugging to determine how a cycle occurred.
let callStack: Computation[];
let computeStack: Computation[];

if (__DEV__) {
  callStack = [];
  computeStack = [];
  SCHEDULER.onFlush(() => {
    callStack.length = 0;
  });
}

/**
 * Creates a computation root which is given a `dispose()` function to dispose of all inner
 * computations.
 *
 * @see {@link https://github.com/maverick-js/signals#root}
 */
export function root<T>(init: (dispose: Dispose) => T): T {
  const $root = {
    [SCOPE]: currentScope,
    _nextSibling: null,
    _prevSibling: null,
  } as Computation;

  if (currentScope) appendScope($root);

  return compute($root, () => init(() => dispose($root, true)));
}

/**
 * Returns the current value stored inside the given compute function without triggering any
 * dependencies. Use `untrack` if you want to also disable scope tracking.
 *
 * @see {@link https://github.com/maverick-js/signals#peek}
 */
export function peek<T>(compute: () => T): T {
  const prevObserver = currentObserver;

  currentObserver = null;
  const result = compute();
  currentObserver = prevObserver;

  return result;
}

/**
 * Returns the current value inside a signal whilst disabling both scope _and_ observer
 * tracking. Use `peek` if only observer tracking should be disabled.
 *
 * @see {@link https://github.com/maverick-js/signals#untrack}
 */
export function untrack<T>(compute: () => T): T {
  const prevScope = currentScope,
    prevObserver = currentObserver;

  currentScope = null;
  currentObserver = null;
  const result = compute();
  currentScope = prevScope;
  currentObserver = prevObserver;

  return result;
}

/**
 * Wraps the given value into a signal. The signal will return the current value when invoked
 * `fn()`, and provide a simple write API via `set()`. The value can now be observed
 * when used inside other computations created with `computed` and `effect`.
 *
 * @see {@link https://github.com/maverick-js/signals#signal}
 */
export function signal<T>(initialValue: T, options?: SignalOptions<T>): WriteSignal<T> {
  const node = createComputation<T>(initialValue, null, options),
    signal = read.bind(node) as WriteSignal<T>;

  if (__DEV__) signal.node = node;
  signal.set = write.bind(node);

  return signal;
}

/**
 * Whether the given value is a readonly signal.
 *
 * @see {@link https://github.com/maverick-js/signals#isreadsignal}
 */
export function isReadSignal<T>(fn: MaybeSignal<T>): fn is ReadSignal<T> {
  return isFunction(fn);
}

/**
 * Creates a new signal whose value is computed and returned by the given function. The given
 * compute function is _only_ re-run when one of it's dependencies are updated. Dependencies are
 * are all signals that are read during execution.
 *
 * @see {@link https://github.com/maverick-js/signals#computed}
 */
export function computed<T, R = never>(
  compute: () => T,
  options?: ComputedSignalOptions<T, R>,
): ReadSignal<T | R> {
  if (__DEV__) {
    const node = createComputation<T | R>(
      options?.initial as R,
      compute,
      options as ComputedSignalOptions<T | R>,
    );
    const signal = read.bind(node) as ReadSignal<T | R>;
    signal.node = node;
    return signal;
  } else {
    return read.bind(
      createComputation<T | R>(
        options?.initial as R,
        compute,
        options as ComputedSignalOptions<T | R>,
      ),
    ) as ReadSignal<T | R>;
  }
}

/**
 * Invokes the given function each time any of the signals that are read inside are updated
 * (i.e., their value changes). The effect is immediately invoked on initialization.
 *
 * @see {@link https://github.com/maverick-js/signals#effect}
 */
export function effect(effect: Effect, options?: { id?: string }): StopEffect {
  const signal = createComputation<null>(
    null,
    function runEffect() {
      let effectResult = effect();
      typeof effectResult === 'function' && onDispose(effectResult);
      return null;
    },
    __DEV__ ? { id: options?.id ?? 'effect' } : void 0,
  );

  signal[FLAGS] |= FLAGS_SCOPED;

  read.call(signal);

  return function stopEffect() {
    dispose(signal, true);
  };
}

/**
 * Takes in the given signal and makes it read only by removing access to write operations
 * (i.e., `set()`).
 *
 * @see {@link https://github.com/maverick-js/signals#readonly}
 */
export function readonly<T>(signal: ReadSignal<T>): ReadSignal<T> {
  if (__DEV__) {
    const readonly = (() => signal()) as ReadSignal<T>;
    readonly.node = signal.node;
    return readonly;
  } else {
    return (() => signal()) as ReadSignal<T>;
  }
}

/**
 * By default, signal updates are batched on the microtask queue which is an async process. You can
 * flush the queue synchronously to get the latest updates by calling `tick()`.
 *
 * @see {@link https://github.com/maverick-js/signals#tick}
 */
export function tick(): void {
  SCHEDULER.flushSync();
}

/**
 * Whether the given value is a write signal (i.e., can produce new values via write API).
 *
 * @see {@link https://github.com/maverick-js/signals#iswritesignal}
 */
export function isWriteSignal<T>(fn: MaybeSignal<T>): fn is WriteSignal<T> {
  return isReadSignal(fn) && 'set' in fn;
}

/**
 * Returns the currently executing parent scope.
 *
 * @see {@link https://github.com/maverick-js/signals#getscope}
 */
export function getScope(): Scope | null {
  return currentScope;
}

/**
 * Returns the global scheduler.
 *
 * @see {@link https://github.com/maverick-js/signals#getscheduler}
 */
export function getScheduler(): Scheduler {
  return SCHEDULER;
}

/**
 * Runs the given function in the given scope so context and error handling continue to work.
 *
 * @see {@link https://github.com/maverick-js/signals#scoped}
 */
export function scoped(run: () => void, scope: Scope | null): void {
  try {
    compute(scope, run);
  } catch (error) {
    handleError(scope, error);
  }
}

/**
 * Attempts to get a context value for the given key. It will start from the parent scope and
 * walk up the computation tree trying to find a context record and matching key. If no value can
 * be found `undefined` will be returned.
 *
 * @see {@link https://github.com/maverick-js/signals#getcontext}
 */
export function getContext<T>(key: string | symbol): T | undefined {
  return lookup(currentScope, key);
}

/**
 * Attempts to set a context value on the parent scope with the given key. This will be a no-op if
 * no parent is defined.
 *
 * @see {@link https://github.com/maverick-js/signals#setcontext}
 */
export function setContext<T>(key: string | symbol, value: T) {
  if (currentScope) (currentScope._context ??= {})[key] = value;
}

/**
 * Runs the given function when an error is thrown in a child scope. If the error is thrown again
 * inside the error handler, it will trigger the next available parent scope handler.
 *
 * @see {@link https://github.com/maverick-js/signals#onerror}
 */
export function onError<T = Error>(handler: (error: T) => void): void {
  if (!currentScope) return;
  const context = (currentScope._context ??= {});
  if (!context[HANDLERS]) context[HANDLERS] = [];
  (context[HANDLERS] as any[]).push(handler);
}

/**
 * Runs the given function when the parent scope computation is being disposed.
 *
 * @see {@link https://github.com/maverick-js/signals#ondispose}
 */
export function onDispose(dispose: MaybeDispose): Dispose {
  if (!dispose || !currentScope) return dispose || NOOP;

  const node = currentScope;
  if (!node._disposal) node._disposal = [];
  node._disposal.push(dispose);

  return function removeDispose() {
    if (node[FLAGS] & FLAGS_DISPOSED) return;
    dispose();
    node._disposal!.splice(node._disposal!.indexOf(dispose), 1);
  };
}

const scopes = new Set();

function dispose(scope: Computation, self = false) {
  if (scope[FLAGS] & FLAGS_DISPOSED) return;

  let current: Computation | null = self ? scope : scope._nextSibling,
    head = self ? scope._prevSibling : scope;

  if (current) {
    scopes.add(scope);
    do {
      if (current._disposal) emptyDisposal(current);
      if (current._sources) removeSourceObservers(current, 0);
      current[SCOPE] = null;
      current._sources = null;
      current._observers = null;
      current._prevSibling = null;
      current._context = null;
      current[FLAGS] |= FLAGS_DISPOSED;
      scopes.add(current);
      current = current._nextSibling;
      if (current) current._prevSibling!._nextSibling = null;
    } while (current && scopes.has(current[SCOPE]));
  }

  if (head) head._nextSibling = current;
  if (current) current._prevSibling = head;
  scopes.clear();
}

function emptyDisposal(scope: Computation) {
  try {
    for (i = 0; i < scope._disposal!.length; i++) scope._disposal![i]();
    scope._disposal!.length = 0;
  } catch (error) {
    handleError(scope, error);
  }
}

function compute<T>(scope: Computation | null, compute: () => T): T {
  let prevScope = currentScope;

  if (__DEV__ && currentObserver) computeStack.push(currentObserver);
  currentScope = scope;

  try {
    return compute();
  } finally {
    if (__DEV__ && currentObserver) computeStack.pop();
    currentScope = prevScope;
  }
}

function lookup(scope: Computation | null, key: string | symbol): any {
  if (!scope) return;

  let current: Computation | null = scope,
    value;

  while (current) {
    value = current._context?.[key];
    if (value !== undefined) return value;
    current = current[SCOPE];
  }
}

function handleError(scope: Computation | null, error: unknown, depth?: number) {
  const handlers = lookup(scope, HANDLERS);

  if (!handlers) throw error;

  try {
    const coercedError = error instanceof Error ? error : Error(JSON.stringify(error));
    for (const handler of handlers) handler(coercedError);
  } catch (error) {
    handleError(scope![SCOPE], error);
  }
}

/**
 * Creates a signal that observes the given `source` and returns a new signal who only notifies
 * observers when entering or exiting a specified key.
 */
export function selector<T>(source: ReadSignal<T>): SelectorSignal<T> {
  let prevKey: T | undefined,
    observers = new Map<T, Set<Computation<T>>>(),
    node = createComputation<T | undefined>(undefined, function selectorChange() {
      const currentKey = source();

      SCHEDULER.enqueueBatch((queue) => {
        for (const [key, nodes] of observers.entries()) {
          if (equal(key, currentKey) !== equal(key, prevKey)) {
            for (const node of nodes.values()) {
              node[FLAGS] |= FLAGS_DIRTY;
              queue.push(function dirtySignal() {
                read.call(node);
              });
            }
          }
        }
      });

      prevKey = currentKey;
      return currentKey;
    });

  read.call(node);

  return function observeSelector(key: T) {
    const observer = currentObserver;

    if (observer) {
      let nodes: Set<Computation<any>> | undefined;

      if ((nodes = observers.get(key))) nodes.add(observer);
      else observers.set(key, (nodes = new Set([observer])));

      onDispose(() => {
        nodes!.delete(observer);
        !nodes!.size && observers.delete(key);
      });
    }

    return equal(key, node._value);
  };
}

export function equal(a: unknown, b: unknown) {
  return a === b;
}

export function notEqual(a: unknown, b: unknown) {
  return a !== b;
}

export function isFunction(value: unknown): value is Function {
  return typeof value === 'function';
}

function createComputation<T>(
  initialValue: T,
  compute: (() => T) | null,
  options?: ComputedSignalOptions<T>,
): Computation<T> {
  const node = {
    [FLAGS]: FLAGS_DIRTY,
    [SCOPE]: currentScope,
    _nextSibling: null,
    _prevSibling: null,
    _context: null,
    _sources: null,
    _observers: null,
    _disposal: null,
    _value: initialValue,
    _compute: compute,
    _changed: notEqual,
  } as Computation;

  if (__DEV__) node.id = options?.id ?? (node._compute ? 'computed' : 'signal');
  if (currentScope) appendScope(node);
  if (options && options.scoped) node[FLAGS] |= FLAGS_SCOPED;
  if (options && options.dirty) node._changed = options.dirty;

  return node;
}

function read(this: Computation<any>): any {
  if (this[FLAGS] & FLAGS_DISPOSED) return this._value;

  if (__DEV__ && this._compute && computeStack.includes(this)) {
    const calls = callStack.map((c) => c.id ?? '?').join(' --> ');
    throw Error(`cyclic dependency detected\n\n${calls}\n`);
  }

  if (__DEV__) callStack.push(this);

  if (currentObserver) {
    if (
      !currentObservers &&
      currentObserver._sources &&
      currentObserver._sources[currentObserversIndex] == this
    ) {
      currentObserversIndex++;
    } else if (!currentObservers) currentObservers = [this];
    else currentObservers.push(this);
  }

  if (this._compute && this[FLAGS] & FLAGS_DIRTY) {
    let prevObserver = currentObserver,
      prevObservers = currentObservers,
      prevObserversIndex = currentObserversIndex;

    currentObserver = this;
    currentObservers = null as Computation[] | null;
    currentObserversIndex = 0;

    try {
      const scoped = this[FLAGS] & FLAGS_SCOPED;

      if (scoped) {
        if (this._nextSibling && this._nextSibling[SCOPE] === this) dispose(this);
        if (this._disposal) emptyDisposal(this);
        if (this._context && this._context[HANDLERS]) (this._context[HANDLERS] as any[]).length = 0;
      }

      const result = compute(scoped ? this : currentScope, this._compute);

      if (currentObservers) {
        if (this._sources) removeSourceObservers(this, currentObserversIndex);

        if (this._sources && currentObserversIndex > 0) {
          this._sources.length = currentObserversIndex + currentObservers.length;
          for (i = 0; i < currentObservers.length; i++) {
            this._sources[currentObserversIndex + i] = currentObservers[i];
          }
        } else {
          this._sources = currentObservers;
        }

        let source: Computation;
        for (i = currentObserversIndex; i < this._sources.length; i++) {
          source = this._sources[i];
          if (!source._observers) source._observers = [this];
          else source._observers.push(this);
        }
      } else if (this._sources && currentObserversIndex < this._sources.length) {
        removeSourceObservers(this, currentObserversIndex);
        this._sources.length = currentObserversIndex;
      }

      if (scoped || !(this[FLAGS] & FLAGS_INIT)) {
        this._value = result;
      } else {
        write.call(this, result);
      }
    } catch (error) {
      if (
        __DEV__ &&
        !__TEST__ &&
        !(this[FLAGS] & FLAGS_INIT) &&
        typeof this._value === 'undefined'
      ) {
        console.error(
          `computed \`${this.id}\` threw error during first run, this can be fatal.` +
            '\n\nSolutions:\n\n' +
            '1. Set the `initial` option to silence this error',
          '\n2. Or, use an `effect` if the return value is not being used',
          '\n\n',
          error,
        );
      }

      handleError(this, error);
      return this._value;
    }

    currentObserver = prevObserver;
    currentObservers = prevObservers;
    currentObserversIndex = prevObserversIndex;

    this[FLAGS] |= FLAGS_INIT;
    this[FLAGS] &= ~FLAGS_DIRTY;
  }

  return this._value;
}

function write(this: Computation<any>, newValue: any): void {
  const value = !isFunction(this._value) && isFunction(newValue) ? newValue(this._value) : newValue;

  if (this[FLAGS] & FLAGS_DISPOSED || !this._changed(this._value, value)) return;

  this._value = value;

  if (!this._observers) return;

  SCHEDULER.enqueueBatch((queue) => {
    for (i = 0; i < this._observers!.length; i++) {
      const observer = this._observers![i];
      if (observer._compute) {
        observer[FLAGS] |= FLAGS_DIRTY;
        if (observer[FLAGS] & FLAGS_SCOPED) {
          effects.push(observer);
        } else {
          queue.push(function dirtySignal() {
            read.call(observer);
          });
        }
      }
    }
  });
}

function removeSourceObservers(node: Computation, index: number) {
  let source: Computation, swap: number;
  for (let i = index; i < node._sources!.length; i++) {
    source = node._sources![i];
    if (source._observers) {
      swap = source._observers.indexOf(node);
      source._observers[swap] = source._observers[source._observers.length - 1];
      source._observers.pop();
    }
  }
}

function appendScope(node: Computation) {
  node._prevSibling = currentScope!;
  if (currentScope!._nextSibling) {
    const next = currentScope!._nextSibling;
    currentScope!._nextSibling = node;
    node._nextSibling = next;
    next._prevSibling = node;
  } else {
    currentScope!._nextSibling = node;
  }
}
