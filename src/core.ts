import { SCOPE } from './symbols';
import type {
  Callable,
  Computation,
  ComputedSignalOptions,
  Disposable,
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
  defaultContext = {};

let effects: Computation[] = [];

const NOOP = () => {},
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

  let i = 0,
    error: unknown,
    hasError = false;

  // Effects can be pushed while flushing (e.g., a write inside an effect) - the loop picks them
  // up. The try/catch sits outside the hot loop and re-enters it after a failing effect so a
  // single error can't wedge the scheduler; the first error is rethrown once the queue is drained.
  while (i < effects.length) {
    try {
      for (; i < effects.length; i++) {
        const effect = effects[i];
        if (effect._state !== STATE_CLEAN && effect._state !== STATE_DISPOSED) runTop(effect);
      }
    } catch (e) {
      if (!hasError) {
        hasError = true;
        error = e;
      }
      i++; // skip the effect that threw and keep flushing.
    }
  }

  effects = [];
  scheduledEffects = false;
  runningEffects = false;

  if (hasError) throw error;
}

function runTop(node: Computation) {
  let ancestors: Computation[] | null = null;

  for (let parent = node[SCOPE] as Computation | null; parent; parent = parent[SCOPE] as any) {
    if (parent._effect && parent._state !== STATE_CLEAN && parent._state !== STATE_DISPOSED) {
      if (!ancestors) ancestors = [parent];
      else ancestors.push(parent);
    }
  }

  // Run dirty parent effects first, they may dispose of this node.
  if (ancestors) {
    for (let i = ancestors.length - 1; i >= 0; i--) updateCheck(ancestors[i]);
  }

  updateCheck(node);
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
 * dependencies. Use `unscope` if you want to also disable scope tracking.
 *
 * @see {@link https://github.com/maverick-js/signals#peek}
 */
export function peek<T>(fn: () => T): T {
  return compute<T>(currentScope, fn, null);
}

/**
 * Runs the given function outside of the current scope whilst also disabling observer tracking.
 * Computations created inside are orphans (they have no parent scope), and no dependencies are
 * tracked. Use `peek` if only observer tracking should be disabled.
 *
 * @see {@link https://github.com/maverick-js/signals#unscope}
 */
export function unscope<T>(fn: () => T): T {
  return compute<T>(null, fn, null);
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
export function scoped<T>(run: () => T, scope: Scope | null): T | undefined {
  try {
    return compute<T>(scope, run, null);
  } catch (error) {
    handleError(scope, error);
    return; // TS -_-
  }
}

/**
 * Attempts to get a context value for the given key. It will start from the parent scope and
 * walk up the computation tree trying to find a context record and matching key. If no value can
 * be found `undefined` will be returned.
 *
 * @see {@link https://github.com/maverick-js/signals#getcontext}
 */
export function getContext<T>(
  key: string | symbol,
  scope: Scope | null = currentScope,
): T | undefined {
  return scope?._context![key] as T | undefined;
}

/**
 * Attempts to set a context value on the parent scope with the given key. This will be a no-op if
 * no parent is defined.
 *
 * @see {@link https://github.com/maverick-js/signals#setcontext}
 */
export function setContext<T>(key: string | symbol, value: T, scope: Scope | null = currentScope) {
  if (scope) scope._context = { ...scope._context, [key]: value };
}

/**
 * Runs the given function when an error is thrown in a child scope. If the error is thrown again
 * inside the error handler, it will trigger the next available parent scope handler.
 *
 * @see {@link https://github.com/maverick-js/signals#onerror}
 */
export function onError<T = Error>(handler: (error: T) => void): void {
  if (!currentScope) return;
  if (!currentScope._handlers) currentScope._handlers = [handler];
  else currentScope._handlers.push(handler);
}

/**
 * Runs the given function when the parent scope computation is being disposed.
 *
 * @see {@link https://github.com/maverick-js/signals#ondispose}
 */
export function onDispose(disposable: MaybeDisposable): Dispose {
  if (!disposable || !currentScope) return (disposable as Dispose) || NOOP;

  const node = currentScope;

  // The scope was disposed during its own computation (e.g., an effect stopping itself) - run
  // the disposable now so it can't leak.
  if (node._state === STATE_DISPOSED) {
    disposable.call(disposable);
    return NOOP;
  }

  addDisposable(node, disposable);

  return function removeDispose() {
    const disposal = node._disposal;

    if (disposal === disposable) {
      node._disposal = null;
    } else if (Array.isArray(disposal)) {
      const index = disposal.indexOf(disposable);
      if (index === -1) return; // already ran or removed.
      disposal.splice(index, 1);
    } else {
      return; // already ran (scope re-ran or was disposed).
    }

    disposable.call(disposable);
  };
}

function addDisposable(node: Scope, disposable: Disposable) {
  if (!node._disposal) {
    node._disposal = disposable;
  } else if (Array.isArray(node._disposal)) {
    node._disposal.push(disposable);
  } else {
    node._disposal = [node._disposal, disposable];
  }
}

/**
 * Disposes of the given scope. When `self` is `false` only the children are disposed of (the
 * scope itself is kept alive so it can be re-used).
 */
export function dispose(this: Scope, self = true) {
  if (this._state === STATE_DISPOSED) return;

  if (self) {
    const parent = this[SCOPE];
    if (parent) removeChild(parent, this);
    disposeNode(this as Computation);
  } else if (this._children) {
    disposeChildren(this);
  }
}

function removeChild(parent: Scope, child: Scope) {
  const children = parent._children;
  if (children === child) {
    parent._children = null;
  } else if (Array.isArray(children)) {
    const index = children.indexOf(child);
    if (index > -1) children.splice(index, 1);
  }
}

function disposeChildren(scope: Scope) {
  const children = scope._children!;

  // Detach the whole list up-front so children don't pay to remove themselves one by one.
  scope._children = null;

  if (Array.isArray(children)) {
    for (let i = children.length - 1; i >= 0; i--) disposeNode(children[i] as Computation);
  } else {
    disposeNode(children as Computation);
  }
}

/**
 * Disposes of the given node and all of its children _without_ detaching it from its parent.
 * Callers that own the parent's children list must clean it up themselves (see
 * `removeDisposedChildren`).
 */
export function disposeNode(node: Computation) {
  if (node._state === STATE_DISPOSED) return;

  node._state = STATE_DISPOSED;

  try {
    if (node._children) disposeChildren(node);
    if (node._disposal) emptyDisposal(node);
  } finally {
    if (node._sources) removeSourceObservers(node, 0);
    node[SCOPE] = null;
    node._sources = null;
    node._observers = null;
    node._context = defaultContext;
    node._handlers = null;
  }
}

/**
 * Removes all disposed nodes from the given scope's children list in a single pass. Used by
 * callers that dispose of many children via `disposeNode` (which does not detach).
 */
export function removeDisposedChildren(scope: Scope) {
  const children = scope._children;
  if (Array.isArray(children)) {
    let live = 0;
    for (let i = 0; i < children.length; i++) {
      if (children[i]._state !== STATE_DISPOSED) children[live++] = children[i];
    }
    children.length = live;
  } else if (children && children._state === STATE_DISPOSED) {
    scope._children = null;
  }
}

function emptyDisposal(scope: Computation) {
  const disposal = scope._disposal!;

  // Clear before running so a throwing disposable can't be re-run on the next cleanup, and so
  // disposables registered while disposing don't get lost.
  scope._disposal = null;

  if (Array.isArray(disposal)) {
    for (let i = disposal.length - 1; i >= 0; i--) callDisposable(scope, disposal[i]);
  } else {
    callDisposable(scope, disposal);
  }
}

function callDisposable(scope: Scope, disposable: Disposable) {
  try {
    disposable.call(disposable);
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

function handleError(scope: Scope | null, error: unknown) {
  let currentError = error;

  // Walk up the scope tree trying each scope's own handlers (newest first). A handler that throws
  // forwards the (possibly new) error to the next handler.
  for (let node = scope; node; node = node[SCOPE]) {
    const handlers = node._handlers;
    if (!handlers) continue;
    for (let i = handlers.length - 1; i >= 0; i--) {
      try {
        handlers[i](currentError);
        return; // handled.
      } catch (error) {
        currentError = error;
      }
    }
  }

  throw currentError;
}

export function read(this: Computation): any {
  if (this._state === STATE_DISPOSED) return this._value;

  if (currentObserver && !this._effect) {
    if (
      !currentObservers &&
      currentObserver._sources &&
      currentObserver._sources[currentObserversIndex] == this
    ) {
      currentObserversIndex++;
    } else if (!currentObservers) currentObservers = [this];
    else currentObservers.push(this);
  }

  if (this._compute) updateCheck(this);

  return this._value;
}

/**
 * Write API exposed on signals: accepts a value or an updater function `(prev) => next`.
 */
export function write(this: Computation, newValue: any): any {
  const value = isFunction(newValue) ? newValue(this._value) : newValue;

  if (this._changed(this._value, value)) {
    this._value = value;
    const observers = this._observers;
    if (observers) {
      for (let i = 0; i < observers.length; i++) notify(observers[i], STATE_DIRTY);
    }
  }

  return this._value;
}

/**
 * Sets the value of the given node _as-is_ (functions are stored, not invoked) and notifies
 * observers if it changed.
 */
export function setValue<T>(node: Computation<T>, value: T): T {
  if (node._changed(node._value, value)) {
    node._value = value;
    const observers = node._observers;
    if (observers) {
      for (let i = 0; i < observers.length; i++) notify(observers[i], STATE_DIRTY);
    }
  }

  return node._value;
}

const ScopeNode = function Scope(this: Scope) {
  this[SCOPE] = null;
  this._state = STATE_CLEAN;
  this._children = null;
  this._context = defaultContext;
  this._handlers = null;
  this._disposal = null;
  if (currentScope) currentScope.append(this);
};

const ScopeProto = ScopeNode.prototype;

ScopeProto.append = function (this: Scope, child: Scope) {
  child[SCOPE] = this;

  if (!this._children) {
    this._children = child;
  } else if (Array.isArray(this._children)) {
    this._children.push(child);
  } else {
    this._children = [this._children, child];
  }

  if (child._context !== this._context) {
    child._context =
      child._context === defaultContext ? this._context : { ...this._context, ...child._context };
  }
};

ScopeProto.dispose = function (this: Scope) {
  dispose.call(this);
};

export function createScope(): Scope {
  return new ScopeNode();
}

/**
 * Plain signals are not scopes: they run no code, so they have no parent, children, context or
 * disposal and are never owned by a root. They use a much smaller node and a cheaper read path.
 */
const SignalNode = function Signal(
  this: Computation,
  initialValue,
  options?: ComputedSignalOptions<any, any>,
) {
  this._value = initialValue;
  this._observers = null;
  this._mark = 0;
  if (__DEV__) this.id = options?.id ?? 'signal';
  if (options && options.dirty) this._changed = options.dirty;
};

const SignalProto = SignalNode.prototype;
SignalProto._changed = isNotEqual;
// Read by `updateCheck` when walking sources - a prototype hit keeps that check cheap.
SignalProto._compute = null;

export function createSignal<T>(
  initialValue: T,
  options?: ComputedSignalOptions<T>,
): Computation<T> {
  return new SignalNode(initialValue, options);
}

export function readSignal(this: Computation): any {
  if (currentObserver) {
    if (
      !currentObservers &&
      currentObserver._sources &&
      currentObserver._sources[currentObserversIndex] === this
    ) {
      currentObserversIndex++;
    } else if (!currentObservers) currentObservers = [this];
    else currentObservers.push(this);
  }

  return this._value;
}

const ComputeNode = function Computation(
  this: Computation,
  initialValue,
  compute,
  options?: ComputedSignalOptions<any, any>,
) {
  ScopeNode.call(this);

  this._state = compute ? STATE_DIRTY : STATE_CLEAN;
  this._init = false;
  this._effect = false;
  this._sources = null;
  this._observers = null;
  this._mark = 0;
  this._value = initialValue;
  this._compute = compute || null;

  if (__DEV__) this.id = options?.id ?? (compute ? 'computed' : 'signal');
  if (options && options.dirty) this._changed = options.dirty;
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

function updateCheck(node: Computation) {
  if (node._state === STATE_CHECK) {
    const sources = node._sources!;
    for (let i = 0; i < sources.length; i++) {
      // Plain signals are never dirty, only computations need checking.
      if (sources[i]._compute) updateCheck(sources[i]);
      if ((node._state as number) === STATE_DIRTY) {
        // Stop the loop here so we won't trigger updates on other parents unnecessarily
        // If our computation changes to no longer use some sources, we don't
        // want to update() a source we used last time, but now don't use.
        break;
      }
    }
  }

  if (node._state === STATE_DIRTY) update(node);
  // Only a node that was being checked transitions back to clean - never a disposed one.
  else if (node._state === STATE_CHECK) node._state = STATE_CLEAN;
}

function cleanup(node: Computation) {
  if (node._children) disposeChildren(node);
  if (node._disposal) emptyDisposal(node);
  node._handlers = null;
}

export function update(node: Computation) {
  let prevObservers = currentObservers,
    prevObserversIndex = currentObserversIndex;

  currentObservers = null as Computation[] | null;
  currentObserversIndex = 0;

  try {
    cleanup(node);

    const result = compute(node, node._compute!, node);

    if (node._effect) {
      // Effects may return a disposer that runs before the next run and on disposal.
      if (isFunction(result)) {
        if (node._state === STATE_DISPOSED) result.call(result);
        else addDisposable(node, result);
      }
    }

    // The node may have been disposed during its own computation (e.g., an effect stopping
    // itself) - don't re-link it into the graph.
    if (node._state === STATE_DISPOSED) return;

    updateObservers(node);

    if (!node._effect) {
      if (node._init) setValue(node, result);
      else {
        node._value = result;
        node._init = true;
      }
    }
  } catch (error) {
    if (__DEV__ && !__TEST__ && !node._init && typeof node._value === 'undefined') {
      console.error(
        `computed \`${node.id}\` threw error during first run, this can be fatal.` +
          '\n\nSolutions:\n\n' +
          '1. Set the `initial` option to silence this error' +
          '\n2. Or, use an `effect` if the return value is not being used' +
          '\n\n',
        error,
      );
    }

    if (node._state !== STATE_DISPOSED) updateObservers(node);
    handleError(node, error);
  } finally {
    currentObservers = prevObservers;
    currentObserversIndex = prevObserversIndex;
    if (node._state !== STATE_DISPOSED) node._state = STATE_CLEAN;
  }
}

function updateObservers(node: Computation) {
  const sources = node._sources,
    index = currentObserversIndex,
    added = currentObservers;

  if (added) {
    if (sources && index < sources.length) {
      // Divergent run: the sources read after `index` differ from last time. Diff the old and new
      // suffix so edges that survive are kept as-is instead of being unsubscribed (an indexOf on
      // each source's observer list) and re-subscribed. Marks are counters so duplicate reads keep
      // their exact edge counts, and passes never interleave so no identity is needed.
      for (let i = index; i < sources.length; i++) sources[i]._mark++;

      for (let i = 0; i < added.length; i++) {
        const source = added[i];
        if (source._mark > 0) source._mark--;
        else addObserver(source, node);
      }

      for (let i = index; i < sources.length; i++) {
        const source = sources[i];
        if (source._mark > 0) {
          source._mark--;
          removeObserver(source, node);
        }
      }

      sources.length = index + added.length;
      for (let i = 0; i < added.length; i++) sources[index + i] = added[i];
    } else {
      // Only additions: first run, or every previous source was re-read in the same order.
      for (let i = 0; i < added.length; i++) addObserver(added[i], node);
      if (sources) {
        for (let i = 0; i < added.length; i++) sources.push(added[i]);
      } else {
        node._sources = added;
      }
    }
  } else if (sources && index < sources.length) {
    // Only removals: the tail of the previous sources was not read this time.
    removeSourceObservers(node, index);
    sources.length = index;
  }
}

function addObserver(source: Computation, node: Computation) {
  if (!source._observers) source._observers = [node];
  else source._observers.push(node);
}

function removeObserver(source: Computation, node: Computation) {
  const observers = source._observers;
  if (!observers) return;
  // Nodes are usually disposed in reverse creation order (and most sources have a single
  // observer), so the node is almost always in the last slot - check it before searching.
  let index = observers.length - 1;
  if (observers[index] !== node) index = observers.indexOf(node);
  if (index > -1) {
    observers[index] = observers[observers.length - 1];
    observers.pop();
  }
}

function notify(node: Computation, state: number) {
  if (node._state >= state) return;

  if (node._effect && node._state === STATE_CLEAN) {
    effects.push(node);
    if (!scheduledEffects) flushEffects();
  }

  node._state = state;

  const observers = node._observers;
  if (observers) {
    for (let i = 0; i < observers.length; i++) notify(observers[i], STATE_CHECK);
  }
}

function removeSourceObservers(node: Computation, index: number) {
  const sources = node._sources!;
  for (let i = index; i < sources.length; i++) removeObserver(sources[i], node);
}
