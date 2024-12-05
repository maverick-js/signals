export interface Node {
  /** @internal current state */
  _state: number;
  destroy(): void;
}

export function isNode(value: unknown): value is Node {
  return !!(value as any)?._state;
}
