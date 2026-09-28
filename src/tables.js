import Table from 'cli-table3';
import colors from '@colors/colors';
import stringWidth from 'string-width';
import terminalLink from 'terminal-link';
import { metrics, resources, toNumber } from './audits.js';

const EMPTY = colors.gray('·');
const DIFF_WIDTH = 3; // room for " +1,234"
const PADDING = 2; // cli-table3 pads each cell with a space on both sides
const SEAMLESS = { mid: '', 'left-mid': '', 'mid-mid': '', 'right-mid': '' };

// Both tables are drawn at full size before the first run, so widths are fixed up front —
// otherwise the layout shifts every time a value arrives.
const rangeWidths = [0, 1, 2].map(i => widest(metrics.map(metric => ranges(metric)[i])));
const legends = metrics.map(metric => {
  const [good, ok, poor] = ranges(metric);

  return [
    colors.green(good.padEnd(rangeWidths[0])),
    colors.yellow(ok.padEnd(rangeWidths[1])),
    colors.red(poor),
  ].join(' ');
});
const legendWidth = rangeWidths.reduce((total, width) => total + width, 0) + 2;
const titleWidth = widest(metrics.map(metric => metric.title));
const rowLabelWidth = widest(['Resources', 'Size, KB', 'Count']);
const resourceWidth = Math.max(widest(resources.map(resource => resource.label)), 6); // fits 5 digits

export function render({ runs, values, previous, resources: sizes, path }) {
  return [
    scoresTable(runs, values, previous?.values, path),
    resourcesTable(sizes, previous?.resources),
  ].join('\n');
}

export function failureMessage(failures = []) {
  const lines = [colors.red('Unable to perform the test')];

  if (failures.length) {
    lines.push('', 'Every attempt failed while reading the report:', '', ...explain(failures));
  }

  return lines.join('\n');
}

// Printed under a partial table: runs that had to be retried are worth explaining even when
// enough of them eventually succeeded.
export function retryNotice(failures = []) {
  if (!failures.length) {
    return '';
  }

  const attempts = failures.length === 1 ? 'attempt was' : 'attempts were';

  return [
    '',
    colors.yellow(`${failures.length} ${attempts} discarded:`),
    '',
    ...explain(failures),
  ].join('\n');
}

// Identical failures are the norm — a renamed audit misses on every attempt — so they are
// grouped instead of repeated.
function explain(failures) {
  const groups = new Map();

  for (const failure of failures) {
    const key = `${failure.title}\n${failure.reason}`;
    const group = groups.get(key) ?? { ...failure, times: 0 };

    group.times++;
    groups.set(key, group);
  }

  return [...groups.values()].flatMap(({ title, reason, detail, times }) => [
    `  ${colors.yellow(title)}${times > 1 ? colors.gray(` (\u00d7${times})`) : ''}`,
    `    ${reason}`,
    ...(detail && detail !== reason ? [colors.gray(`    ${detail}`)] : []),
  ]);
}

function scoresTable(runs, values, previous, path) {
  const valueWidth =
    Math.max(widest([`Test #${runs}`, 'Avg.']), 8) + (previous ? DIFF_WIDTH : 0) + PADDING;

  const table = new Table({
    head: ['Metric', ...times(runs, i => `Test #${i + 1}`), 'Avg.', 'Legend'],
    colWidths: [
      titleWidth + PADDING,
      ...times(runs, () => valueWidth),
      valueWidth,
      legendWidth + PADDING,
    ],
    style: { head: [] },
  });

  metrics.forEach((metric, i) => {
    const recorded = values[i].filter(isPresent);
    const before = average(previous?.[i]?.filter(isPresent) ?? [], metric.decimals);
    const avg = average(recorded, metric.decimals);
    const withDelta = value =>
      spread(
        colorize(value, metric),
        delta(value, before, higherIsBetter(metric)),
        valueWidth - PADDING
      );
    const row = [
      metric.title,
      ...times(runs, run => withDelta(values[i][run])),
      withDelta(avg),
      legends[i],
    ];

    // Every row draws the rule above itself. The first one keeps it — that is the line under
    // the header — and the rest drop it, leaving the footer to draw its own.
    table.push(i === 0 ? row : row.map(content => ({ content, chars: SEAMLESS })));
  });

  table.push([
    {
      colSpan: runs + 3, // every column
      content: terminalLink('Open in Browser', `file://${path}/index.html`),
    },
  ]);

  return table.toString();
}

// Compares the last run with the last run of the previous result: resources barely vary.
function resourcesTable(sizes, previous) {
  const width = resourceWidth + (previous ? DIFF_WIDTH : 0) + PADDING;
  const table = new Table({
    head: ['Resources', ...resources.map(resource => resource.label)],
    colWidths: [rowLabelWidth + PADDING, ...resources.map(() => width)],
    style: { head: [], compact: true },
  });
  const row = field =>
    resources.map((_, i) => {
      const value = sizes?.[i]?.[field];

      return spread(cell(value), delta(value, previous?.[i]?.[field], false), width - PADDING);
    });

  table.push(['Size, KB', ...row('size')]);
  table.push(['Count', ...row('count')]);

  return table.toString();
}

function colorize(value, metric) {
  if (!isPresent(value)) {
    return EMPTY;
  }

  const number = toNumber(value);
  const text = String(value).replace(/\s+/g, ''); // "1.5 s" -> "1.5s", one column narrower

  if (within(number, metric.good)) {
    return colors.green(text);
  }

  return within(number, metric.ok) ? colors.yellow(text) : colors.red(text);
}

// A score like Performance is better when higher; timings and sizes when lower.
function higherIsBetter(metric) {
  return metric.good[0] > metric.poor[0];
}

function delta(value, before, higherIsBetter) {
  if (!isPresent(value) || !isPresent(before)) {
    return '';
  }

  const change = Math.round((toNumber(value) - toNumber(before)) * 100) / 100;

  if (!change) {
    return colors.gray(' 0');
  }

  const better = higherIsBetter ? change > 0 : change < 0;
  const text = ` ${change > 0 ? '+' : ''}${change}`;

  return better ? colors.green(text) : colors.red(text);
}

// Pushes the diff to the right edge of the cell, so diffs line up down the column.
function spread(left, right, width) {
  return right
    ? left + ' '.repeat(Math.max(1, width - stringWidth(String(left)) - stringWidth(right))) + right
    : left;
}

function within(number, [min, max]) {
  return number >= min && number <= max;
}

function average(values, decimals = 2) {
  if (!values.length) {
    return undefined;
  }

  const sum = values.reduce((total, value) => total + toNumber(value), 0);

  const scale = 10 ** decimals;

  return Math.round((sum / values.length) * scale) / scale;
}

function isPresent(value) {
  return value !== undefined && value !== null;
}

function cell(value) {
  return isPresent(value) ? value : EMPTY;
}

function ranges(metric) {
  return [metric.good, metric.ok, metric.poor].map(range => range.join('–'));
}

function widest(strings) {
  return Math.max(...strings.map(string => string.length));
}

function times(count, fn) {
  return Array.from({ length: count }, (_, i) => fn(i));
}
