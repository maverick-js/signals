import {
  $computed,
  $observable,
  $peek,
  $effect,
  $tick,
  isComputed,
  $readonly,
  $dispose,
  $root,
  type Computation,
  type Observable,
} from '../src';

afterEach(() => $tick());

describe('$root', () => {
  it('should dispose of inner computations', async () => {
    const computeB = vi.fn();

    let $a: Observable<number>;
    let $b: Computation<number>;

    $root((dispose) => {
      $a = $observable(10);

      $b = $computed(() => {
        computeB();
        return $a() + 10;
      });

      $b();
      dispose();
    });

    expect($b!()).toEqual(20);
    expect(computeB).toHaveBeenCalledTimes(1);

    await $tick();

    $a!.set(50);
    await $tick();

    expect($b!()).toEqual(20);
    expect(computeB).toHaveBeenCalledTimes(1);
  });

  it('should return result', () => {
    const result = $root((dispose) => {
      dispose();
      return 10;
    });

    expect(result).toEqual(10);
  });
});

describe('$observable', () => {
  it('should store and return value on read', () => {
    const $a = $observable(10);
    expect($a).toBeInstanceOf(Function);
    expect($a()).toEqual(10);
  });

  it('should update observable via `set()`', () => {
    const $a = $observable(10);
    $a.set(20);
    expect($a()).toEqual(20);
  });

  it('should update observable via `update()`', () => {
    const $a = $observable(10);
    $a.update((n) => n + 10);
    expect($a()).toEqual(20);
  });
});

describe('$computed', () => {
  it('should store and return value on read', async () => {
    const $a = $observable(10);
    const $b = $observable(10);
    const $c = $computed(() => $a() + $b());

    expect($c()).toEqual(20);
    await $tick();

    // Try again to ensure state is maintained.
    expect($c()).toEqual(20);
  });

  it('should update when dependency is updated', () => {
    const $a = $observable(10);
    const $b = $observable(10);
    const $c = $computed(() => $a() + $b());

    $a.set(20);
    expect($c()).toEqual(30);

    $b.set(20);
    expect($c()).toEqual(40);
  });

  it('should update when deep dependency is updated', async () => {
    const $a = $observable(10);
    const $b = $observable(10);
    const $c = $computed(() => $a() + $b());
    const $d = $computed(() => $c());

    $a.set(20);
    expect($d()).toEqual(30);
  });

  it('should update when deep computed dependency is updated', () => {
    const $a = $observable(10);
    const $b = $observable(10);
    const $c = $computed(() => $a() + $b());
    const $d = $computed(() => $c());
    const $e = $computed(() => $d());

    $a.set(20);
    expect($e()).toEqual(30);
  });

  it('should only re-compute when needed', () => {
    const compute = vi.fn();

    const $a = $observable(10);
    const $b = $observable(10);
    const $c = $computed(() => compute($a() + $b()));

    expect(compute).not.toHaveBeenCalled();

    $c();
    expect(compute).toHaveBeenCalledTimes(1);
    expect(compute).toHaveBeenCalledWith(20);

    $c();
    expect(compute).toHaveBeenCalledTimes(1);

    $a.set(20);
    $c();
    expect(compute).toHaveBeenCalledTimes(2);

    $b.set(20);
    $c();
    expect(compute).toHaveBeenCalledTimes(3);

    $c();
    expect(compute).toHaveBeenCalledTimes(3);
  });

  it('should only re-compute whats needed', async () => {
    const computeC = vi.fn();
    const computeD = vi.fn();

    const $a = $observable(10);
    const $b = $observable(10);
    const $c = $computed(() => {
      const a = $a();
      computeC(a);
      return a;
    });
    const $d = $computed(() => {
      const b = $b();
      computeD(b);
      return b;
    });
    const $e = $computed(() => $c() + $d());

    expect(computeC).not.toHaveBeenCalled();
    expect(computeD).not.toHaveBeenCalled();

    $e();
    expect(computeC).toHaveBeenCalledTimes(1);
    expect(computeD).toHaveBeenCalledTimes(1);
    expect($e()).toEqual(20);

    $a.set(20);
    await $tick();

    $e();
    expect(computeC).toHaveBeenCalledTimes(2);
    expect(computeD).toHaveBeenCalledTimes(1);
    expect($e()).toEqual(30);

    $b.set(20);
    await $tick();

    $e();
    expect(computeC).toHaveBeenCalledTimes(2);
    expect(computeD).toHaveBeenCalledTimes(2);
    expect($e()).toEqual(40);
  });
});

describe('$effect', () => {
  it('should run effect on change', async () => {
    const effect = vi.fn();

    const $a = $observable(10);
    const $b = $observable(10);
    const $c = $computed(() => $a() + $b());
    const $d = $computed(() => $c());

    $effect(() => {
      effect();
      $d();
    });

    expect(effect).to.toHaveBeenCalledTimes(1);

    $a.set(20);
    await $tick();
    expect(effect).to.toHaveBeenCalledTimes(2);

    $b.set(20);
    await $tick();
    expect(effect).to.toHaveBeenCalledTimes(3);

    $a.set(20);
    $b.set(20);
    await $tick();
    expect(effect).to.toHaveBeenCalledTimes(3);
  });

  it('should stop effect', async () => {
    const effect = vi.fn();

    const $a = $observable(10);

    const stop = $effect(() => {
      effect();
      $a();
    });

    stop();

    $a.set(20);
    await $tick();
    expect(effect).toHaveBeenCalledTimes(1);
  });

  it('should stop effect (deep)', async () => {
    const effect = vi.fn();

    const $a = $observable(10);
    const $b = $computed(() => $a());

    const stop = $effect(() => {
      effect();
      $b();
    });

    stop(true);

    $a.set(20);
    await $tick();

    expect(effect).toHaveBeenCalledTimes(1);
    expect($b()).toEqual(10);
  });
});

