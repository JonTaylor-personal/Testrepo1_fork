/* Principle-based commentary for any move, used when a move leaves the lesson's book. */
(function (root) {
  'use strict';
  var lib = typeof module !== 'undefined' && module.exports ? require('./chess.js') : root.ChessLib;
  var sqName = lib.sqName, typeOf = lib.typeOf, colorOf = lib.colorOf, other = lib.other, VALUE = lib.VALUE;
  var NAMES = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };

  // Pieces of `color` that the opponent could win: undefended, or attacked by something cheaper.
  function loosePieces(c, color) {
    var out = [];
    for (var sq = 0; sq < 64; sq++) {
      var p = c.board[sq];
      if (!p || colorOf(p) !== color || typeOf(p) === 'k') continue;
      var att = c.attackers(sq, other(color));
      if (!att.length) continue;
      var cheapest = Math.min.apply(null, att.map(function (s) { return VALUE[typeOf(c.board[s])] || 0; }));
      var defended = c.attackers(sq, color).length > 0;
      if (!defended || cheapest < VALUE[typeOf(p)]) out.push(sq);
    }
    return out;
  }

  function analyse(before, m) {
    var pros = [], cons = [], us = before.turn, them = other(us);
    var t = typeOf(m.piece), file = m.from & 7, moveNo = before.full, name = NAMES[t];
    var homeRank = us === 'w' ? 7 : 0;

    var c = before.clone();
    var free = loosePieces(c, them);
    var looseBefore = loosePieces(c, us);
    c._make(m);

    if (c.isCheckmate()) return { pros: ['Checkmate — game over!'], cons: [] };
    if (c.isStalemate()) return { pros: [], cons: ['Stalemate: the game is a draw.'] };

    if (m.castle) pros.push('Castling tucks the king away and connects the rooks.');
    else if (t === 'k' && moveNo <= 20) cons.push('Moving the king gives up the right to castle and leaves it in the centre.');

    if ((t === 'n' || t === 'b') && (m.from >> 3) === homeRank) pros.push('Develops a ' + name + ' toward the action.');
    if (t === 'n' && ((m.to & 7) === 0 || (m.to & 7) === 7)) cons.push('"A knight on the rim is dim": on the edge it controls fewer squares.');

    if (t === 'p' && !m.captured && moveNo <= 8) {
      if (file === 3 || file === 4) pros.push('Claims the centre and opens lines for the bishop and queen.');
      else if (file === 2) pros.push('Fights for the central d-square from the side.');
      else if (file === 5) cons.push('Moving the f-pawn early weakens the diagonal toward your king.');
      else cons.push('An edge pawn move does little for the centre or development.');
    }
    if (t === 'q' && moveNo <= 6 && !m.captured) cons.push('Bringing the queen out early lets the opponent develop while chasing it.');

    var movedBefore = before.history.some(function (h) { return h.move.to === m.from && colorOf(h.move.piece) === us; });
    if (movedBefore && t !== 'p' && t !== 'k' && moveNo <= 10 && !m.captured && !c.inCheck()) {
      cons.push('Moves the same piece twice in the opening, while other pieces wait at home.');
    }

    if (m.captured) {
      var gain = VALUE[typeOf(m.captured)], risk = VALUE[t];
      var recapture = c.attackers(m.to, them).length > 0;
      if (!recapture) pros.push('Wins a ' + NAMES[typeOf(m.captured)] + ' for free.');
      else if (gain > risk) pros.push('Wins material: the ' + NAMES[typeOf(m.captured)] + ' is worth more than your ' + name + '.');
      else if (gain === risk) pros.push('Captures a ' + NAMES[typeOf(m.captured)] + ' — an even trade if recaptured.');
      else cons.push('Your ' + name + ' can be recaptured: you give more than you get.');
    }
    if (c.inCheck()) pros.push('Gives check.');

    var looseAfter = loosePieces(c, us).filter(function (sq) { return looseBefore.indexOf(sq) < 0 || sq === m.to; });
    looseAfter.forEach(function (sq) {
      cons.push('Your ' + NAMES[typeOf(c.board[sq])] + ' on ' + sqName(sq) + ' can be captured.');
    });

    var missed = free.filter(function (sq) { return sq !== m.to; });
    if (missed.length && !m.captured) {
      cons.push('You could have captured the ' + NAMES[typeOf(before.board[missed[0]])] + ' on ' + sqName(missed[0]) + '.');
    }

    var mates = c.moves().filter(function (o) { c._make(o); var mate = c.isCheckmate(); c.undo(); return mate; });
    if (mates.length) cons.unshift('Danger! This allows checkmate in one: ' + c.san(mates[0]) + '.');

    if (!pros.length && !cons.length) pros.push('A reasonable move — keep developing and castle soon.');
    return { pros: pros, cons: cons };
  }

  var api = { analyse: analyse };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Coach = api;
})(this);
