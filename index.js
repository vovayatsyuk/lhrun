#! /usr/bin/env node

import { Command } from 'commander';
import fs from 'fs';
import { run } from './src/runner.js';

const program = new Command();

program
  .argument('<url>', 'URL to test')
  .argument('[runs]', 'Number of iterations', 3)
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
  .action(() => fs.rmSync('reports', { recursive: true, force: true }));

program.parse();
