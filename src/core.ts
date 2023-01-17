import { SCOPE } from './symbols';
import type {
  Callable,
  Computation,
  ComputedSignalOptions,
  Dispose,
  MaybeDisposable,
  Scope,
} from './types';

let scheduledEffects = false,
  runningEffects = false,
  currentScope: Scope | null = null,
  currentObserver: Computation | null = null,
  currentObservers: Computation[] | null = null,
  currentObserversIndex = 0,
  effects: Computation[] = [];

const NOOP = () => {},
  HANDLERS = Symbol(__DEV__ ? 'ERROR_HANDLERS' : 0),
  // For more information about this graph tracking scheme see Reactively:
  // https://github.com/modderme123/reactively/blob/main/packages/core/src/core.ts#L21
  STATE_CLEAN = 0,
  STATE_CHECK = 1,
  STATE_DIRTY = 2,
  STATE_DISPOSED = 3;

function flushEffects() {
  scheduledEffects = true;
  queueMicrotask(runEffects);
}

function runEffects() {
  if (!effects.length) {
    scheduledEffects = false;
    return;
  }

  runningEffects = true;

  for (let i = 0; i < effects.length; i++) {
    // If parent scope is dirty it means that this effect will be disposed of so we skip.
    if (!isZombie(effects[i])) read.call(effects[i]);
  }

  effects = [];
  scheduledEffects = false;
  runningEffects = false;
}

/**
 * Creates a computation root which is given a `dispose()` function to dispose of all inner
 * computations.
 *
 * @see {@link https://github.com/maverick-js/signals#root}
 */
export function root<T>(init: (dispose: Dispose) => T): T {
  const scope = createScope();
  return compute(scope, !init.length ? init : init.bind(null, dispose.bind(scope)), null) as T;
}

/**
 * Returns the current value stored inside the given compute function without triggering any
 * dependencies. Use `untrack` if you want to also disable scope tracking.
 *
 * @see {@link https://github.com/maverick-js/signals#peek}
 */
export function peek<T>(compute: () => T): T {
  const prev = currentObserver;
  currentObserver = null;
  const result = compute();
  currentObserver = prev;
  return result;
}

/**
 * Returns the current value inside a signal whilst disabling both scope _and_ observer
 * tracking. Use `peek` if only observer tracking should be disabled.
 *
 * @see {@link https://github.com/maverick-js/signals#untrack}
 */
export function untrack<T>(compute: () => T): T {
  const prev = currentScope;
  currentScope = null;
  const result = peek(compute);
  currentScope = prev;
  return result;
}

/**
 * By default, signal updates are batched on the microtask queue which is an async process. You can
 * flush the queue synchronously to get the latest updates by calling `tick()`.
 *
 * @see {@link https://github.com/maverick-js/signals#tick}
 */
