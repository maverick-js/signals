import { Bench } from 'tinybench';
import { libs } from './libs.js';
import { runBenches } from './print.js';

const benches = [],
  depths = [500, 1000, 2000],
  solutions = {
    500: [-2, 1, -4, -4],
    1000: [-2, -4, 2, 3],
    2000: [-2, 1, -4, -4],
  },
  shouldValidate = process.argv.includes('--validate');

for (const depth of depths) {
  const bench = new Bench({
    name: depth + '',
    iterations: 100,
  });

  for (const libName of Object.keys(libs)) {
    const lib = libs[libName];

    bench.add(libName, () => {
      const { a, b, c, d, layers } = createLayers(depth, lib);

      lib.write(a, 1);
      lib.write(b, 3);
      lib.write(c, 2);
      lib.write(d, 1);

      const end = layers,
        result = [lib.read(end.a), lib.read(end.b), lib.read(end.c), lib.read(end.d)];

      lib.flush?.();

      if (shouldValidate) {
        if (result.every((value, i) => solutions[depth][i] === value)) {
          throw Error('invalid solution');
        }
      }
    });
  }

  benches.push(bench);
}

function createLayers(count, lib) {
  let a = lib.signal(1),
    b = lib.signal(2),
    c = lib.signal(3),
    d = lib.signal(4),
    start = { a, b, c, d },
    layers = start;

  for (let i = count; i--; ) {
    layers = ((m) => {
      const props = {
        a: lib.computed(() => lib.read(m.b)),
        b: lib.computed(() => lib.read(m.a) - lib.read(m.c)),
        c: lib.computed(() => lib.read(m.b) + lib.read(m.d)),
        d: lib.computed(() => lib.read(m.c)),
      };

      return props;
    })(layers);
  }

  return { a, b, c, d, layers };
}

await runBenches(benches);
