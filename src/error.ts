import { currentScope } from './compute';
import type { Scope } from './node/scope';

export interface ErrorHandler<T = Error> {
  (error: T): void;
}

/**
 * Runs the given function when an error is thrown in a child scope. If the error is thrown again
 * inside the error handler, it will trigger the next available parent scope handler.
 *
 * @see {@link https://github.com/maverick-js/signals#onerror}
 */
export function onError<T = Error>(handler: (error: T) => void): void {
  if (!currentScope) return;
  currentScope._handlers = currentScope._handlers
    ? [handler, ...currentScope._handlers]
    : [handler];
}

export function handleError(scope: Scope | null, error: unknown) {
  if (!scope || !scope._handlers) throw error;

  let i = 0,
    len = scope._handlers.length,
    currentError = error;

  for (i = 0; i < len; i++) {
    try {
      scope._handlers[i](currentError);
      break; // error was handled.
    } catch (error) {
      currentError = error;
    }
  }

  // Error was not handled.
  if (i === len) {
    // Filter out internals from the stack trace.
    if (__DEV__ && currentError instanceof Error) {
      const stack = currentError.stack;
      if (stack) {
        let line = '',
          lines = stack.split('\n'),
          filteredLines: string[] = [];

        for (let i = 0; i < lines.length; i++) {
          line = lines[i];
          if (line.includes('@maverick-js')) continue;
          filteredLines.push(line);
        }

        Object.defineProperty(error, 'stack', {
          value: stack + filteredLines.join('\n'),
        });
      }
    }

    throw currentError;
  }
}
