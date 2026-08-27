#! /usr/bin/env node

import { Command } from 'commander';
import { readFileSync } from 'fs';
import * as report from './src/report.js';
import { run } from './src/runner.js';

// Read at run time so `lhrun --version` cannot drift from the published version.
const { version } = JSON.parse(readFileSync(new URL('package.json', import.meta.url), 'utf8'));

const program = new Command();

program
  .version(version)
  .argument('<url>', 'URL to test')
  .argument('[runs]', 'Number of iterations', 5)
  .option('--save', 'Keep the report instead of overwriting reports/latest')
  .option('--cpu <number>', 'CPU slowdown multiplier', 5.2)
  .option('--rand', 'Give each run a unique ?rand= value, to measure past page caches')
  .description('Run lighthouse tests')
  .action((url, runs, options) =>
    run(url, Math.max(1, Number(runs) || 1), {
      save: options.save,
      cpu: Number(options.cpu) || 5.2,
      rand: options.rand,
    })
  );

program
  .command('clear')
  .description('Remove saved reports')
  .action(() => report.clear());

program.parse();
