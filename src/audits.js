// Add a metric by adding a row. `read` is called inside a try — a throw, undefined or NaN
// marks the run as failed and retries it, so no defensive checks are needed here.
// `good` / `ok` / `poor` are inclusive ranges: they colour the value and print as the legend.
export const metrics = [
  {
    title: 'Performance',
    read: lhr => Math.round(lhr.categories.performance.score * 100),
    good: [90, 100],
    ok: [50, 89],
    poor: [0, 49],
  },
  {
    title: 'DOM Size',
    read: lhr =>
      lhr.audits['dom-size-insight'].details.items.find(i => i.statistic === 'Total elements').value
        .value,
    good: [0, 800],
    ok: [801, 1400],
    poor: [1401, 9999],
  },
  {
    title: 'First Contentful Paint',
    read: lhr => lhr.audits['first-contentful-paint'].displayValue,
    good: [0, 1.8],
    ok: [1.8, 3],
    poor: [3, 99],
  },
  {
    title: 'Largest Contentful Paint',
    read: lhr => lhr.audits['largest-contentful-paint'].displayValue,
    good: [0, 2.5],
    ok: [2.5, 4],
    poor: [4, 99],
  },
  {
    title: 'Total Blocking Time',
    read: lhr => lhr.audits['total-blocking-time'].displayValue,
    good: [0, 200],
    ok: [200, 600],
    poor: [600, 999],
  },
  {
    title: 'Cumulative Layout Shift',
    read: lhr => lhr.audits['cumulative-layout-shift'].displayValue,
    good: [0, 0.1],
    ok: [0.1, 0.25],
    poor: [0.25, 99],
  },
  {
    title: 'Time to Interactive',
    read: lhr => lhr.audits['interactive'].displayValue,
    good: [0, 3.8],
    ok: [3.9, 7.3],
    poor: [7.3, 99],
  },
  {
    title: 'Speed Index',
    read: lhr => lhr.audits['speed-index'].displayValue,
    good: [0, 3.4],
    ok: [3.4, 5.8],
    poor: [5.8, 99],
  },
  {
    title: 'Mainthread Work',
    read: lhr => lhr.audits['mainthread-work-breakdown'].displayValue,
    good: [0, 3.4],
    ok: [3.4, 5.8],
    poor: [5.8, 99],
  },
  {
    title: 'Server Response Time',
    read: lhr => lhr.audits['server-response-time'].displayValue.replace('Root document took ', ''),
    good: [0, 100],
    ok: [100, 250],
    poor: [250, 999],
  },
  {
    title: 'TTFB',
    read: lhr => lhr.audits['network-server-latency'].displayValue,
    good: [0, 800],
    ok: [801, 1800],
    poor: [1801, 9999],
  },
];

// Resource columns, in display order. A column sums the types it lists. Lighthouse sorts
// its own rows by size, so this fixed order is what stops them reordering between runs.
export const resources = [
  { label: 'All', types: ['total'] },
  { label: 'Doc', types: ['document'] },
  { label: 'JS', types: ['script'] },
  { label: 'CSS', types: ['stylesheet'] },
  { label: 'Img', types: ['image'] },
  { label: 'Font', types: ['font'] },
  { label: 'Other', types: ['other', 'media'] },
];

export const chromeFlags = ['--headless', '--ignore-certificate-errors'];

export const lighthouseOptions = {
  logLevel: 'error',
  output: 'html',
  throttlingMethod: 'simulate',
  onlyCategories: ['performance'],
  throttling: {
    requestLatencyMs: 150,
    downloadThroughputKbps: 1000,
    uploadThroughputKbps: 750,
  },
};

export function toNumber(value) {
  return parseFloat(String(value).replace(/,/g, ''));
}
