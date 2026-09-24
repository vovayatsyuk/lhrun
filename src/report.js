import ejs from 'ejs';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const template = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'report.ejs');

const dataHome =
  process.env.XDG_DATA_HOME && path.isAbsolute(process.env.XDG_DATA_HOME)
    ? process.env.XDG_DATA_HOME
    : path.join(os.homedir(), '.local', 'share');

const root = path.join(dataHome, 'lhrun', 'reports');

export function createFolder(url, save) {
  const folder = path.join(root, save ? name(url) : 'latest');

  fs.rmSync(folder, { recursive: true, force: true });
  fs.mkdirSync(folder, { recursive: true });

  return folder;
}

export function clear() {
  fs.rmSync(root, { recursive: true, force: true });
}

// index.html sizes each iframe to its full report height, so all runs scroll together with the page.
// file:// frames are cross-origin to the parent, hence postMessage instead of reading the height directly.
const reportHeight = `<script>
  new ResizeObserver(() => {
    parent.postMessage({ lhrunHeight: document.body.scrollHeight }, '*');
  }).observe(document.body);
</script>`;

// Mirrors expanded audits and filter toggles to the other runs. States, not clicks, so frames can't drift
// out of phase. Elements are matched by the nearest stable id (audit/category ids; generated ones have digits)
// plus a tag+first-class path (later classes are state modifiers), since runs can have a different set of audits.
const syncState = `<script>
  {
    const kind = (el) => el.tagName + '.' + (el.classList[0] ?? '');
    const sameKind = (node, k) => [...node.children].filter((s) => kind(s) === k);
    const locate = (el) => {
      const steps = [];
      for (; el !== document.body && !(el.id && !/\\d/.test(el.id)); el = el.parentElement) {
        steps.unshift([kind(el), sameKind(el.parentElement, kind(el)).indexOf(el)]);
      }
      return { id: el.id, steps };
    };
    const find = ({ id, steps }) => {
      let el = id ? document.getElementById(id) : document.body;
      for (const [k, i] of steps) {
        el = el && sameKind(el, k)[i];
      }
      return el;
    };
    const send = (el, state) => {
      for (let i = 0; i < parent.length; i++) {
        if (parent[i] !== window) parent[i].postMessage({ lhrunSync: locate(el), state }, '*');
      }
    };
    document.addEventListener('toggle', (e) => e.target.tagName === 'DETAILS' && send(e.target, e.target.open), true);
    document.addEventListener('change', (e) => e.target.tagName === 'INPUT' && send(e.target, e.target.checked));
    addEventListener('message', (e) => {
      if (!e.data?.lhrunSync) return;
      const el = find(e.data.lhrunSync);
      if (el?.tagName === 'DETAILS') el.open = e.data.state;
      if (el?.tagName !== 'INPUT' || el.checked === e.data.state) return;
      el.checked = e.data.state;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    });
  }
</script>`;

export function saveRun(folder, run, html) {
  fs.writeFileSync(
    path.join(folder, `${run}.html`),
    html.replace('</body>', `${reportHeight}${syncState}</body>`)
  );
}

export function saveIndex(folder, runs) {
  fs.writeFileSync(
    path.join(folder, 'index.html'),
    ejs.render(fs.readFileSync(template, 'utf8'), { runs })
  );
}

function name(url) {
  return [
    new Date().toISOString().replace(/\..*/g, ''),
    url.replace(/(https?|[\W]+)/g, '-').replace(/(^-{1,}|-{1,}$)/g, ''),
  ].join('-');
}
