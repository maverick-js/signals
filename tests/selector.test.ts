import { computed, root, signal, tick } from '../src';
import { selector } from '../src/map';

it('should observe key changes', () => {
  root((dispose) => {
    const $source = signal(0),
      $selector = selector($source),
      effect0 = vi.fn(() => $selector(0).get()),
      effect1 = vi.fn(() => $selector(1).get()),
      effect2 = vi.fn(() => $selector(2).get());

    let $effect0 = computed(effect0),
      $effect1 = computed(effect1),
      $effect2 = computed(effect2);

    expect($effect0.get()).toBe(true);
    expect($effect1.get()).toBe(false);
    expect($effect2.get()).toBe(false);

    expect(effect0).toHaveBeenCalledTimes(1);
    expect(effect1).toHaveBeenCalledTimes(1);
    expect(effect2).toHaveBeenCalledTimes(1);

    $source.set(1);
    tick();

    expect($effect0.get()).toBe(false);
    expect($effect1.get()).toBe(true);
    expect($effect2.get()).toBe(false);

    expect(effect0).toHaveBeenCalledTimes(2);
    expect(effect1).toHaveBeenCalledTimes(2);
    expect(effect2).toHaveBeenCalledTimes(1);

    $source.set(2);
    tick();

    expect($effect0.get()).toBe(false);
    expect($effect1.get()).toBe(false);
    expect($effect2.get()).toBe(true);

    expect(effect0).toHaveBeenCalledTimes(2);
    expect(effect1).toHaveBeenCalledTimes(3);
    expect(effect2).toHaveBeenCalledTimes(2);

    $source.set(-1);
    tick();

    expect($effect0.get()).toBe(false);
    expect($effect1.get()).toBe(false);
    expect($effect2.get()).toBe(false);

    expect(effect0).toHaveBeenCalledTimes(2);
    expect(effect1).toHaveBeenCalledTimes(3);
    expect(effect2).toHaveBeenCalledTimes(3);

    dispose();

    $source.set(0);
    tick();
    $source.set(1);
    tick();
    $source.set(2);
    tick();

    expect($effect0.get()).toBe(false);
    expect($effect1.get()).toBe(false);
    expect($effect2.get()).toBe(false);

    expect(effect0).toHaveBeenCalledTimes(2);
    expect(effect1).toHaveBeenCalledTimes(3);
    expect(effect2).toHaveBeenCalledTimes(3);
  });
});
