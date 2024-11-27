import { isFunction } from './computation';
import { NOOP, STATE_DISPOSED } from './constants';
import { handleError } from './error';
import { currentScope, defaultContext } from './scope';
import type { Computation, Dispose, MaybeDisposable, Scope } from './types';

export function dispose(this: Scope, self = true) {
  if (this._state === STATE_DISPOSED) return;

  let head = self ? this._prev : this,
    tail = this.walk(disposeNode);

  if (self) disposeNode(this);
  if (head) head._next = tail;
  if (tail) tail._prev = head;
}

export function disposeNode(node: Scope | Computation) {
  node._state = STATE_DISPOSED;
  node._parent = null;
  node._prev = null;
  node._next = null;
  node._context = defaultContext;
  node._handlers = null;
  if (node._disposal) emptyDisposal(node);
  if ('read' in node) {
    if (node._sources) removeSourceObservers(node, 0);
    node._sources = null;
    node._observers = null;
  }
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

export function emptyDisposal(scope: Scope) {
  try {
    if (Array.isArray(scope._disposal)) {
      for (let i = scope._disposal.length - 1; i >= 0; i--) {
        const callable = scope._disposal![i];
        callable.call(callable);
      }
    } else {
      scope._disposal?.call(scope._disposal);
    }

    scope._disposal = null;
  } catch (error) {
    handleError(scope, error);
  }
}

export function removeSourceObservers(node: Computation, index: number) {
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
