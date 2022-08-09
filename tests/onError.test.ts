import { root, effect, onError, observable, tick } from '../src';

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

it('should forward error to another handler', async () => {
  const error = new Error();
  const handler = vi.fn();

  const $a = observable(0);

  root(() => {
    effect(() => {
      onError(handler);

      effect(() => {
        $a();

        onError((error) => {
          throw error;
        });

        throw error;
      });
    });
  });

  expect(handler).toHaveBeenCalledWith(error);

  $a.set(1);
  await tick();
  expect(handler).toHaveBeenCalledTimes(2);
});