describe('$peek', () => {
  it('should not create dependency', async () => {
    const effect = vi.fn();
    const computeC = vi.fn();

    const $a = $observable(10);
    const $b = $computed(() => $a() + 10);
    const $c = $computed(() => {
      computeC();
      return $peek($b) + 10;
    });

    $effect(() => {
      effect();
      expect($peek($a)).toEqual(10);
      expect($peek($b)).toEqual(20);
      expect($peek($c)).toEqual(30);
    });

    expect(effect).toHaveBeenCalledTimes(1);
    expect(computeC).toHaveBeenCalledTimes(1);

    $a.set(20);
    await $tick();
    expect(effect).toHaveBeenCalledTimes(1);
    expect(computeC).toHaveBeenCalledTimes(1);
  });

  it('should not affect deep dependency being created', async () => {
    const effect = vi.fn();
    const computeD = vi.fn();

    const $a = $observable(10);
    const $b = $observable(10);
    const $c = $observable(10);
    const $d = $computed(() => {
      computeD();
      return $a() + $peek($b) + $peek($c) + 10;
    });

    $effect(() => {
      effect();
      expect($peek($a)).toEqual(10);
      expect($peek($d)).toEqual(40);
    });

    expect(effect).toHaveBeenCalledTimes(1);
    expect(computeD).toHaveBeenCalledTimes(1);
    expect($d()).toEqual(40);

    $a.set(20);
    await $tick();
    expect(effect).toHaveBeenCalledTimes(1);
    expect(computeD).toHaveBeenCalledTimes(2);
    expect($d()).toEqual(50);

    $b.set(20);
    await $tick();
    expect(effect).toHaveBeenCalledTimes(1);
    expect(computeD).toHaveBeenCalledTimes(2);
    expect($d()).toEqual(50);

    $c.set(20);
    await $tick();
    expect(effect).toHaveBeenCalledTimes(1);
    expect(computeD).toHaveBeenCalledTimes(2);
    expect($d()).toEqual(50);
  });
});

describe('$tick', () => {
  it('should batch updates', async () => {
    const effect = vi.fn();

    const $a = $observable(10);

    $effect(() => {
      effect();
      return $a();
    });

    $a.set(20);
    $a.set(30);
    $a.set(40);

    expect(effect).to.toHaveBeenCalledTimes(1);
    await $tick();
    expect(effect).to.toHaveBeenCalledTimes(2);
  });

  it('should wait for queue to flush', async () => {
    const effect = vi.fn();

    const $a = $observable(10);

    $effect(() => {
      effect();
      return $a();
    });

    expect(effect).to.toHaveBeenCalledTimes(1);

    $a.set(20);
    await $tick();
    expect(effect).to.toHaveBeenCalledTimes(2);

    $a.set(30);
    await $tick();
    expect(effect).to.toHaveBeenCalledTimes(3);
  });
});

describe('$readonly', () => {
  it('should create readonly proxy', async () => {
    const $a = $observable(10);
    const $b = $readonly($a);

    expect(() => {
      // @ts-expect-error
      $b.set(10);
    }).toThrow();

    expect(() => {
      // @ts-expect-error
      $b.update((n) => n + 10);
    }).toThrow();

    await $tick();
    expect($b()).toEqual(10);

    $a.set(20);
    await $tick();
    expect($b()).toEqual(20);
  });
});

describe('$dispose', () => {
  it('should dispose', async () => {
    const $a = $observable(10);
    const $b = $computed(() => $a() + 10);
    const $c = $observable(10);
    const $d = $computed(() => $c() + 10);
    const $e = $computed(() => $a() + $b() + $d());

    expect($e()).toEqual(50);

    $dispose($a);

    $a.set(20);
    await $tick();

    expect($b()).toEqual(20);
    expect($e()).toEqual(50);

    // $c/$d should keep working.
    $c.set(20);
    await $tick();
    expect($d()).toEqual(30);
  });

  it('should dispose (deep)', async () => {
    const $a = $observable(10);
    const $_b = $observable(20);
    const $b = $computed(() => $_b());
    const $c = $computed(() => $a() + $b() + 10);
    const $d = $computed(() => $a() + $c() + 10);
    const $e = $computed(() => $a() + $c() + $d());

    $e();

    $dispose($e, true);

    $a.set(20);
    await $tick();

    expect($a()).toEqual(10);
    expect($c()).toEqual(40);
    expect($d()).toEqual(60);
    expect($e()).toEqual(110);

    $_b.set(100);
    expect($b()).to.equal(20);
  });
});

describe('isComputed', () => {
  it('should return false given function', () => {
    expect(isComputed(() => {})).toEqual(false);
  });

  it('should return false given observable', () => {
    expect(isComputed($observable(10))).toEqual(false);
  });

  it('should return false given effect', () => {
    expect(isComputed($effect(() => {}))).toEqual(false);
  });

  it('should return true given computed', () => {
    expect(isComputed($computed(() => {}))).toEqual(true);
  });
});
