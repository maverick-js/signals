import { createVitest } from 'vitest/node';

const file = process.argv[process.argv.length - 1];

const vitest = await createVitest({
  include: !/^(\/|--)/.test(file) ? [`tests/${file}.test.ts`] : [`tests/**/*.test.ts`],
  globals: true,
  watch: process.argv.includes('--watch'),
});

await vitest.start();
