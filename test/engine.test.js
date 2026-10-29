// Perft and SAN checks for web/js/chess.js. Run: node test/engine.test.js
const assert = require('assert');
const { Chess } = require('../web/js/chess.js');

function perft(c, depth) {
  if (depth === 0) return 1;
  let n = 0;
  for (const m of c.moves()) { c._make(m); n += perft(c, depth - 1); c.undo(); }
  return n;
}

const cases = [
  ['rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', [20, 400, 8902, 197281]],
  ['r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1', [48, 2039, 97862]],
  ['8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1', [14, 191, 2812, 43238]],
  ['r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1', [6, 264, 9467]],
  ['rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8', [44, 1486, 62379]],
];
for (const [fen, counts] of cases) {
  const c = new Chess(fen);
  counts.forEach((want, i) => assert.strictEqual(perft(c, i + 1), want, `${fen} depth ${i + 1}`));
  assert.strictEqual(c.fen(), fen);
}

const g = new Chess();
['e4', 'e5', 'Qh5', 'Nc6', 'Bc4', 'Nf6', 'Qxf7#'].forEach(s => assert(g.move(s), s));
assert(g.isCheckmate());
assert.strictEqual(g.history[g.history.length - 1].move.san, 'Qxf7#');

const d = new Chess('4k3/8/8/8/8/8/8/R3K2R w KQ - 0 1');
assert.strictEqual(d.move('O-O-O').san, 'O-O-O');
assert.strictEqual(d.castling, '');
const r = new Chess('k7/8/8/8/8/8/8/KR5R w - - 0 1');
assert.strictEqual(r.san(r.findSan('Rbe1')), 'Rbe1');
console.log('engine tests passed');
