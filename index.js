#! /usr/bin/env node

import { Command } from 'commander';
import fs from 'fs';
import * as path from 'path';
import lighthouse from 'lighthouse';
import * as chromeLauncher from 'chrome-launcher';
import ejs from 'ejs';
import logUpdate from 'log-update';
import cliSpinners from 'cli-spinners';
import Table from 'cli-table3';
import colors from '@colors/colors';
import terminalLink from 'terminal-link';
import { fileURLToPath } from 'url';
import https from 'https';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const program = new Command();

program
  .argument('<url>', 'URL to test')
  .argument('[number]', 'Number of iterations', 3)
  .option('--save', 'Save lighthouse report', 1)
  .option('--cpu <number>', 'CPU slowdown multiplier', 5.2)
  .description('Run lighthouse tests')
  .action(lighthouses);

program
  .command('clear')
  .description('Remove saved reports')
  .action(() => {
    fs.rmSync('reports', {
      recursive: true,
      force: true,
    });
  });

const spinner = (function () {
  let timer, i = 0;

  return {
    show(prefix) {
      clearInterval(timer);

      timer = setInterval(() => {
        logUpdate(`${prefix ? prefix + "\n" : ''}${cliSpinners.dots.frames[i = ++i % cliSpinners.dots.frames.length]}`);
      }, cliSpinners.dots.interval);
    },

    hide() {
      clearInterval(timer);
    }
  }
})();

program.parse();

const audits = [
  { id: 'score', title: 'Performance', ranges: [[0, 49], [50, 89], [90, 100]], inverted: true, skip: true },
  { id: 'dom-size', title: 'DOM Size', ranges: [[0, 800], [801, 1400], [1401, 9999]] },
  { id: 'first-contentful-paint', title: 'First Contentful Paint', ranges: [[0, 1.8], [1.8, 3], [3, 99]] },
  { id: 'largest-contentful-paint', title: 'Largest Contentful Paint', ranges: [[0, 2.5], [2.5, 4], [4, 99]] },
  { id: 'total-blocking-time', title: 'Total Blocking Time', ranges: [[0, 200], [200, 600], [600, 999]] },
  { id: 'cumulative-layout-shift', title: 'Cumulative Layout Shift', ranges: [[0, 0.1], [0.1, 0.25], [0.25, 99]] },
  { id: 'interactive', title: 'Time to Interactive', ranges: [[0, 3.8], [3.9, 7.3], [7.3, 99]] },
  { id: 'speed-index', title: 'Speed Index', ranges: [[0, 3.4], [3.4, 5.8], [5.8, 99]] },
  { id: 'mainthread-work-breakdown', title: 'Mainthread Work', ranges: [[0, 3.4], [3.4, 5.8], [5.8, 99]] },
  { id: 'server-response-time', title: 'Server Response Time', ranges: [[0, 100], [100, 250], [250, 999]] },
  { id: 'network-server-latency', title: 'TTFB', ranges: [[0, 800], [801, 1800], [1801, 9999]] },
  { id: 'scripts', title: 'Scripts', ranges: [[0, 500], [501, 1000], [1001, 9999]], skip: true },
];

