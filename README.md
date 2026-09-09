# Signals

[![package-badge]][package]
[![license-badge]][license]

> 🏆 The goal of this library is to provide a lightweight reactivity API for other UI libraries to
> be built on top of. It follows the "lazy principle" that Svelte adheres to - don't
> do any unnecessary work and don't place the burden of figuring it out on the developer.

This is a tiny (~2kB minzipped) library for creating reactive observables called signals. You can
use signals to store state, create computed properties (`y = mx + b`), and subscribe to updates as
its value changes.

- 🪶 Light (~2kB minzipped)
- 💽 Works in both browsers and Node.js
- 🌎 All types are observable (i.e., string, array, object, etc.)
- 🕵️‍♀️ Only updates when value has changed
- ⏱️ Batched updates via microtask scheduler
- 😴 Lazy by default - efficiently re-computes only what's needed
- 🔬 Computations via `computed`
- 📞 Effect subscriptions via `effect`
- 🐛 Debugging identifiers
- 💪 Strongly typed - built with TypeScript

⏭️ **[Skip to API](#api)**

⏭️ **[Skip to TypeScript](#typescript)**

⏭️ **[Skip to Benchmarks](#benchmarks)**

Here's a simple demo to see how it works:

[![Open in StackBlitz](https://developer.stackblitz.com/img/open_in_stackblitz.svg)][stackblitz-demo]

```js
import { root, signal, computed, effect, tick } from '@maverick-js/signals';

root((dispose) => {
  // Create - all types supported (string, array, object, etc.)
  const $m = signal(1);
  const $x = signal(1);
  const $b = signal(0);

  // Compute - only re-computed when `$m`, `$x`, or `$b` changes.
  const $y = computed(() => $m.get() * $x.get() + $b.get());

  // Effect - this will run whenever `$y` is updated.
  const stop = effect(() => {
    console.log($y.get());

    // Called each time `effect` ends and when finally disposed.
    return () => {};
  });

  $m.set(10); // logs `10` inside effect

  // Flush queue synchronously so effect is run.
  // Otherwise, effects will be batched and run on the microtask queue.
  tick();

  $b.set((prev) => prev + 5); // logs `15` inside effect

  tick();

  // Nothing has changed - no re-compute.
  $y.get();

  // Stop running effect.
  stop();

  // ...

  // Dispose of all signals inside `root`.
  dispose();
});
```

## Installation

```bash
$: npm i @maverick-js/signals

$: pnpm i @maverick-js/signals

$: yarn add @maverick-js/signals
```

## API

- [`root`](#root)
- [`signal`](#signal)
- [`computed`](#computed)
- [`effect`](#effect)
- [`peek`](#peek)
- [`unscope`](#unscope)
- [`readonly`](#readonly)
- [`tick`](#tick)
- [`computedMap`](#computedmap)
- [`computedKeyedMap`](#computedkeyedmap)
- [`onError`](#onerror)
- [`onDispose`](#ondispose)
- [`isReadSignal`](#isreadsignal)
- [`isWriteSignal`](#iswritesignal)
- [`getScope`](#getscope)
- [`scoped`](#scoped)
- [`getContext`](#getcontext)
- [`setContext`](#setcontext)

### `root`

Computations are generally child computations. When their respective parent scope is destroyed so
are they. You _can_ create orphan computations (i.e., no parent). Orphans will live in memory until
their internal object references are garbage collected (GC) (i.e., dropped from memory):

```js
import { computed } from '@maverick-js/signals';

const obj = {};

// This is an orphan - GC'd when `obj` is.
const $b = computed(() => obj);
```

Orphans can make it hard to determine when a computation is disposed so you'll generally want to
ensure you only create child computations. The `root` function stores all inner computations as
a child and provides a function to easily dispose of them all:

```js
import { root, signal, computed, effect } from '@maverick-js/signals';

root((dispose) => {
  const $a = signal(10);
  const $b = computed(() => $a.get());

  effect(() => console.log($b.get()));

  // Disposes of `$b` and the effect. Signals hold no subscriptions of their own, so they are
  // never owned by a scope and never need disposing.
  dispose();
});
```

```js
// `root` returns the result of the given function.
const result = root(() => 10);

console.log(result); // logs `10`
```

### `signal`

Wraps the given value into a signal. Read the current value with `get()`, write with `set()`, and
read without tracking with `peek()`. The value can now be observed when read inside other
computations created with [`computed`](#computed) and [`effect`](#effect).

```js
import { signal } from '@maverick-js/signals';

const $a = signal(10);

$a.get(); // read
$a.peek(); // read without tracking
$a.set(20); // write (1)
$a.set((prev) => prev + 10); // write (2)
```

Observers are only notified when the value changes. Values are compared with `Object.is`; pass
`equals` to customize the comparison (the same option is accepted by `computed`):

```js
const $point = signal({ x: 0, y: 0 }, { equals: (a, b) => a.x === b.x && a.y === b.y });

$point.set({ x: 0, y: 0 }); // equal - observers are not notified
```

> **Warning**
> Read the [`tick`](#tick) section below to understand batched updates.

### `computed`

Creates a new signal whose value is computed and returned by the given function. The given
compute function is _only_ re-run when one of its dependencies are updated. Dependencies are
are all signals that are read during execution.

```js
import { signal, computed, tick } from '@maverick-js/signals';

const $a = signal(10);
const $b = signal(10);
const $c = computed(() => $a.get() + $b.get());

console.log($c.get()); // logs 20

$a.set(20);
tick();
console.log($c.get()); // logs 30

$b.set(20);
tick();
console.log($c.get()); // logs 40

// Nothing changed - no re-compute.
console.log($c.get()); // logs 40
```

```js
import { signal, computed } from '@maverick-js/signals';

const $a = signal(10);
const $b = signal(10);
const $c = computed(() => $a.get() + $b.get());

// Computed signals can be deeply nested.
const $d = computed(() => $a.get() + $b.get() + $c.get());
const $e = computed(() => $d.get());
```

A computation that reads itself, directly or through other computeds, throws a `Cycle detected`
error to the reader (or to the nearest [`onError`](#onerror) handler) instead of overflowing the
stack.

### `effect`

Invokes the given function each time any of the signals that are read inside are updated
(i.e., their value changes). The effect is immediately invoked on initialization.

```js
import { signal, computed, effect } from '@maverick-js/signals';

const $a = signal(10);
const $b = signal(20);
const $c = computed(() => $a.get() + $b.get());

// This effect will run each time `$a` or `$b` is updated.
const stop = effect(() => console.log($c.get()));

// Stop observing.
stop();
```

You can optionally return a function from inside the `effect` that will be run each time the
effect re-runs and when it's finally stopped/disposed of:

```js
effect(() => {
  return () => {
    // Called each time effect re-runs and when disposed of.
  };
});
```

### `peek`

Runs the given function whilst disabling observer tracking, i.e. without registering any
dependencies. Every signal also has a `peek()` method for reading a single value untracked. Use
[`unscope`](#unscope) if you want to also disable scope tracking.

```js
import { signal, computed, peek } from '@maverick-js/signals';

const $a = signal(10);

const $b = computed(() => {
  // `$a` will not trigger updates on `$b`.
  const value = $a.peek();
  // Same, for a whole block:
  const other = peek(() => $a.get() + $c.get());
});
```

### `unscope`

Runs the given function outside of the current scope whilst also disabling observer tracking.
Computations created inside are orphans (they have no parent scope and will not be disposed of
with it), and no dependencies are tracked. Use [`peek`](#peek) if only observer tracking should be
disabled.

```js
import { signal, effect, unscope } from '@maverick-js/signals';

effect(() => {
  unscope(() => {
    // `$a` is now an orphan and also not tracked by the outer effect.
    const $a = signal(10);
  });
});
```

### `readonly`

Takes in the given signal and makes it read only by removing access to write operations (i.e.,
`set()`).

```js
import { signal, readonly } from '@maverick-js/signals';

const $a = signal(10);
const $b = readonly($a);

console.log($b.get()); // logs 10

// We can still update value through `$a`.
$a.set(20);

console.log($b.get()); // logs 20
```

### `tick`

By default, signal updates are batched on the microtask queue which is an async process. You can
flush the queue synchronously to get the latest updates by calling `tick()`.

> **Note**
> You can read more about microtasks on [MDN][mdn-microtasks].

```js
import { signal } from '@maverick-js/signals';

const $a = signal(10);

$a.set(10);
$a.set(20);
$a.set(30); // only this write is applied
```

```js
import { signal, tick } from '@maverick-js/signals';

const $a = signal(10);

// All writes are applied.
$a.set(10);
tick();
$a.set(20);
tick();
$a.set(30);
```

### `computedMap`

> **Note**
> Same implementation as [`indexArray`](https://www.solidjs.com/docs/latest/api#indexarray) in Solid JS.
> Prefer [`computedKeyedMap`](#computedkeyedmap) when referential checks are required.

Reactive map helper that caches each item by index to reduce unnecessary mapping on updates.
It only runs the mapping function once per item and adds/removes as needed. In a non-keyed map like
this the index is fixed but value can change (opposite of a keyed map).

```js
import { signal, tick } from '@maverick-js/signals';
import { computedMap } from '@maverick-js/signals/map';

const source = signal([1, 2, 3]);

const map = computedMap(source, (value, index) => {
  return {
    i: index,
    get id() {
      return value.get() * 2;
    },
  };
});

console.log(map.get()); // logs `[{ i: 0, id: $2 }, { i: 1, id: $4 }, { i: 2, id: $6 }]`

source.set([3, 2, 1]);
tick();

// Notice the index `i` remains fixed but `id` has updated.
console.log(map.get()); // logs `[{ i: 0, id: $6 }, { i: 1, id: $4 }, { i: 2, id: $2 }]`
```

### `computedKeyedMap`

> **Note**
> Same implementation as [`mapArray`](https://www.solidjs.com/docs/latest/api#maparray) in Solid JS.
> Prefer [`computedMap`](#computedmap) when working with primitives to avoid unnecessary re-renders.

Reactive map helper that caches each list item by reference to reduce unnecessary mapping on
updates. It only runs the mapping function once per item and then moves or removes it as needed. In
a keyed map like this the value is fixed but the index changes (opposite of non-keyed map).

```js
import { signal, tick } from '@maverick-js/signals';
import { computedKeyedMap } from '@maverick-js/signals/map';

const source = signal([{ id: 0 }, { id: 1 }, { id: 2 }]);

const nodes = computedKeyedMap(source, (value, index) => {
  const div = document.createElement('div');

  div.setAttribute('id', String(value.id));
  Object.defineProperty(div, 'i', {
    get() {
      return index.get();
    },
  });

  return div;
});

console.log(nodes.get()); // [{ id: 0, i: $0 }, { id: 1, i: $1 }, { id: 2, i: $2 }];

source.set((prev) => {
  // Swap index 0 and 1
  const tmp = prev[1];
  prev[1] = prev[0];
  prev[0] = tmp;
  return [...prev]; // new array
});

tick();

// No nodes were created/destroyed, simply nodes at index 0 and 1 switched.
console.log(nodes.get()); // [{ id: 1, i: $0 }, { id: 0, i: $1 }, { id: 2, i: $2 }];
```

### `onError`

Runs the given function when an error is thrown in a child scope. If the error is thrown again
inside the error handler, it will trigger the next available parent scope handler.

```js
import { effect, onError } from '@maverick-js/signals';

effect(() => {
  onError((error) => {
    // ...
  });
});
```

### `onDispose`

Runs the given function when the parent scope computation is being disposed of.

```js
import { effect, onDispose } from '@maverick-js/signals';

const listen = (type, callback) => {
  window.addEventListener(type, callback);
  // Called when the effect is re-run or finally disposed.
  onDispose(() => window.removeEventListener(type, callback));
};

const stop = effect(
  listen('click', () => {
    // ...
  }),
);

stop(); // `onDispose` is called
```

The `onDispose` callback will return a function to clear the disposal early if it's no longer
required:

```js
effect(() => {
  const dispose = onDispose(() => {});
  // ...
  // Call early if it's no longer required.
  dispose();
});
```

### `isReadSignal`

Whether the given value is a readonly signal.

```js
// True
isReadSignal(signal(10));
isReadSignal(computed(() => 10));
isReadSignal(readonly(signal(10)));

// False
isReadSignal(10);
isReadSignal(() => {});
isReadSignal(false);
isReadSignal(null);
isReadSignal(undefined);
```

### `isWriteSignal`

Whether the given value is a write signal (i.e., can produce new values via write API).

```js
// True
isWriteSignal(signal(10));

// False
isWriteSignal(false);
isWriteSignal(null);
isWriteSignal(undefined);
isWriteSignal(() => {});
isWriteSignal(computed(() => 10));
isWriteSignal(readonly(signal(10)));
```

### `getScope`

Returns the currently executing parent scope.

```js
root(() => {
  const scope = getScope(); // returns `root` scope.

  effect(() => {
    const $a = signal(0);
    getScope(); // returns `effect` scope.
  });
});
```

### `scoped`

Runs the given function in the given scope so context and error handling continue to work.

```js
import { root, getScope, scoped } from '@maverick-js/signals';

root(() => {
  const scope = getScope();

  // Timeout will lose tracking of the current scope.
  setTimeout(() => {
    scoped(() => {
      // Code here will run with root scope.
    }, scope);
  }, 0);
});
```

### `getContext`

Attempts to get a context value for the given key. It will start from the parent scope and
walk up the computation tree trying to find a context record and matching key. If no value can be
found `undefined` will be returned. This is intentionally low-level so you can design a context API
in your library as desired.

In your implementation make sure to check if a parent scope exists via `getScope()`. If one does
not exist log a warning that this function should not be called outside a computation or render
function.

> **Note**
> See the `setContext` code example below for a demo of this function.

### `setContext`

Attempts to set a context value on the parent scope with the given key. This will be a no-op if
no parent scope is defined. This is intentionally low-level so you can design a context API in your
library as desired.

In your implementation make sure to check if a parent scope exists via `getScope()`. If one does
not exist log a warning that this function should not be called outside a computation or render
function.

```js
import { root, getContext, setContext } from '@maverick-js/signals';

const key = Symbol();

root(() => {
  setContext(key, 100);
  // ...
  root(() => {
    const value = getContext(key); // 100
  });
});
```

## Debugging

The `signal`, `computed`, and `effect` functions accept a debugging ID (string) as part
of their options.

```js
import { signal, computed } from '@maverick-js/signals';

const $foo = signal(10, { id: 'foo' });
```

> **Note**
> This feature is only available in a development or testing Node environment (i.e., `NODE_ENV`).

## TypeScript

```ts
import {
  isReadSignal,
  isWriteSignal,
  type Effect,
  type ReadSignal,
  type WriteSignal,
  type MaybeSignal,
} from '@maverick-js/signals';

// Types
const signal: ReadSignal<number>;
const computed: ReadSignal<string>;
const effect: Effect;

// Provide generic if TS fails to infer correct type.
const $a = computed<string>(() => /* ... */);

const $b: MaybeSignal<number>;

if (isReadSignal($b)) {
  $b.get(); // ReadSignal<number>
}

if (isWriteSignal($b)) {
  $b.set(10); // WriteSignal<number>
}
```

## Benchmarks

### Comparison

How this library compares with [alien-signals](https://github.com/stackblitz/alien-signals),
[@preact/signals-core](https://github.com/preactjs/signals), Solid 1.x (its reactive core, vendored
in `bench/solid-js-baseline.js`), [@solidjs/signals](https://github.com/solidjs/solid) 2.x and the
TC39 [signal-polyfill](https://github.com/proposal-signals/signal-polyfill). Every library is
driven through the same nine scenarios in one process; bundle sizes are what a consumer's bundler
ships after tree-shaking the listed entry. Regenerate with `pnpm build && pnpm bench:compare`,
which rewrites this section.

<!-- bench:start -->

Measured 2026-09-09 on Apple M4 Max, Node 26.8.1. Libraries: maverick 6.0.0, alien-signals 3.2.1, preact 1.14.4, solid 1.x 1.9.15, solid 2.x 2.0.0-rc.0, signal-polyfill 0.2.2; previous release: maverick v6.0.0. Same process, each scenario best of 3 rounds of the median of 5 samples after warm-up; a sample repeats the operation for at least 20 ms and reports the time per call. Memory is the heap delta after a full collection for 100k nodes of each kind, median of 3. Bars ending in » are clipped; the value is exact.

```
Headline (ms per call, lower is better; ×: relative to maverick)

Static deps: 5 sources, set + read ×200k
  maverick         ████▎                         7.42 ms  1.00×
  alien-signals    ████████▉                     15.7 ms  2.12×
  preact           ████████▋                     15.1 ms  2.03×
  solid 1.x        ████████████▊                 22.5 ms  3.03×
  solid 2.x        ██████████████████▉           33.2 ms  4.47×
  signal-polyfill  ██████████████████████████    45.8 ms  6.16×

Deep chain: 1000 computeds ×200
  maverick         ██████████████▎               12.4 ms  1.00×
  alien-signals    ███████▉                      6.86 ms  0.56×
  preact           ██████▊                       5.89 ms  0.48×
  solid 1.x        ████████████████▎             14.0 ms  1.14×
  solid 2.x        ██████████████████████████    22.5 ms  1.82×
  signal-polyfill  ███████████████████▎          16.7 ms  1.35×

Batch: 100 signals → 1 effect ×4k
  maverick         ██▍                           4.06 ms  1.00×
  alien-signals    █████▎                        8.92 ms  2.20×
  preact           ██████▎                       10.5 ms  2.58×
  solid 1.x        █████████▉                    16.6 ms  4.10×
  solid 2.x        █████████▎                    15.6 ms  3.85×
  signal-polyfill  ██████████████████████████    43.9 ms  10.82×


Dispose N effects on one signal (ms; growth = largest ÷ smallest, linear ≈ 50×)
  library               N=1k    N=10k    N=50k   growth
  maverick              0.05     0.50     2.59   52×
  alien-signals         0.04     0.52     4.09   92×
  preact                0.05     0.47     5.52   120×
  solid 1.x             0.06     0.58     3.25   54×
  solid 2.x             0.14     1.68     14.2   101×
  signal-polyfill       14.9      335     6004   404×
  maverick v6.0.0       0.29     15.3      369   1256×

Dispose a root with N computeds (each read once) (ms; growth = largest ÷ smallest, linear ≈ 50×)
  library               N=1k    N=10k    N=50k   growth
  maverick              0.08     0.52     4.04   52×
  alien-signals         0.19     0.54     7.17   37×
  preact                0.04     0.41     2.03   53×
  solid 1.x             0.07     0.76     7.35   102×
  solid 2.x             0.10     1.07     6.01   60×
  signal-polyfill       0.35     4.20     20.1   58×
  maverick v6.0.0       0.26     15.1      402   1550×
```

<details>
<summary>All nine scenarios</summary>

```
All scenarios (ms per call, lower is better; ×: relative to maverick)

Create 10k signals + computeds
  maverick         ████▉                         0.56 ms  1.00×
  alien-signals    ████████▌                     0.97 ms  1.73×
  preact           ████▏                         0.47 ms  0.83×
  solid 1.x        ████████                      0.92 ms  1.64×
  solid 2.x        ██████████▍                   1.20 ms  2.13×
  signal-polyfill  ██████████████████████████    2.99 ms  5.32×

Create 10k effects, then dispose
  maverick         █▉                            0.51 ms  1.00×
  alien-signals    ███▌                          0.96 ms  1.87×
  preact           ██▉                           0.79 ms  1.53×
  solid 1.x        ██▉                           0.79 ms  1.54×
  solid 2.x        ███████████▉                  3.24 ms  6.30×
  signal-polyfill  ██████████████████████████»    220 ms  428.91×

Static deps: 5 sources, set + read ×200k
  maverick         ████▎                         7.42 ms  1.00×
  alien-signals    ████████▉                     15.7 ms  2.12×
  preact           ████████▋                     15.1 ms  2.03×
  solid 1.x        ████████████▊                 22.5 ms  3.03×
  solid 2.x        ██████████████████▉           33.2 ms  4.47×
  signal-polyfill  ██████████████████████████    45.8 ms  6.16×

Dynamic deps: toggle 2 sets of 10 ×100k
  maverick         ████████▍                     14.0 ms  1.00×
  alien-signals    ████████████████▉             28.2 ms  2.01×
  preact           ██████████████▎               23.8 ms  1.70×
  solid 1.x        ████████████                  20.1 ms  1.43×
  solid 2.x        ███████████████████▏          31.8 ms  2.27×
  signal-polyfill  ██████████████████████████    43.4 ms  3.09×

Deep chain: 1000 computeds ×200
  maverick         ██████████████▎               12.4 ms  1.00×
  alien-signals    ███████▉                      6.86 ms  0.56×
  preact           ██████▊                       5.89 ms  0.48×
  solid 1.x        ████████████████▎             14.0 ms  1.14×
  solid 2.x        ██████████████████████████    22.5 ms  1.82×
  signal-polyfill  ███████████████████▎          16.7 ms  1.35×

Fan-out: 1 → 1000 computeds → effect ×400
  maverick         ███████▌                      18.2 ms  1.00×
  alien-signals    █████▉                        14.1 ms  0.78×
  preact           ███████▊                      18.8 ms  1.03×
  solid 1.x        ███████████▏                  26.9 ms  1.48×
  solid 2.x        ████████████████▋             40.2 ms  2.21×
  signal-polyfill  ██████████████████████████    63.0 ms  3.47×

Diamond ×1000 with effects ×100
  maverick         ██████▎                       17.5 ms  1.00×
  alien-signals    ████▍                         12.1 ms  0.69×
  preact           █████                         14.1 ms  0.80×
  solid 1.x        ██████████▎                   28.6 ms  1.63×
  solid 2.x        ██████████████▉               41.3 ms  2.36×
  signal-polyfill  ██████████████████████████    72.5 ms  4.14×

Batch: 100 signals → 1 effect ×4k
  maverick         ██▍                           4.06 ms  1.00×
  alien-signals    █████▎                        8.92 ms  2.20×
  preact           ██████▎                       10.5 ms  2.58×
  solid 1.x        █████████▉                    16.6 ms  4.10×
  solid 2.x        █████████▎                    15.6 ms  3.85×
  signal-polyfill  ██████████████████████████    43.9 ms  10.82×

Dispose 10k effects on one signal
  maverick         ███▍                          0.47 ms  1.00×
  alien-signals    ███▋                          0.51 ms  1.07×
  preact           ███▌                          0.48 ms  1.02×
  solid 1.x        ████▏                         0.57 ms  1.21×
  solid 2.x        ███████████▉                  1.63 ms  3.46×
  signal-polyfill  ██████████████████████████»    335 ms  707.84×
```

</details>

```
Bundle size (minified + gzipped, tree-shaken from the listed entry)

min + gzip
  maverick: signal + computed                            █████▊                        1.62 kB
  maverick: + effect                                     █████▉                        1.66 kB
  maverick: basics (+ root, tick, peek, onDispose)       ██████▋                       1.86 kB
  maverick: everything (maps, selector)                  ██████████                    2.83 kB
  alien-signals: everything                              ██████▌                       1.84 kB
  preact: everything                                     ██████▌                       1.84 kB
  solid 2.x: basics (signal, memo, effect, root, flush)  ██████████████████████████    7.36 kB
  signal-polyfill: Signal namespace                      ██████████▌                   2.98 kB


Memory (bytes retained per node, lower is better)

signal (holding a number)
  maverick         ███▌                             48 B
  alien-signals    ████████▎                       112 B
  preact           ██████▌                          88 B
  solid 1.x        ████████████████████▏           272 B
  solid 2.x        ██████████████████████████      352 B
  signal-polyfill  █████████▋                      130 B
  maverick v6.0.0  █████████████████▊              240 B

computed (one dependency, read once)
  maverick         ████████▎                       274 B
  alien-signals    █████████▏                      305 B
  preact           █████████▏                      305 B
  solid 1.x        █████████████▌                  451 B
  solid 2.x        ██████████████▉                 498 B
  signal-polyfill  ██████████████████████████      867 B
  maverick v6.0.0  ██████████▋                     354 B

effect (one dependency)
  maverick         ████▌                           244 B
  alien-signals    █████▍                          296 B
  preact           █████▊                          314 B
  solid 1.x        █████▋                          309 B
  solid 2.x        █████████████▏                  715 B
  signal-polyfill  ██████████████████████████     1419 B
  maverick v6.0.0  ██████▍                         348 B
```

<!-- bench:end -->

Read the shapes, not the milliseconds: absolute numbers move by 5-10% between machines and runs.
Solid 2.x and the polyfill carry features the others do not (transitions, stores, async status;
watchers and introspection), so their rows are a like-for-like cost of the same nine operations,
not a verdict on those features.

#### In browsers

The same scenarios run headless in Chromium, WebKit and Firefox through Playwright
(`pnpm bench:browser`). This table is how many times slower alien-signals and Preact are than this
library in each engine (above 1 means this library is faster); it is refreshed by the weekly
"Browser benchmarks" workflow.

<!-- bench-browser:start -->

Measured 2026-09-09 in Chrome/153.0.8010.12, WebKit/26.6, Firefox/155.0 (headless, Playwright 1.63.0), maverick 6.0.0. Times relative to maverick; above 1 means maverick is faster.

```
scenario                              chromium          webkit            firefox
                                         alien  preact     alien  preact     alien  preact
Create 10k signals + computeds           1.07×   0.69×     1.23×   0.78×     0.53×   0.47×
Create 10k effects, then dispose         1.53×   1.31×     1.44×   1.84×     0.98×   1.56×
Static deps: 5 sources, set + read       2.33×   2.26×     1.50×   2.17×     2.34×   2.69×
Dynamic deps: toggle 2 sets of 10        2.24×   1.83×     1.77×   1.19×     1.74×   1.68×
Deep chain: 1000 computeds               0.45×   0.45×     0.53×   0.66×     0.61×   0.72×
Fan-out: 1 → 1000 computeds → effect     0.88×   1.01×     1.39×   1.50×     1.24×   1.72×
Diamond ×1000 with effects               0.86×   0.88×     1.04×   1.13×     1.13×   1.17×
Batch: 100 signals → 1 effect            2.62×   2.95×     2.86×   2.86×     1.27×   2.09×
Dispose 10k effects on one signal        1.04×   1.02×     1.04×   1.43×     0.63×   0.94×
```

<!-- bench-browser:end -->

### Running

The `bench/` directory contains a benchmark suite built on [Vitest's benchmark
runner](https://vitest.dev/guide/benchmarking). Every scenario compares the current build against a
baseline built from any git ref in the same process, so changes can be measured rather than guessed
at:

```bash
$: pnpm build                 # build dist/prod (the "current" library)
$: pnpm bench:baseline v6.0.0 # build bench/.baseline from a git ref
$: pnpm bench                 # run synthetic + graph + DOM emulation suites (~4 min)
$: pnpm bench:quick           # smaller sizes, ~1 min
$: pnpm bench -t dispose      # only scenarios whose name matches
$: pnpm bench:compare         # cross-library charts (rewrites the section above)
$: pnpm bench:browser         # the same comparison in Chromium, WebKit and Firefox
```

- `bench/synthetic.bench.js` - raw micro-benchmarks (create/read/write, static/dynamic deps,
  fan-out, fan-in, deep chains, diamonds, disposal, `computedMap`/`computedKeyedMap`, errors,
  context).
- `bench/graph.bench.js` - Reactively-style random graphs (`width x depth`, static/dynamic,
  pull/push) that assert both builds run the same number of computations.
- `bench/dom.bench.js` - "real work" emulation on a fake DOM (TodoMVC, data grid, nested
  components, form, the js-framework-benchmark row operations, a media-player update loop and
  component mount/unmount churn) that asserts both builds perform identical DOM mutations.

See [`bench/README.md`](./bench/README.md) for reading the tables, the A/A calibration mode, and
notes on noise.

## Inspiration

`@maverick-js/signals` was made possible based on code and learnings from:

- [Reactively][reactively]
- [Solid JS][solidjs]
- [Sinuous][sinuous]
- [Hyperactiv][hyperactiv]
- [Svelte Scheduler][svelte-scheduler]

Special thanks to Modderme, Wesley, Julien, and Solid/Svelte contributors for all their work 🎉

[package]: https://www.npmjs.com/package/@maverick-js/signals
[package-badge]: https://img.shields.io/npm/v/@maverick-js/signals/latest
[license]: https://github.com/maverick-js/signals/blob/main/LICENSE
[license-badge]: https://img.shields.io/github/license/maverick-js/signals
[size-badge]: https://img.shields.io/bundlephobia/minzip/@maverick-js/signals@^5.0.0
[reactively]: https://github.com/modderme123/reactively
[solidjs]: https://github.com/solidjs/solid
[sinuous]: https://github.com/luwes/sinuous
[hyperactiv]: https://github.com/elbywan/hyperactiv
[svelte-scheduler]: https://github.com/sveltejs/svelte/blob/master/src/runtime/internal/scheduler.ts
[mdn-microtasks]: https://developer.mozilla.org/en-US/docs/Web/API/HTML_DOM_API/Microtask_guide
[stackblitz-demo]: https://stackblitz.com/edit/maverick-signals?embed=1&file=index.ts&hideExplorer=1&hideNavigation=1&view=editor
[bundlephobia]: https://bundlephobia.com/package/@maverick-js/signals@^5.0.0
[maverick-scheduler]: https://github.com/maverick-js/scheduler