import { signal, root, untrack, effect, flushSync } from '../src';

it('should not track scope', () => {
  root((dispose) => {
    let innerEffect = vi.fn(),
      update!: () => void;

    untrack(() => {
      const $a = signal(0);

      effect(() => {
        innerEffect($a());
      });

      update = () => {
        $a.set(10);
      };
    });

    dispose();
    update();
    flushSync();
    expect(innerEffect).toHaveBeenCalledWith(10);
  });
});
