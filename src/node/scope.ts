import { currentScope, scoped } from '../compute';
import { STATE_DEAD, STATE_INERT } from '../constants';
import { defaultContext, type ContextRecord } from '../context';
import { callDisposable, type Disposable } from '../dispose';
import { handleError, type ErrorHandler } from '../error';
import type { Node } from './node';
import type { Effect } from './reaction';

// Reduce pressure on GC and recycle children.
let pool: ScopeChild | null = null,
  isDestroyingChildren = false;

export interface ScopeChild {
  /** @internal */
  _node: Node | null;
  /** @internal */
  _prev: ScopeChild | null;
  /** @internal */
  _next: ScopeChild | null;
}

export class Scope implements Node {
  /** @internal */
  _state = STATE_INERT;
  /** @internal */
  _parent: Scope | null = currentScope;
  /** @internal */
  _child: ScopeChild | null = null;
  /** @internal */
  _head: ScopeChild | null = null;
  /** @internal */
  _tail: ScopeChild | null = null;
  /** @internal */
  _context: ContextRecord;
  /** @internal */
  _handlers: ErrorHandler<any>[] | null;
  /** @internal */
  _disposal: Disposable | Disposable[] | null = null;
  /** @internal */
  _effect: Effect | null;

  constructor(effect: Effect | null = null) {
    this._effect = effect;
    this._context = currentScope ? currentScope._context : defaultContext;
    this._handlers = currentScope ? currentScope._handlers : null;
    currentScope?.append(this);
  }

  run<T>(fn: () => T): T | undefined {
    return scoped(fn, this);
  }

  append(node: Node) {
    let child: ScopeChild;

    if (pool) {
      child = pool;
      child._node = node;
      child._prev = this._tail;
      child._next = null;
      pool = pool._next;
    } else {
      child = {
        _node: node,
        _prev: this._tail,
        _next: null,
      };
    }

    if (!this._head) this._head = child;
    if (this._tail) this._tail._next = child;

    this._tail = child;

    if (isScopeNode(node)) {
      // Appending outside of initial creation.
      if (node._parent !== this) {
        node._context =
          node._context === defaultContext ? this._context : { ...this._context, ...node._context };

        if (this._handlers) {
          node._handlers = !node._handlers
            ? this._handlers
            : [...node._handlers, ...this._handlers];
        }
      }

      node._parent = this;
      node._child = child;
    }
  }

  reset() {
    dispose(this);
    destroyChildren(this);
    this._head = null;
    this._tail = null;
    this._handlers = this._parent ? this._parent._handlers : null;
  }

  destroy() {
    if (this._state === STATE_DEAD) return;

    if (!isDestroyingChildren) {
      destroyChildren(this);
      // Detach from parent.
      if (this._parent && this._child) {
        let prev = this._child._prev,
          next = this._child._next;

        if (prev) prev._next = next;
        if (next) next._prev = prev;

        if (this._parent._head === this._child) this._parent._head = next;
        if (this._parent._tail === this._child) this._parent._tail = prev;

        // Release the child back to the pool.
        this._child._node = null;
        this._child._prev = null;
        this._child._next = pool;
        pool = this._child;
        this._child = null;
      }
    }

    // Must be called here to prevent errors when destroying scopes inside `onDispose`.
    this._state = STATE_DEAD;

    dispose(this);

    this._parent = null;
    this._child = null;
    this._head = null;
    this._tail = null;
    this._context = defaultContext;
    this._handlers = null;

    if (this._effect) {
      this._effect._scope = null;
      this._effect.destroy();
      this._effect = null;
    }
  }
}

export function createScope() {
  return new Scope();
}

/**
 * Returns the currently executing parent scope.
 *
 * @see {@link https://github.com/maverick-js/signals#getscope}
 */
export function getScope(): Scope | null {
  return currentScope;
}

export function isScopeNode(node: Node): node is Scope {
  return !!(node as Scope)._context;
}

export function dispose(scope: Scope) {
  if (!scope._disposal) return;
  try {
    if (Array.isArray(scope._disposal)) {
      for (let i = scope._disposal.length - 1; i >= 0; i--) {
        callDisposable(scope._disposal[i]);
      }
    } else {
      callDisposable(scope._disposal);
    }

    scope._disposal = null;
  } catch (error) {
    handleError(scope, error);
  }
}

function destroyChildren(scope: Scope) {
  if (!scope._head) return;

  let prevIsDestroying = isDestroyingChildren,
    currentChild = scope._tail,
    currentScope: Scope | null = null,
    prevChild: ScopeChild | null = null,
    nextScope: Scope | null = null;

  isDestroyingChildren = true;

  try {
    while (currentChild) {
      if (isScopeNode(currentChild._node!) && currentChild._node._tail) {
        currentScope = currentChild._node as Scope;
        currentChild = currentChild._node._tail;
        continue;
      } else {
        prevChild = currentChild._prev;

        currentChild._node!.destroy();

        // Release the child back to the pool.
        currentChild._node = null;
        currentChild._prev = null;
        currentChild._next = pool;
        pool = currentChild;

        currentChild = prevChild;
      }

      while (!currentChild && currentScope && currentScope !== scope) {
        nextScope = currentScope._parent;
        currentChild = currentScope._child!._prev;
        currentScope.destroy();
        currentScope = nextScope;
      }
    }
  } finally {
    isDestroyingChildren = prevIsDestroying;
  }
}
