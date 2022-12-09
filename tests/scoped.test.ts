import { getContext, root, setContext, getScope, scoped, Scope, onError } from '../src';

it('should scope function to current scope', () => {
  let scope!: Scope | null;
  root(() => {
    scope = getScope();
    setContext('id', 10);
  });

  scoped(() => expect(getContext('id')).toBe(10), scope);
});

it('should handle errors', () => {
  const error = new Error(),
    handler = vi.fn();

  let scope!: Scope | null;
  root(() => {
    scope = getScope();
    onError(handler);
  });

  scoped(() => {
    throw error;
  }, scope);

  expect(handler).toHaveBeenCalledWith(error);
});
