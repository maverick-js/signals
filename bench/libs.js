import * as preact from '@preact/signals-core';
import * as alien from 'alien-signals';
import * as maverick from '../dist/prod/index.js';

export const libs = {
  alien: {
    signal: alien.signal,
    computed: alien.computed,
    read: (signal) => signal.get(),
    write: (signal, value) => signal.set(value),
  },
  preact: {
    signal: preact.signal,
    computed: preact.computed,
    read: (signal) => signal.value,
    write: (signal, value) => {
      signal.value = value;
    },
  },
  maverick: {
    signal: maverick.signal,
    computed: maverick.computed,
    read: (signal) => signal.get(),
    write: (signal, value) => signal.set(value),
    flush: maverick.flushSync,
  },
};
