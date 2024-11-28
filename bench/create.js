import { Bench } from 'tinybench';
import { libs } from './libs.js';
import { runBenches } from './print.js';

const benches = [],
  amount = 1_000_000;

for (const type of ['signal', 'computed']) {
  const bench = new Bench({
    name: type,
    iterations: 100,
  });

  for (const libName of Object.keys(libs)) {
    const signal = libs[libName][type];
    bench.add(libName, () => {
      for (let i = 0; i < amount; i++) signal(i);
    });
  }

  benches.push(bench);
}

runBenches(benches);
