import { STATE_DEAD } from './constants';
import { currentScope } from './node/scope';
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
export function onDispose(disposable: MaybeDisposable): Dispose {
  if (!disposable || !currentScope) {
    return callDisposable.bind(null, disposable);
  }

  const scope = currentScope;

  if (!scope._disposal) {
    scope._disposal = disposable;
  } else if (Array.isArray(scope._disposal)) {
    scope._disposal.push(disposable);
  } else {
    scope._disposal = [scope._disposal, disposable];
  }

  return function removeDisposable() {
    if (scope._state === STATE_DEAD) return;

    callDisposable(disposable);

    if (Array.isArray(scope._disposal)) {
      scope._disposal.splice(scope._disposal.indexOf(disposable), 1);
    } else {
      scope._disposal = null;
    }
  };
}

export function callDisposable(disposable: MaybeDisposable) {
  if (isFunction(disposable)) {
    disposable();
  } else if (disposable) {
    disposable.dispose();
  }
}
