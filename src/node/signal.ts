import { read, write } from '../compute';
import { FLAG_SIGNAL_WRITE, FLAG_SIGNAL, FLAG_SIGNAL_WRITE_INIT } from '../flags';
import { killNode, isNode, isNodeDead, type Node } from './node';
import type { Reaction } from './reaction';
import { appendChild, currentScope, Scope } from './scope';

export interface ReadSignal<T = unknown> extends Node {
  /** @internal */
  f: number;
  /** @internal */
  _value: T;
  /** @internal */
  _reactions: Reaction[] | null;
  get(): T;
  destroy(): void;
}

export class Signal<T = unknown> implements ReadSignal<T> {
  /** @internal */
  f = FLAG_SIGNAL_WRITE_INIT;
  /** @internal */
  _value: T;
  /** @internal */
  _parent: Scope | null = null;
  /** @internal */
  _next: Node | null = null;
  /** @internal */
  _prev: Node | null = null;
  /** @internal */
  _reactions: Reaction[] | null = null;

  constructor(value: T) {
    this._value = value;
    if (currentScope) {
      appendChild(currentScope, this);
    }
  }

  get(): T {
    return read(this);
  }

  set(value: T) {
    if (!(this.f & FLAG_SIGNAL_WRITE)) {
      throw Error(__DEV__ ? 'Cannot set the value of a readonly signal' : 'readonly');
    }

    write(this, value);
  }

  next(next: NextValue<T>) {
    this.set(next(this._value));
  }

  destroy() {
    if (isNodeDead(this)) return;
    killNode(this);
    this._reactions = null;
  }
}

export interface NextValue<T> {
  (prevValue: T): T;
}

export type InferSignalValue<T> = T extends Signal<infer R> ? R : never;

/**
 * Creates a new signal with the given initial value. The value can now be observed when used
 * inside other computations created with `computed` and `effect` by calling `signal.value`.
 *
 * @see {@link https://github.com/maverick-js/signals#signal}
 */
export function signal<T>(initialValue: T): Signal<T> {
  return new Signal(initialValue);
}

/**
 * Takes in the given signal and makes it read only.
 *
 * @see {@link https://github.com/maverick-js/signals#readonly}
 */
export function readonly<T>(signal: Signal<T>): Signal<T> {
  signal.f &= ~FLAG_SIGNAL_WRITE;
  return signal;
}

export function isSignalNode(node: Node): node is Signal {
  return (node.f & FLAG_SIGNAL) > 0;
}

/**
 * Whether the given value is a readonly signal.
 *
 * @see {@link https://github.com/maverick-js/signals#isreadsignal}
 */
export function isReadSignal(value: unknown): value is ReadSignal {
  return isNode(value) && isSignalNode(value) && !(value.f & FLAG_SIGNAL_WRITE);
}

/**
 * Whether the given value is a write signal.
 *
 * @see {@link https://github.com/maverick-js/signals#iswritesignal}
 */
export function isWriteSignal<T>(value: unknown): value is Signal<T> {
  return isNode(value) && isSignalNode(value) && (value.f & FLAG_SIGNAL_WRITE) > 0;
}
