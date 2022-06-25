# Observables

[![package-badge]][package]
[![license-badge]][license]

> 🏆 The goal of this library is to provide a lightweight reactivity API for other UI libraries to
> be built on top of. It follows the "lazy principle" that Svelte adheres to - don't
> do any unnecessary work and don't place the burden of figuring it out on the developer.

This is a tiny (~750B minzipped) library for creating reactive observables via functions. You
can use observables to store state, create computed properties (`y = mx + b`), and subscribe to
updates as its value changes.

- 🪶 Light (~750B minzipped)
- 🌎 All types are observable (i.e., string, array, object, etc.)
- 🕵️‍♀️ Only updates when value has changed
- ⏱️ Batched updates via microtask scheduler
- 😴 Lazy by default - efficiently re-computes only what's needed
- 🔬 Computations via `$computed`
- 📞 Effect subscriptions via `$effect`
- ♻️ Detects cyclic dependencies
- 🐛 Debugging identifiers
- 💪 Strongly typed - built with TypeScript

⏭️ **[Skip to API](#api)**

Here's a simple demo to see how it works:

> **Note**
>
> Interact with the demo live on [StackBlitz][stackblitz-demo].

```js
import { $observable, $computed, $effect, $tick } from '@maverick-js/observables';

// Create - all types supported (string, array, object, etc.)
const $m = $observable(1);
const $x = $observable(1);
const $b = $observable(0);

// Compute - only re-computed when `$m`, `$x`, or `$b` changes.
const $y = $computed(() => $m() * $x() + $b());

// Effect - this will run whenever `$y` is updated.
const stop = $effect(() => console.log($y()));

$m.set(10); // logs `10` inside effect

// Wait a tick so update is applied and effect is run.
await $tick();

$b.update((prev) => prev + 5); // logs `15` inside effect

// Wait a tick so effect runs last update.
await $tick();

// Nothing has changed - no re-compute.
$y();

// Stop running effect.
stop();
```

## Export Sizes

<img src="./export-sizes.png" alt="Library export sizes" width="250px" />

**Total:** if you import everything it'll be ~750B.

You can also check out the library size on [Bundlephobia][bundlephobia] (less accurate).

## Installation

```bash
$: npm i @maverick-js/observables

$: pnpm i @maverick-js/observables

$: yarn add @maverick-js/observables
```

## API

- [`$observable`](#observable)
- [`$computed`](#computed)
- [`$effect`](#effect)
- [`$peek`](#peek)
- [`$readonly`](#readonly)
- [`$tick`](#tick)
- [`$dispose`](#dispose)
- [`isComputed`](#iscomputed)

### `$observable`

Wraps the given value into an observable function. The observable function will return the
current value when invoked `fn()`, and provide a simple write API via `set()` and `update()`. The
value can now be observed when used inside other computations created with [`$computed`](#computed)
and [`$effect`](#effect).

```js
import { $observable } from '@maverick-js/observables';

const $a = $observable(10);

$a(); // read
$a.set(20); // write (1)
$a.update((prev) => prev + 10); // write (2)
```

> **Warning**
> Read the [`$tick`](#tick) section below to understand batched updates.

### `$computed`

Creates a new observable whose value is computed and returned by the given function. The given
compute function is _only_ re-run when one of it's dependencies are updated. Dependencies are
are all observables that are read during execution.

```js
import { $observable, $computed, $tick } from '@maverick-js/observables';

const $a = $observable(10);
const $b = $observable(10);
const $c = $computed(() => $a() + $b());

console.log($c()); // logs 20

$a.set(20);
await $tick();
console.log($c()); // logs 30

$b.set(20);
await $tick();
console.log($c()); // logs 40

// Nothing changed - no re-compute.
console.log($c()); // logs 40
```

```js
import { $observable, $computed } from '@maverick-js/observables';

const $a = $observable(10);
const $b = $observable(10);
const $c = $computed(() => $a() + $b());

// Computed observables can be deeply nested.
const $d = $computed(() => $a() + $b() + $c());
const $e = $computed(() => $d());
```

### `$effect`

Invokes the given function each time any of the observables that are read inside are updated
(i.e., their value changes). The effect is immediately invoked on initialization.

```js
import { $observable, $computed, $effect } from '@maverick-js/observables';

const $a = $observable(10);
const $b = $observable(20);
const $c = $computed(() => $a() + $b());

// This effect will run each time `$a` or `$b` is updated.
const stop = $effect(() => console.log($c()));

// Stop observing.
stop();
```

### `$peek`

Returns the current value stored inside an observable without triggering a dependency.

```js
import { $observable, $computed, $peek } from '@maverick-js/observables';

const $a = $observable(10);

$computed(() => {
  // `$a` will not be considered a dependency.
  const value = $peek($a);
});
```

### `$readonly`

Takes in the given observable and makes it read only by removing access to write
operations (i.e., `set()` and `update()`).

```js
import { $observable, $readonly } from '@maverick-js/observables';

const $a = $observable(10);
const $b = $readonly($a);

console.log($b()); // logs 10

// We can still update value through `$a`.
$a.set(20);

console.log($b()); // logs 20
```

### `$tick`

Tasks are batched onto the microtask queue. This means only the last write of multiple write
actions performed in the same execution window is applied. You can wait for the microtask
queue to be flushed before writing a new value so it takes effect.

> **Note**
> You can read more about microtasks on [MDN][mdn-microtasks].

```js
import { $observable } from '@maverick-js/observables';

const $a = $observable(10);

$a.set(10);
$a.set(20);
$a.set(30); // only this write is applied
```

```js
import { $observable, $tick } from '@maverick-js/observables';

const $a = $observable(10);

// All writes are applied.
$a.set(10);
await $tick();
$a.set(20);
await $tick();
$a.set(30);
```

### `$dispose`

Unsubscribes the given observable.

```js
import { $observable, $dispose } from '@maverick-js/observables';

const $a = $observable(10);
const $b = $computed(() => $a());

$dispose($a);

// `$b` will no longer update if `$a` is updated.
```

### `isComputed`

Whether the given function is a computed observable.

```js
import { $observable, $computed, isComputed } from '@maverick-js/observables';

isComputed(() => {}); // false

const $a = $observable(10);
isComputed($a); // false

const $b = $computed(() => $a() + 10);
isComputed($b); // true
```

## Debugging

The `$observable`, `$computed`, and `$effect` functions accept a debugging ID (string) as
their second argument. This can be helpful when logging a cyclic dependency chain to understand
where it's occurring.

```js
import { $observable, $computed } from '@maverick-js/observables';

const $a = $observable(10, 'a');

// Cyclic dependency chain.
const $b = $computed(() => $a() + $c(), 'b');
const $c = $computed(() => $a() + $b(), 'c');

// This will throw an error in the form:
// $: Error: cyclic dependency detected
// $: a -> b -> c -> b
```

> **Note**
> This feature is only available in a development or testing Node environment (i.e., `NODE_ENV`).

## Scheduler

We provide the underlying microtask scheduler incase you'd like to use it:

```js
import { createScheduler } from '@maverick-js/observables';

// Creates a scheduler which batches tasks and runs them in the microtask queue.
const scheduler = createScheduler();

// Queue tasks.
scheduler.enqueue(() => {});
scheduler.enqueue(() => {});

// Schedule a flush - can be invoked more than once.
scheduler.flush();

// Wait for flush to complete.
await scheduler.tick;
```

> **Note**
> You can read more about microtasks on [MDN][mdn-microtasks].

## Types

```ts
import { $computed, type Observable, type Computation } from '@maverick-js/observables';

const observable: Observable<number>;
const computed: Computation<number>;

// Provide generic if TS fails to infer correct type.
const $a = $computed<string>(() => /* ... */);
```

## Inspiration

`@maverick-js/observables` was made possible based on my learnings from:

- [Solid JS][solidjs]
- [Sinuous][sinuous]
- [Hyperactiv][hyperactiv]
- [Svelte Scheduler][svelte-scheduler]

Special thanks to Wesley, Julien, and Solid/Svelte contributors for all their work 🎉

[package]: https://www.npmjs.com/package/@maverick-js/observables
[package-badge]: https://img.shields.io/npm/v/@maverick-js/observables/latest
[license]: https://github.com/maverick-js/observables/blob/main/LICENSE
[license-badge]: https://img.shields.io/github/license/maverick-js/observables
[solidjs]: https://github.com/solidjs/solid
[sinuous]: https://github.com/luwes/sinuous
[hyperactiv]: https://github.com/elbywan/hyperactiv
[svelte-scheduler]: https://github.com/sveltejs/svelte/blob/master/src/runtime/internal/scheduler.ts
[mdn-microtasks]: https://developer.mozilla.org/en-US/docs/Web/API/HTML_DOM_API/Microtask_guide
[stackblitz-demo]: https://stackblitz.com/edit/maverick-observables?embed=1&file=index.ts&hideExplorer=1&hideNavigation=1&view=editor
[bundlephobia]: https://bundlephobia.com/package/@maverick-js/observables@latest