export function tick(): void {
  if (!runningEffects) runEffects();
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
 * Runs the given function in the given scope so context and error handling continue to work.
 *
 * @see {@link https://github.com/maverick-js/signals#scoped}
 */
export function scoped(run: Callable, scope: Scope | null): void {
  try {
    compute(scope, run, null);
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
  if (!context[HANDLERS]) context[HANDLERS] = [handler];
  else (context[HANDLERS] as any[]).push(handler);
}

/**
 * Runs the given function when the parent scope computation is being disposed.
 *
 * @see {@link https://github.com/maverick-js/signals#ondispose}
 */
export function onDispose(disposable: MaybeDisposable): Dispose {
  if (!disposable || !currentScope) return (disposable as Dispose) || NOOP;

  const node = currentScope;

  if (!node._disposal) {
    node._disposal = disposable;
  } else if (Array.isArray(node._disposal)) {
    node._disposal.push(disposable);
  } else {
    node._disposal = [node._disposal, disposable];
  }

  return function removeDispose() {
    if (node._state === STATE_DISPOSED) return;
    disposable.call(null);
    if (isFunction(node._disposal)) {
      node._disposal = null;
    } else if (Array.isArray(node._disposal)) {
      node._disposal.splice(node._disposal.indexOf(disposable), 1);
    }
  };
}

let scopes: Scope[] = [];

export function dispose(this: Scope, self = true) {
  if (this._state === STATE_DISPOSED) return;

  let current = (self ? this : this._nextSibling) as Computation | null,
    head = self ? this._prevSibling : this;

  if (current) {
    scopes.push(this);
    do {
      if (current._disposal) emptyDisposal(current);
      if (current._sources) removeSourceObservers(current, 0);
      current[SCOPE] = null;
      current._sources = null;
      current._observers = null;
      current._prevSibling = null;
      current._context = null;
      current._state = STATE_DISPOSED;
      scopes.push(current);
      current = current._nextSibling as Computation | null;
      if (current && current._prevSibling) current._prevSibling._nextSibling = null;
    } while (current && scopes.includes(current[SCOPE]!));
  }

  if (head) head._nextSibling = current;
  if (current) current._prevSibling = head;
  scopes = [];
}

function emptyDisposal(scope: Computation) {
  try {
    if (Array.isArray(scope._disposal)) {
      for (let i = 0; i < scope._disposal.length; i++) {
        const callable = scope._disposal![i];
        callable.call(callable);
      }
    } else {
      scope._disposal!.call(scope._disposal);
    }

    scope._disposal = null;
  } catch (error) {
    handleError(scope, error);
  }
}

export function compute<Result>(
  scope: Scope | null,
  compute: Callable<Scope | null, Result>,
  observer: Computation | null,
): Result {
  const prevScope = currentScope,
    prevObserver = currentObserver;

  currentScope = scope;
  currentObserver = observer;

  try {
    return compute.call(scope);
  } finally {
    currentScope = prevScope;
    currentObserver = prevObserver;
  }
}

function lookup(scope: Scope | null, key: string | symbol): any {
  if (!scope) return;

  let current: Scope | null = scope,
    value;

  while (current) {
    value = current._context?.[key];
    if (value !== undefined) return value;
    current = current[SCOPE];
  }
}

function handleError(scope: Scope | null, error: unknown, depth?: number) {
  const handlers = lookup(scope, HANDLERS);

  if (!handlers) throw error;

  try {
    const coercedError = error instanceof Error ? error : Error(JSON.stringify(error));
    for (const handler of handlers) handler(coercedError);
  } catch (error) {
    handleError(scope![SCOPE], error);
  }
}

export function read(this: Computation): any {
  if (this._state === STATE_DISPOSED) return this._value;

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

  if (this._compute) shouldUpdate(this);

  return this._value;
}

export function write(this: Computation, newValue: any): any {
  const value = isFunction(newValue) ? newValue(this._value) : newValue;

  if (this._changed(this._value, value)) {
    this._value = value;
    if (this._observers) {
      for (let i = 0; i < this._observers.length; i++) {
        notify(this._observers[i], STATE_DIRTY);
      }
    }
  }

  return this._value;
}

const ScopeNode = function Scope(this: Scope) {
  this[SCOPE] = currentScope;
  this._state = STATE_CLEAN;
  this._nextSibling = null;
  this._prevSibling = currentScope;
  if (currentScope) currentScope.append(this);
};

const ScopeProto = ScopeNode.prototype;
ScopeProto._context = null;
ScopeProto._compute = null;
ScopeProto._disposal = null;

ScopeProto.append = function appendScope(scope: Scope) {
  if (this._nextSibling) this._nextSibling._prevSibling = scope;
  scope._nextSibling = this._nextSibling;
  this._nextSibling = scope;
};

export function createScope(): Scope {
  return new ScopeNode();
}

const ComputeNode = function Computation(
  this: Computation,
  initialValue,
  compute,
  options?: ComputedSignalOptions<any, any>,
) {
  ScopeNode.call(this);

  this._state = compute ? STATE_DIRTY : STATE_CLEAN;
  this._scoped = false;
  this._init = false;
  this._sources = null;
  this._observers = null;
  this._value = initialValue;

  if (__DEV__) this.id = options?.id ?? (this._compute ? 'computed' : 'signal');

  if (compute) this._compute = compute;

  if (options) {
    if (options.scoped) this._scoped = true;
    if (options.dirty) this._changed = options.dirty;
  }
};

const ComputeProto: Computation = ComputeNode.prototype;
Object.setPrototypeOf(ComputeProto, ScopeProto);
ComputeProto._changed = isNotEqual;
ComputeProto.call = read;

export function createComputation<T>(
  initialValue: T,
  compute: (() => T) | null,
  options?: ComputedSignalOptions<T>,
): Computation<T> {
  return new ComputeNode(initialValue, compute, options);
}

export function isNotEqual(a: unknown, b: unknown) {
  return a !== b;
}

export function isFunction(value: unknown): value is Function {
  return typeof value === 'function';
}

export function isZombie(node: Scope) {
  let scope = node[SCOPE];

  while (scope) {
    // We're looking for a dirty parent effect scope.
    if (scope._compute && scope._state === STATE_DIRTY) return true;
    scope = scope[SCOPE];
  }

  return false;
}

function shouldUpdate(node: Computation) {
  if (node._state === STATE_CHECK) {
    for (let i = 0; i < node._sources!.length; i++) {
      shouldUpdate(node._sources![i]);
      if ((node._state as number) === STATE_DIRTY) {
        // Stop the loop here so we won't trigger updates on other parents unnecessarily
        // If our computation changes to no longer use some sources, we don't
        // want to update() a source we used last time, but now don't use.
        break;
      }
    }
  }

  if (node._state === STATE_DIRTY) update(node);
  else node._state = STATE_CLEAN;
}

function cleanup(node: Computation) {
  if (node._nextSibling && node._nextSibling[SCOPE] === node) dispose.call(node, false);
  if (node._disposal) emptyDisposal(node);
  if (node._context && node._context[HANDLERS]) (node._context[HANDLERS] as any[]) = [];
}

function update(node: Computation) {
  let prevObservers = currentObservers,
    prevObserversIndex = currentObserversIndex;

  currentObservers = null as Computation[] | null;
  currentObserversIndex = 0;

  try {
    if (node._scoped) cleanup(node);

    const result = compute(node._scoped ? node : currentScope, node._compute!, node);

    if (currentObservers) {
      if (node._sources) removeSourceObservers(node, currentObserversIndex);

      if (node._sources && currentObserversIndex > 0) {
        node._sources.length = currentObserversIndex + currentObservers.length;
        for (let i = 0; i < currentObservers.length; i++) {
          node._sources[currentObserversIndex + i] = currentObservers[i];
        }
      } else {
        node._sources = currentObservers;
      }

      let source: Computation;
      for (let i = currentObserversIndex; i < node._sources.length; i++) {
        source = node._sources[i];
        if (!source._observers) source._observers = [node];
        else source._observers.push(node);
      }
    } else if (node._sources && currentObserversIndex < node._sources.length) {
      removeSourceObservers(node, currentObserversIndex);
      node._sources.length = currentObserversIndex;
    }

    if (!node._scoped && node._init) {
      write.call(node, result);
    } else {
      node._value = result;
      node._init = true;
    }
  } catch (error) {
    if (__DEV__ && !__TEST__ && !node._init && typeof node._value === 'undefined') {
      console.error(
        `computed \`${node.id}\` threw error during first run, this can be fatal.` +
          '\n\nSolutions:\n\n' +
          '1. Set the `initial` option to silence this error',
        '\n2. Or, use an `effect` if the return value is not being used',
        '\n\n',
        error,
      );
    }

    handleError(node, error);

    if (node._scoped) cleanup(node);
    if (node._sources) removeSourceObservers(node, 0);

    return;
  }

  currentObservers = prevObservers;
  currentObserversIndex = prevObserversIndex;

  node._state = STATE_CLEAN;
}

function notify(node: Computation, state: number) {
  if (node._state >= state) return;

  if (node._scoped && node._state === STATE_CLEAN) {
    effects.push(node);
    if (!scheduledEffects) flushEffects();
  }

  node._state = state;
  if (node._observers) {
    for (let i = 0; i < node._observers.length; i++) {
      notify(node._observers[i], STATE_CHECK);
    }
  }
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
