#! /usr/bin/env node

import { Command } from 'commander';
import { readFileSync } from 'fs';
import { createInterface } from 'readline/promises';
import * as report from './src/report.js';
import { run } from './src/runner.js';

// Read at run time so `lhrun --version` cannot drift from the published version.
const { version } = JSON.parse(readFileSync(new URL('package.json', import.meta.url), 'utf8'));

const program = new Command();

program
  .version(version)
  .argument('<url>', 'URL to test')
  .argument('[runs]', 'Number of iterations', 5)
  .option('--cpu <number>', 'CPU slowdown multiplier', 5.2)
  .option('--rand', 'Give each run a unique ?rand= value, to measure past page caches')
  .option('--save [name]', 'Save the result under a name, made from the URL by default')
  .option(
    '--diff [name]',
    'Show the difference with a saved result, picked from a list without a name'
  )
  .description('Run lighthouse tests')
  .action(async (url, runs, options) => {
    const diff = options.diff === true ? await pick() : options.diff;
    if (diff === null) return;

    const completed = await run(url, Math.max(1, Number(runs) || 1), {
      cpu: Number(options.cpu) || 5.2,
      rand: options.rand,
      diff,
    });

    // Saved only once the run succeeds, so a failed run cannot clobber an earlier save.
    if (options.save && completed) {
      console.log(`Saved to ${report.saveLast(options.save === true ? undefined : options.save)}`);
    }
  });

program
  .command('save')
  .argument('[name]', 'Name to save under, made from the URL by default')
  .description('Save the last run under a persistent name')
  .action(name => {
    const folder = report.saveLast(name);
    console.log(folder ? `Saved to ${folder}` : 'Nothing to save, run a test first');
    process.exitCode = folder ? 0 : 1;
  });

program
  .command('clear')
  .description('Remove saved reports')
  .action(() => report.clear());

program.parseAsync();

// Returns the chosen saved name, or null when there is nothing to pick or the answer is invalid.
async function pick() {
  const saved = report.list();
  if (!saved.length) {
    console.log('No saved results');
    return null;
  }

  const width = Math.max(...saved.map(r => r.name.length));
  saved.forEach(({ name, date, url }, i) => {
    const number = String(i + 1).padStart(String(saved.length).length);
    console.log(
      `${number}) ${name.padEnd(width)}  ${date.toLocaleString()}  ${url ?? ''}`.trimEnd()
    );
  });

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  // Ctrl+C or Ctrl+D rejects the question; treat it as a quiet cancel.
  const answer = await rl.question('Compare with: ').catch(() => null);
  rl.close();
  if (answer === null) return null;

  const chosen = saved[Number(answer) - 1]?.name ?? saved.find(r => r.name === answer.trim())?.name;
  if (!chosen) console.log(`No saved results named "${answer.trim()}"`);
  return chosen ?? null;
}