async function lighthouses(url, number, options) {
  logUpdate(colors.green('Warming up the page...'));

  var canProceed = await new Promise(resolve => {
    https.get(url, { rejectUnauthorized: false }, res => {
      res.on('data', (d) => {});

      if (res.statusCode === 200) {
        logUpdate(colors.green('Warming up the page... Done.'));
        console.log();
      } else {
        console.log(colors.red(`Failed — response code is ${res.statusCode}.`));
      }

      resolve(res.statusCode === 200);
    }).on('error', err => {
      console.log(colors.red(err.message));
      resolve(false);
    });
  });

  if (!canProceed) {
    return;
  }

  spinner.show();

  const chrome = await chromeLauncher.launch({
    startingUrl: url,
    chromeFlags: [
      '--headless',
      '--ignore-certificate-errors',
    ]
  });

  const folder = path.join('reports', !options.save ? 'latest' : [
    (new Date()).toISOString().replace(/\..*/g, ''),
    url.replace(/(https?|[\W]+)/g, '-').replace(/(^-{1,}|-{1,}$)/g, ''),
  ].join('-'));
  fs.rmSync(folder, { recursive: true, force: true });
  fs.mkdirSync(folder, { recursive: true });

  const result = {
    path: path.join(__dirname, folder),
    scores: {
      score: [],
      scripts: [],
    }
  };
  let success = true;
  let skipped = 0;
  let runnerResult;

  do {
    runnerResult = await lighthouse(url, {
      logLevel: 'error',
      output: 'html',
      throttlingMethod: 'simulate',
      onlyCategories: ['performance'],
      port: chrome.port,
      throttling: {
        cpuSlowdownMultiplier: options.cpu,
        requestLatencyMs: 150,
        downloadThroughputKbps: 1000,
        uploadThroughputKbps: 750,
      }
    });

    if (runnerResult.lhr.runtimeError) {
      spinner.hide();
      logUpdate(colors.red(runnerResult.lhr.runtimeError.message));
      if (runnerResult.lhr.audits['resource-summary'].errorStack) {
        console.log(runnerResult.lhr.audits['resource-summary'].errorStack);
      }
      success = false;
      break;
    }

    if (runnerResult.lhr.categories.performance.score === undefined ||
        audits.some(audit => !audit.skip && runnerResult.lhr.audits[audit.id]?.displayValue === undefined)
    ) {
      skipped++;

      if (skipped > 1) {
        break;
      }

      number++;
      continue;
    }

    skipped = 0;
    result.scores.score.push(Math.round(runnerResult.lhr.categories.performance.score * 100, 10));
    audits.forEach(audit => {
      if (audit.skip) {
        return;
      }

      if (!result.scores[audit.id]) {
        result.scores[audit.id] = [];
      }

      result.scores[audit.id].push(
        runnerResult.lhr.audits[audit.id].displayValue
          ?.replace('Root document took ', '')
          ?.replace(' elements', '')
          ?.replace(',', '')
      );
    });

    result.scores.scripts.push(
      Math.round(
        runnerResult.lhr.audits['resource-summary']['details']['items']
          .find(i => i.resourceType === 'script').transferSize / 1024,
        10
      )
      + ' KB'
    );

    fs.writeFileSync(`${folder}/${result.scores.score.length}.html`, runnerResult.report);
    fs.writeFileSync(
      `${folder}/index.html`,
      ejs.render(fs.readFileSync('report.ejs', { encoding: 'utf8' }), {
        scores: result.scores,
        audits: audits
      })
    );

    if (number > 1) {
      let scoresTable = buildScoresTable(result);
      let resourcesTable = buildResourcesTable(runnerResult.lhr.audits['resource-summary']['details']['items']);
      spinner.show([scoresTable.toString(), resourcesTable.toString()].join('\n'));
    }
  } while (--number > 0);

  if (success) {
    spinner.hide();
    let scoresTable = buildScoresTable(result);
    let resourcesTable = buildResourcesTable(runnerResult.lhr.audits['resource-summary']['details']['items']);
    logUpdate([scoresTable.toString(), resourcesTable.toString()].join('\n'));
  }

  await chrome.kill();
}

function buildResourcesTable(data) {
  const table = new Table({
    head: [
      'Resources',
      ...data.filter(res => res.transferSize).map((res, i) => res.label),
    ],
    style: { head: [] },
  });

  table.push([
    'Size, KB',
    ...data.filter(res => res.transferSize).map(res => Math.round(res.transferSize / 1024)),
  ]);
  table.push([
    'Count',
    ...data.filter(res => res.transferSize).map(res => res.requestCount),
  ]);

  return table;
}

function buildScoresTable(result) {
  if (!result.scores.score.length) {
    return colors.red('Unable to perform the test');
  }

  const table = new Table({
    head: [
      'Metric',
      ...result.scores.score.map((score, i) => `Test #${i + 1}`),
      'Avg.',
      'Legend',
    ],
    style: { head: [] },
  });

  const sums = [];
  audits.forEach((audit, i) => {
    sums[audit.id] = result.scores[audit.id].reduce((acc, score) => acc + toFloat(score), 0);
  });

  audits.forEach(audit => {
    table.push([
      audit.title,
      ...result.scores[audit.id].map(score => colorifyScore(score, audit.ranges, audit.inverted)),
      colorifyScore(Math.round(sums[audit.id] / result.scores.score.length * 100) / 100, audit.ranges, audit.inverted),
      [
        colors.green(audit.ranges[audit.inverted ? 2 : 0].join('–')),
        colors.yellow(audit.ranges[1].join('–')),
        colors.red(audit.ranges[audit.inverted ? 0 : 2].join('–')),
      ].join(' ')
    ]);
  });

  table.push([{
    colSpan: result.scores.score.length + 2,
    content: terminalLink('Open in Browser', `file://${result.path}/index.html`),
  }]);

  return table;
}

function colorifyScore(score, ranges, inverse) {
  let float = toFloat(score);
  let result = inverse ? colors.green(score) : colors.red(score);

  if (float <= ranges[0][1]) {
    result = inverse ? colors.red(score) : colors.green(score);
  } else if (float <= ranges[1][1]) {
    result = colors.yellow(score);
  }

  return result;
}

function toFloat(score) {
  return parseFloat((score + '').replace(',', ''));
}
