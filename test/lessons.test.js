// Replays every line of every lesson and checks that each SAN is legal and written exactly as the engine writes it.
const assert = require('assert');
const { Chess } = require('../web/js/chess.js');
const { LESSONS } = require('../web/js/lessons.js');
const TAGS = ['best', 'good', 'ok', 'dubious', 'bad'];
let positions = 0, errors = [];

function walk(lesson, node, c, path) {
  positions++;
  if (!node.opts.length && !node.say) errors.push(`${lesson.id}: empty end at ${path.join(' ')}`);
  const seen = new Set();
  for (const o of node.opts) {
    if (!TAGS.includes(o.tag)) errors.push(`${lesson.id}: bad tag ${o.tag}`);
    if (seen.has(o.san)) errors.push(`${lesson.id}: duplicate ${o.san} at ${path.join(' ')}`);
    seen.add(o.san);
    const m = c.findSan(o.san);
    if (!m) { errors.push(`${lesson.id}: illegal ${o.san} after ${path.join(' ') || '(start)'}`); continue; }
    const san = c.san(m);
    if (san !== o.san) errors.push(`${lesson.id}: ${o.san} should be written ${san} after ${path.join(' ')}`);
    c.move(o.san);
    if (!o.next) errors.push(`${lesson.id}: ${o.san} has no next position`);
    else {
      if (c.moves().length === 0 && o.next.opts.length) errors.push(`${lesson.id}: options after game end`);
      walk(lesson, o.next, c, path.concat(o.san));
    }
    c.undo();
  }
}

for (const l of LESSONS) {
  const c = new Chess();
  const start = l.start ? l.start.split(' ') : [];
  for (const s of start) assert(c.move(s), `${l.id}: bad start move ${s}`);
  assert(['w', 'b'].includes(l.side));
  walk(l, l.tree, c, start);
}
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
console.log(`lessons ok: ${LESSONS.length} lessons, ${positions} positions`);
