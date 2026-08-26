import cliSpinners from 'cli-spinners';
import logUpdate from 'log-update';
import stringWidth from 'string-width';

const { frames, interval } = cliSpinners.dots;

let timer;
let frame = 0;

// Results are never printed through the live region: log-update truncates to the terminal
// height. console.log is what prints the tables.
export function show(text = '') {
  clearInterval(timer);

  if (!process.stdout.isTTY) {
    return;
  }

  timer = setInterval(() => {
    frame = (frame + 1) % frames.length;
    logUpdate(crop(text ? `${text}\n${frames[frame]}` : frames[frame]));
  }, interval);
}

export function status(text) {
  process.stdout.isTTY ? logUpdate(text) : console.log(text);
}

export function commit() {
  logUpdate.done();
}

export function clear() {
  clearInterval(timer);
  logUpdate.clear();
}

// Crops to the tail that fits, leaving a row to spare. The cursor cannot climb above the
// top of the screen, so a block taller than the terminal can never be fully erased and
// every redraw stacks another copy underneath the leftovers.
function crop(text) {
  const rows = process.stdout.rows ?? 24;
  const columns = process.stdout.columns ?? 80;
  const lines = text.split('\n');
  const kept = [];
  let used = 0;

  for (let i = lines.length - 1; i >= 0; i--) {
    // log-update wraps a line wider than the terminal, costing several rows.
    used += Math.max(1, Math.ceil(stringWidth(lines[i]) / columns));

    if (used > rows - 1) {
      break;
    }

    kept.unshift(lines[i]);
  }

  return kept.join('\n');
}
