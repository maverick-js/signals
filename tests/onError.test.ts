import { root, effect, onError } from '../src';

it('should handle error ', () => {
  const error = new Error();
  const handler = vi.fn();

  root(() => {
    effect(() => {
      onError(handler);
      throw error;
    });
  });

  expect(handler).toHaveBeenCalledWith(error);
});

it('should forward error to another handler', () => {
  const error = new Error();
  const handler = vi.fn();

  root(() => {
    effect(() => {
      onError(handler);

      effect(() => {
        onError((error) => {
          throw error;
        });

        throw error;
      });
    });
  });

  expect(handler).toHaveBeenCalledWith(error);
});
