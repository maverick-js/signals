import { effect, getContext, root, setContext } from '../src';

it('should get context value', () => {
  const key = Symbol();
  root(() => {
    setContext(key, 100);
    root(() => {
      root(() => {
        setContext(key, 200);
      });

      effect(() => {
        expect(getContext(key)).toBe(100);
      });
    });
  });
});

it('should not throw if no context value is found', () => {
  const key = Symbol();
  root(() => {
    root(() => {
      effect(() => {
        expect(getContext(key)).toBe(undefined);
      });
    });
  });
});
