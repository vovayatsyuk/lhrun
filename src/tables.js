import Table from 'cli-table3';
import colors from '@colors/colors';
import terminalLink from 'terminal-link';
import { metrics, resources, toNumber } from './audits.js';

const EMPTY = colors.gray('·');
const PADDING = 2; // cli-table3 pads each cell with a space on both sides

// Both tables are drawn at full size before the first run, so widths are fixed up front —
// otherwise the layout shifts every time a value arrives.
const legends = metrics.map(metric => {
  const [good, ok, poor] = ranges(metric);

  return [colors.green(good), colors.yellow(ok), colors.red(poor)].join(' ');
});
const legendWidth = widest(metrics.map(metric => ranges(metric).join(' ')));
const titleWidth = widest(metrics.map(metric => metric.title));
const rowLabelWidth = widest(['Resources', 'Size, KB', 'Count']);
const resourceWidth = Math.max(widest(resources.map(resource => resource.label)), 6); // fits 5 digits

export function render({ runs, values, resources: sizes, path }) {
  return [scoresTable(runs, values, path), resourcesTable(sizes)].join('\n');
}

export function failureMessage() {
  return colors.red('Unable to perform the test');
}

function scoresTable(runs, values, path) {
  const valueWidth = Math.max(widest([`Test #${runs}`, 'Avg.']), 8) + PADDING;

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

    table.push([
      metric.title,
      ...times(runs, run => colorize(values[i][run], metric)),
      colorize(average(recorded), metric),
      legends[i],
    ]);
  });

  table.push([
    {
      colSpan: runs + 3, // every column
      content: terminalLink('Open in Browser', `file://${path}/index.html`),
    },
  ]);

  return table.toString();
}

function resourcesTable(sizes) {
  const table = new Table({
    head: ['Resources', ...resources.map(resource => resource.label)],
    colWidths: [rowLabelWidth + PADDING, ...resources.map(() => resourceWidth + PADDING)],
    style: { head: [] },
  });

  table.push(['Size, KB', ...resources.map((_, i) => cell(sizes?.[i]?.size))]);
  table.push(['Count', ...resources.map((_, i) => cell(sizes?.[i]?.count))]);

  return table.toString();
}

function colorize(value, metric) {
  if (!isPresent(value)) {
    return EMPTY;
  }

  const number = toNumber(value);

  if (within(number, metric.good)) {
    return colors.green(value);
  }

  return within(number, metric.ok) ? colors.yellow(value) : colors.red(value);
}

function within(number, [min, max]) {
  return number >= min && number <= max;
}

function average(values) {
  if (!values.length) {
    return undefined;
  }

  const sum = values.reduce((total, value) => total + toNumber(value), 0);

  return Math.round((sum / values.length) * 100) / 100;
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
