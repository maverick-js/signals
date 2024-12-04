import { signal, root, untrack, effect, flushSync } from '../src';

it('should not track scope', () => {
  root((scope) => {
    let innerEffect = vi.fn(),
      update!: () => void;

    untrack(() => {
      const $a = signal(0);

      effect(() => {
        innerEffect($a.get());
      });

      update = () => {
        $a.set(10);
      };
    });

    scope.destroy();
    update();
    flushSync();
    expect(innerEffect).toHaveBeenCalledWith(10);
  });
});
