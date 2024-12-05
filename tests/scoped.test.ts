import { getContext, root, setContext, getScope, type Scope, onError, scoped } from '../src';

it('should scope function to current scope', () => {
  let scope!: Scope | null;

  root(() => {
    scope = getScope();
    setContext('id', 10);
  });

  scope?.run(() => {
    expect(getContext('id')).toBe(10);
  });
});

it('should return value', () => {
  expect(scoped(() => 100, null)).toBe(100);
});

it('should handle errors', () => {
  const error = new Error(),
    handler = vi.fn();

  let scope!: Scope | null;

  root(() => {
    scope = getScope();
    onError(handler);
  });

  scope?.run(() => {
    throw error;
  });

  expect(handler).toHaveBeenCalledWith(error);
});
