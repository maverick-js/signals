import { scoped } from '../compute';
import { STATE_DEAD, STATE_INERT } from '../constants';
import { defaultContext, type ContextRecord } from '../context';
import { callDisposable, type Disposable } from '../dispose';
import { handleError, type ErrorHandler } from '../error';
import type { Node } from './node';
import type { Reaction } from './reaction';

export let currentScope: Scope | null = null;

export class Scope implements Node {
  /** @internal */
  _state = STATE_INERT;
  /** @internal */
  _parent: Scope | null = currentScope;
  /** @internal */
  _prev: Node | null = currentScope;
  /** @internal */
  _next: Node | null = null;
  /** @internal */
  _context: ContextRecord;
  /** @internal */
  _handlers: ErrorHandler<any>[] | null;
  /** @internal */
  _disposal: Disposable | Disposable[] | null = null;
  /** @internal */
  _reaction: Reaction | null;

  constructor(reaction: Reaction | null = null) {
    this._reaction = reaction;
    this._context = currentScope ? currentScope._context : defaultContext;
    this._handlers = currentScope ? currentScope._handlers : null;
    appendScopeChild(currentScope, this);
  }

  run<T>(run: () => T): T | undefined {
    return scoped(run, this);
  }

  append(child: Node) {
    // @ts-expect-error - override readonly
    child._parent = this;

    appendScopeChild(this, child);

    if (isScopeNode(child)) {
      child._context =
        child._context === defaultContext ? this._context : { ...this._context, ...child._context };

      if (this._handlers) {
        child._handlers = !child._handlers
          ? this._handlers
          : [...child._handlers, ...this._handlers];
      }
    }
  }

  reset() {
    emptyDisposal(this);
    this._handlers = this._parent ? this._parent._handlers : null;
  }

  destroy() {
    if (this._state === STATE_DEAD) return;

    emptyDisposal(this);

    this._state = STATE_DEAD;
    this._parent = null;
    this._next = null;
    this._prev = null;
    this._context = defaultContext;
    this._handlers = null;

    if (this._reaction) {
      this._reaction.destroy();
      this._reaction = null;
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

export function setScope(scope: Scope | null) {
  currentScope = scope;
}

export function isScopeNode(node: Node): node is Scope {
  return node instanceof Scope;
}

export function emptyDisposal(scope: Scope) {
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

/**
 * Appends a child node to a parent scope.
 */
export function appendScopeChild(scope: Scope | null, child: Node) {
  if (!scope) return;

  child._prev = scope;

  if (scope._next) {
    if (child._next) {
      let tail = child._next;
      while (tail._next) tail = tail._next;
      scope._next._prev = tail;
      tail._next = scope._next;
    } else {
      child._next = scope._next;
      scope._next._prev = child;
    }
  }

  scope._next = child;
}
