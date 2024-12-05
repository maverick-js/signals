import type { Scope } from './scope';

export interface Node {
  /** @internal current state */
  _state: number;
  /** @internal parent scope */
  _parent?: Scope | null;
  /** @internal next child sibling node */
  _next?: Node | null;
  /** @internal previous child sibling node */
  _prev?: Node | null;
  destroy(): void;
}

export function isNode(value: unknown): value is Node {
  return !!(value as any)?._state;
}
