import * as chromeLauncher from 'chrome-launcher';
import colors from '@colors/colors';
import http from 'http';
import https from 'https';
import lighthouse from 'lighthouse';
import { chromeFlags, lighthouseOptions, metrics, resources, toNumber } from './audits.js';
import * as report from './report.js';
import * as spinner from './spinner.js';
import { failureMessage, render } from './tables.js';

const MAX_RETRIES = 2;

export async function run(url, runs, { save, cpu, rand }) {
  const warmed = await warmUp(url);

  if (!warmed.ok) {
    spinner.clear();
    console.log(colors.red(warmed.message));
    return;
  }

  const folder = report.createFolder(url, save);
  const state = { runs, values: metrics.map(() => []), resources: null, path: folder };
  const chrome = await chromeLauncher.launch({ startingUrl: url, chromeFlags });

  spinner.show(render(state));

  try {
    let completed = 0;
    let retries = 0;

    while (completed < runs) {
      const target = rand ? withRand(url) : url;
      const { lhr, report: html } = await lighthouse(target, options(chrome.port, cpu));

      if (lhr.runtimeError) {
        showRuntimeError(lhr);
        return;
      }

      const values = readMetrics(lhr);

      if (!values) {
        if (++retries > MAX_RETRIES) {
          break;
        }
        continue;
      }

      retries = 0;
      values.forEach((value, i) => (state.values[i][completed] = value));
      state.resources = readResources(lhr);
      completed++;

      report.saveRun(folder, completed, html);
      report.saveIndex(folder, completed);
      spinner.show(render(state));
    }

    spinner.clear();
    console.log(completed ? render(state) : failureMessage());
  } finally {
    await chrome.kill();
  }
}

// The warm-up keeps the plain URL, so only the measured runs are cache misses.
function withRand(url) {
  const target = new URL(url);

  target.searchParams.set('rand', Math.random().toString(36).slice(2, 8));

  return target.toString();
}

function options(port, cpu) {
  return {
    ...lighthouseOptions,
    port,
    throttling: { ...lighthouseOptions.throttling, cpuSlowdownMultiplier: cpu },
  };
}

function warmUp(url) {
  spinner.status(colors.green('Warming up the page...'));

  return new Promise(resolve => {
    const client = url.startsWith('http://') ? http : https;

    client
      .get(url, { rejectUnauthorized: false }, response => {
        response.resume();

        const ok = response.statusCode === 200;

        if (ok) {
          spinner.status(colors.green('Warming up the page... Done.'));
          spinner.commit();
        }

        resolve({ ok, message: `Failed — response code is ${response.statusCode}.` });
      })
      .on('error', error => resolve({ ok: false, message: error.message }));
  });
}

// null if the run produced anything unusable, which is what lets `read` skip its own checks.
function readMetrics(lhr) {
  const values = [];

  for (const metric of metrics) {
    let value;

    try {
      value = metric.read(lhr);
    } catch {
      return null;
    }

    if (value === undefined || value === null || Number.isNaN(toNumber(value))) {
      return null;
    }

    values.push(value);
  }

  return values;
}

// One entry per resource column, in the same order: tables.js looks them up by position.
function readResources(lhr) {
  const items = lhr.audits['resource-summary'].details.items;

  return resources.map(({ types }) => {
    const matched = items.filter(item => types.includes(item.resourceType));

    return {
      size: Math.round(sum(matched, 'transferSize') / 1024),
      count: sum(matched, 'requestCount'),
    };
  });
}

function sum(items, field) {
  return items.reduce((total, item) => total + (item[field] ?? 0), 0);
}

function showRuntimeError(lhr) {
  spinner.clear();
  console.log(colors.red(lhr.runtimeError.message));

  const stack = lhr.audits['resource-summary']?.errorStack;

  if (stack) {
    console.log(stack);
  }
}
