import { scoped } from '../compute';
import { STATE_DEAD, STATE_INERT } from '../constants';
import { defaultContext, type ContextRecord } from '../context';
import { callDisposable, type Disposable } from '../dispose';
import { handleError, type ErrorHandler } from '../error';
import type { Node } from './node';
import type { Reaction } from './reaction';

export let currentScope: Scope | null = null;

let isDestroying = false;

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
    currentScope?.append(this);
  }

  run<T>(run: () => T): T | undefined {
    return scoped(run, this);
  }

  append(child: Node) {
    child._prev = this;

    if (this._next) {
      if (child._next) {
        let tail = child._next;
        while (tail._next) tail = tail._next;
        this._next._prev = tail;
        tail._next = this._next;
      } else {
        child._next = this._next;
        this._next._prev = child;
      }
    }

    this._next = child;

    // Appending outside of initial creation.
    if (child._parent !== this && isScopeNode(child)) {
      child._context =
        child._context === defaultContext ? this._context : { ...this._context, ...child._context };

      if (this._handlers) {
        child._handlers = !child._handlers
          ? this._handlers
          : [...child._handlers, ...this._handlers];
      }
    }

    child._parent = this;
  }

  reset() {
    dispose(this);
    destroy(this, this);
    this._handlers = this._parent ? this._parent._handlers : null;
  }

  destroy() {
    if (this._state === STATE_DEAD) return;

    if (!isDestroying) {
      destroy(this, this._prev);
    }

    this._state = STATE_DEAD;

    dispose(this);

    this._parent = null;
    this._next = null;
    this._prev = null;
    this._context = defaultContext;
    this._handlers = null;

    if (this._reaction) {
      this._reaction._scope = null;
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

function destroy(scope: Scope, head: Node | null) {
  const prev = isDestroying;
  try {
    isDestroying = true;
    const tail = destroyChildren(scope);
    if (head) head._next = tail;
    if (tail) tail._prev = head;
  } finally {
    isDestroying = prev;
  }
}

function destroyChildren(scope: Scope) {
  if (!scope._next || scope._next._parent !== scope) {
    return scope._next;
  }

  let parents: Node[] = [scope],
    parent: Node | null = scope,
    current: Node | null = scope._next!,
    next: Node | null = null;

  main: do {
    parent = parents.pop()!;

    while (current && current._parent === parent) {
      if (current._next?._parent === current) {
        parents.push(parent, current);
        current = current._next;
        continue main;
      } else {
        next = current._next!;
        current.destroy();
        current = next;
      }
    }

    // Skip root.
    if (parents.length) parent.destroy();
  } while (parents.length);

  return current;
}
