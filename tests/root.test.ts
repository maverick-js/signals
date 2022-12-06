import {
  root,
  observable,
  computed,
  effect,
  tick,
  getScope,
  type Observable,
  type Subject,
} from '../src';
import { OBSERVED_BY, OBSERVERS } from '../src/symbols';

afterEach(() => tick());

it('should dispose of inner computations', async () => {
  const computeB = vi.fn();

  let $a: Subject<number>;
  let $b: Observable<number>;

  root((dispose) => {
    $a = observable(10);

    $b = computed(() => {
      computeB();
      return $a() + 10;
    });

    $b();
    dispose();
  });

  expect($b!()).toBe(20);
  expect(computeB).toHaveBeenCalledTimes(1);

  await tick();

  $a!.set(50);
  await tick();

  expect($b!()).toBe(20);
  expect(computeB).toHaveBeenCalledTimes(1);
});

it('should return result', () => {
  const result = root((dispose) => {
    dispose();
    return 10;
  });

  expect(result).toBe(10);
});

it('should create new tracking scope', async () => {
  const innerEffect = vi.fn();

  const $a = observable(0);
  const stop = effect(() => {
    $a();
    root(() => {
      effect(() => {
        innerEffect($a());
      });
    });
  });

  expect(innerEffect).toHaveBeenCalledWith(0);
  expect(innerEffect).toHaveBeenCalledTimes(1);

  stop();

  $a.set(10);
  await tick();
  expect(innerEffect).toHaveBeenCalledWith(10);
  expect(innerEffect).toHaveBeenCalledTimes(2);
});

it('should not be reactive', async () => {
  let $a: Subject<number>;

  const rootCall = vi.fn();

  root(() => {
    $a = observable(0);
    $a();
    rootCall();
  });

  expect(rootCall).toHaveBeenCalledTimes(1);

  $a!.set(1);
  await tick();
  expect(rootCall).toHaveBeenCalledTimes(1);
});

it('should hold parent tracking', async () => {
  root(() => {
    const parent = getScope();
    root(() => {
      expect(getScope(getScope())).toBe(parent);
    });
  });
});

it('should not observe', () => {
  const $a = observable(0);
  root(() => {
    $a();
    expect(getScope()![OBSERVERS]).toBeUndefined();
    expect(getScope()![OBSERVED_BY]).toBeUndefined();
  });
});
