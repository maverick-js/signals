import { currentScope } from './compute';
import { STATE_DEAD } from './constants';
import type { Scope } from './node/scope';
import type { Maybe } from './types';
import { isFunction } from './utils';

export interface Dispose {
  (): void;
}

export type Disposable = Dispose | { dispose(): void };

export type MaybeDisposable = Maybe<Disposable>;

/**
 * Runs the given function when the parent scope computation is being disposed.
 *
 * @see {@link https://github.com/maverick-js/signals#ondispose}
 */
export function onDispose(disposable: MaybeDisposable): void {
  if (!disposable || !currentScope) return;
  addDisposable(currentScope, disposable);
}

export function addDisposable(scope: Scope, disposable: Disposable) {
  if (!scope._disposal) {
    scope._disposal = disposable;
  } else if (Array.isArray(scope._disposal)) {
    scope._disposal.push(disposable);
  } else {
    scope._disposal = [scope._disposal, disposable];
  }
}

export function removeDisposable(scope: Scope, disposable: Disposable) {
  if (scope._state === STATE_DEAD) {
    // no-op
  } else if (Array.isArray(scope._disposal)) {
    scope._disposal.splice(scope._disposal.indexOf(disposable), 1);
  } else {
    scope._disposal = null;
  }
}

export function dispose(disposable: MaybeDisposable) {
  if (isFunction(disposable)) {
    disposable();
  } else if (disposable) {
    disposable.dispose();
  }
}
