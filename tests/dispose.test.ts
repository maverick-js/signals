import { computed, observable, tick, dispose, effect, root, getScope, onError } from '../src';
import { CHILDREN, DISPOSED, OBSERVED_BY } from '../src/symbols';

afterEach(() => tick());

it('should dispose', async () => {
  const $a = observable(10);
  const $b = computed(() => $a() + 10);
  const $c = observable(10);
  const $d = computed(() => $c() + 10);
  const $e = computed(() => $a() + $b() + $d());

  expect($e()).toBe(50);

  dispose($a);

  $a.set(20);
  await tick();

  expect($b()).toBe(20);
  expect($e()).toBe(50);

  // $c/$d should keep working.
  $c.set(20);
  await tick();
  expect($d()).toBe(30);
});

it('shoud remove observable from parent children set', () => {
  root(() => {
    const $a = observable(0);
    dispose($a);
    expect(getScope()![CHILDREN].has($a)).toBeFalsy();
  });
});

it('should auto-dispose computed if not observing anything', () => {
  const $a = computed(() => null);
  $a();

  const $b = computed(() => $a());
  $b();

  expect($a[DISPOSED]).toBeTruthy();
  expect($b[DISPOSED]).toBeTruthy();
});

it('should _not_ auto-dispose effect if error is thrown', async () => {
  const $a = observable(0);

  let shouldThrow = true,
    effectScope;

  effect(() => {
    onError(() => {});
    effectScope = getScope();
    if (shouldThrow) throw Error();
    $a();
  });

  expect(effectScope[DISPOSED]).toBeFalsy();
});

it('should stop observing effect', async () => {
  const $a = observable(0);

  const stop = effect(() => {
    $a();
  });

  stop();
  expect($a[OBSERVED_BY].size).toBe(0);
});
