import { observable, tick, readonly } from '../src';

afterEach(() => tick());

it('should create readonly proxy', async () => {
  const $a = observable(10);
  const $b = readonly($a);

  expect(() => {
    // @ts-expect-error
    $b.set(10);
  }).toThrow();

  expect(() => {
    // @ts-expect-error
    $b.next((n) => n + 10);
  }).toThrow();

  await tick();
  expect($b()).toBe(10);

  $a.set(20);
  await tick();
  expect($b()).toBe(20);
});
