import { signal, root, unscope, effect, tick } from '../src';

it('should not track scope', () => {
  root((dispose) => {
    let innerEffect = vi.fn(),
      update!: () => void;

    unscope(() => {
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
    tick();
    expect(innerEffect).toHaveBeenCalledWith(10);
  });
});
