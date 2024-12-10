export interface Node {
  /** @internal current state */
  _state: number;
  destroy(): void;
}

export function isNode(value: unknown): value is Node {
  if (__DEV__) {
    return !!(value as any)?._state;
  } else {
    return value != null && 'ø' in (value as object);
  }
}
