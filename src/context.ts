import { currentScope } from './scope';
import type { Scope } from './types';

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
