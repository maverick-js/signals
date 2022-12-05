import { computed, observable, tick, dispose, root, getScope } from '../src';
import { CHILDREN } from '../src/symbols';

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
