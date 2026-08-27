import * as chromeLauncher from 'chrome-launcher';
import colors from '@colors/colors';
import http from 'http';
import https from 'https';
import lighthouse from 'lighthouse';
import { chromeFlags, lighthouseOptions, metrics, resources, toNumber } from './audits.js';
import * as report from './report.js';
import * as spinner from './spinner.js';
import { failureMessage, render, retryNotice } from './tables.js';

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
    const failures = [];

    while (completed < runs) {
      const target = rand ? withRand(url) : url;
      let result;

      try {
        result = await lighthouse(target, options(chrome.port, cpu));
      } catch (error) {
        spinner.clear();
        console.log(crashMessage(error));
        return;
      }

      const { lhr, report: html } = result;

      if (lhr.runtimeError) {
        spinner.clear();
        console.log(runtimeErrorMessage(lhr.runtimeError));
        return;
      }

      const { values, resources: sizes, failure } = readRun(lhr);

      if (failure) {
        failures.push(failure);

        if (++retries > MAX_RETRIES) {
          break;
        }
        continue;
      }

      retries = 0;
      values.forEach((value, i) => (state.values[i][completed] = value));
      state.resources = sizes;
      completed++;

      report.saveRun(folder, completed, html);
      report.saveIndex(folder, completed);
      spinner.show(render(state));
    }

    spinner.clear();
    console.log(completed ? render(state) + retryNotice(failures) : failureMessage(failures));
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

        resolve({ ok, message: warmUpFailure(url, response) });
      })
      .on('error', error => resolve({ ok: false, message: `Warm-up failed — ${error.message}` }));
  });
}

// A redirect is the usual warm-up failure — a missing trailing slash, http to https, a login
// gate — and only the location says which. It goes on its own line so that nothing can be
// mistaken for part of the URL.
function warmUpFailure(url, { statusCode, headers }) {
  const lines = [`Warm-up failed — ${url} responded with ${statusCode}.`];

  if (headers.location) {
    lines.push(`Redirected to: ${absolute(headers.location, url)}`);
  }

  return lines.join('\n');
}

// A Location may be relative, and a relative one is useless to paste back into the command.
function absolute(location, base) {
  try {
    return new URL(location, base).toString();
  } catch {
    return location;
  }
}

// One reader for the whole run. Metrics and resources fail the same way — an audit a
// Lighthouse upgrade renamed or dropped — and either way the failure has to name the audit
// instead of the symptom, so `read` in audits.js still needs no checks of its own.
function readRun(lhr) {
  const values = [];

  for (const metric of metrics) {
    const { traced, missing } = trace(lhr);
    let value;

    try {
      value = metric.read(traced);
    } catch (error) {
      return { failure: describe(metric.title, missing, lhr, error.message) };
    }

    if (value === undefined || value === null || Number.isNaN(toNumber(value))) {
      return { failure: describe(metric.title, missing, lhr, `read ${quote(value)}`) };
    }

    values.push(value);
  }

  const { traced, missing } = trace(lhr);

  try {
    return { values, resources: readResources(traced) };
  } catch (error) {
    return { failure: describe('Resources', missing, lhr, error.message) };
  }
}

// A reader reaches into lhr.audits by id, so a renamed audit only ever surfaces as "cannot
// read properties of undefined" from somewhere inside the reader. Recording the ids it asks
// for and does not get is what lets the failure name the audit.
function trace(lhr) {
  const missing = [];
  const audits = new Proxy(lhr.audits, {
    get(target, key) {
      if (typeof key === 'string' && !(key in target)) {
        missing.push(key);
      }

      return target[key];
    },
  });

  return { traced: { ...lhr, audits }, missing };
}

function describe(title, missing, lhr, detail) {
  if (!missing.length) {
    return { title, reason: detail };
  }

  const available = Object.keys(lhr.audits);
  const reason = missing.map(id => `missing audit "${id}"${suggest(id, available)}`).join(', ');

  return { title, reason, detail };
}

// An upgrade usually renames an audit rather than dropping it, and the new id tends to keep
// the old one inside it — `dom-size` became `dom-size-insight` in Lighthouse 13.
function suggest(id, available) {
  const stem = id.replace(/-insight$/, '');
  const close = available.filter(other => other !== id && other.includes(stem)).slice(0, 3);

  return close.length ? ` — this report has ${close.map(other => `"${other}"`).join(', ')}` : '';
}

function quote(value) {
  return value === undefined || value === null ? String(value) : `"${value}"`;
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

// Lighthouse reports a page it could not analyse in the result rather than by throwing.
function runtimeErrorMessage({ code, message }) {
  return [
    colors.red('Lighthouse could not analyse the page'),
    `  ${code ? `${code}: ` : ''}${message}`,
  ].join('\n');
}

function crashMessage(error) {
  const lines = [
    colors.red('Lighthouse failed to run'),
    `  ${error.code ? `${error.code}: ` : ''}${error.friendlyMessage ?? error.message}`,
  ];

  if (error.stack) {
    lines.push(colors.gray(error.stack.split('\n').slice(1, 4).join('\n')));
  }

  return lines.join('\n');
}
