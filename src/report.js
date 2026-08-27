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

export function saveRun(folder, run, html) {
  fs.writeFileSync(path.join(folder, `${run}.html`), html);
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
