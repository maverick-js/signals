export async function runBenches(benches, { unit = 'micro' } = {}) {
  for (const bench of benches) {
    console.log('-------------------------- ', bench.name, ' --------------------------');

    await bench.run();

    console.table(
      bench.table((task) => {
        return {
          name: task.name,
          [`time (${unit === 'micro' ? 'µs' : 'ms'})`]: formatNumber(
            task.result?.latency.mean,
            unit,
          ),
          p50: formatNumber(task.result?.latency.p50, unit),
          p75: formatNumber(task.result?.latency.p75, unit),
          p99: formatNumber(task.result?.latency.p99, unit),
        };
      }),
    );
  }
}

const conversion = {
  micro: 1000,
  ms: 1,
  s: 0.001,
};

const formatter = new Intl.NumberFormat('en-US', {
  maximumSignificantDigits: 2,
});

function formatNumber(value = -1, unit) {
  return formatter.format(value * conversion[unit]);
}
