import { TYPE_ROOT } from './constants';
import { dispose } from './dispose';
import type { Scope } from './types';

export const defaultContext = {};

export let currentScope: Scope | null = null;

/**
 * Returns the currently executing parent scope.
 *
 * @see {@link https://github.com/maverick-js/signals#getscope}
 */
export function getScope(): Scope | null {
  return currentScope;
}

export function setCurrentScope(scope: Scope | null) {
  currentScope = scope;
}

export function createScope(): Scope {
  return new ScopeNode();
}

export const ScopeNode = function Scope(this: Scope) {
  this._type = TYPE_ROOT;
  this._parent = null;
  this._prev = null;
  this._next = null;
  if (currentScope) currentScope.append(this);
};

export const ScopeProto = ScopeNode.prototype;
ScopeProto._context = defaultContext;
ScopeProto._handlers = null;
ScopeProto._compute = null;
ScopeProto._disposal = null;

ScopeProto.append = function (this: Scope, child: Scope) {
  child._parent = this;
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

  child._context =
    child._context === defaultContext ? this._context : { ...this._context, ...child._context };

  if (this._handlers) {
    child._handlers = !child._handlers ? this._handlers : [...child._handlers, ...this._handlers];
  }
};

ScopeProto.dispose = function (this: Scope) {
  dispose.call(this, true);
};

ScopeProto.walk = function (this: Scope, callback: (child: Scope) => void) {
  let parents: Scope[] = [this],
    parent = this,
    current = this._next,
    next: Scope | null = null;

  main: do {
    parent = parents.pop()!;

    while (current && current._parent === parent) {
      if (current._next?._parent === current) {
        parents.push(parent, current);
        current = current._next;
        continue main;
      } else {
        next = current._next;
        callback(current);
        current = next;
      }
    }

    // Skip root.
    if (parents.length) callback(parent);
  } while (parents.length);

  return current;
};
