import ejs from 'ejs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const template = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'report.ejs');

export function createFolder(url, save) {
  const folder = path.resolve('reports', save ? name(url) : 'latest');

  fs.rmSync(folder, { recursive: true, force: true });
  fs.mkdirSync(folder, { recursive: true });

  return folder;
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
