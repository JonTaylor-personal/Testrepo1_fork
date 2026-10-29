/* Minimal, dependency-free chess rules engine: legal moves, SAN, check/mate. */
(function (root) {
  'use strict';

  var FILES = 'abcdefgh';
  var START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  var KN = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
  var KG = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
  var BD = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
  var RD = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  var VALUE = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

  // Square 0 = a8, 7 = h8, 56 = a1, 63 = h1 (FEN order).
  function sqName(i) { return FILES[i & 7] + (8 - (i >> 3)); }
  function sqIndex(n) { return (8 - Number(n[1])) * 8 + FILES.indexOf(n[0]); }
  function colorOf(p) { return p ? (p === p.toUpperCase() ? 'w' : 'b') : null; }
  function typeOf(p) { return p ? p.toLowerCase() : null; }
  function other(c) { return c === 'w' ? 'b' : 'w'; }
  function onBoard(r, f) { return r >= 0 && r < 8 && f >= 0 && f < 8; }

  function Chess(fen) { this.load(fen || START); }

  Chess.prototype.load = function (fen) {
    var parts = fen.trim().split(/\s+/);
    this.board = new Array(64).fill(null);
    var i = 0;
    for (var k = 0; k < parts[0].length; k++) {
      var ch = parts[0][k];
      if (ch === '/') continue;
      if (/\d/.test(ch)) i += Number(ch); else this.board[i++] = ch;
    }
    this.turn = parts[1] || 'w';
    this.castling = parts[2] && parts[2] !== '-' ? parts[2] : '';
    this.ep = parts[3] && parts[3] !== '-' ? sqIndex(parts[3]) : -1;
    this.half = Number(parts[4]) || 0;
    this.full = Number(parts[5]) || 1;
    this.history = [];
  };

  Chess.prototype.fen = function () {
    var s = '';
    for (var r = 0; r < 8; r++) {
      var empty = 0;
      for (var f = 0; f < 8; f++) {
        var p = this.board[r * 8 + f];
        if (!p) { empty++; continue; }
        if (empty) { s += empty; empty = 0; }
        s += p;
      }
      if (empty) s += empty;
      if (r < 7) s += '/';
    }
    return [s, this.turn, this.castling || '-', this.ep >= 0 ? sqName(this.ep) : '-', this.half, this.full].join(' ');
  };

  Chess.prototype.clone = function () {
    var c = Object.create(Chess.prototype);
    c.board = this.board.slice();
    c.turn = this.turn; c.castling = this.castling; c.ep = this.ep;
    c.half = this.half; c.full = this.full; c.history = this.history.slice();
    return c;
  };

  Chess.prototype.get = function (sq) { return this.board[typeof sq === 'string' ? sqIndex(sq) : sq]; };

  // Squares holding pieces of colour `by` that attack `sq`.
  Chess.prototype.attackers = function (sq, by, firstOnly) {
    var b = this.board, out = [], r = sq >> 3, f = sq & 7, i, d, p, rr, ff;
    function add(s) { out.push(s); return firstOnly; }
    var pr = by === 'w' ? r + 1 : r - 1, pawn = by === 'w' ? 'P' : 'p';
    for (d = -1; d <= 1; d += 2) {
      if (onBoard(pr, f + d) && b[pr * 8 + f + d] === pawn && add(pr * 8 + f + d)) return out;
    }
    var knight = by === 'w' ? 'N' : 'n', king = by === 'w' ? 'K' : 'k';
    for (i = 0; i < 8; i++) {
      rr = r + KN[i][0]; ff = f + KN[i][1];
      if (onBoard(rr, ff) && b[rr * 8 + ff] === knight && add(rr * 8 + ff)) return out;
      rr = r + KG[i][0]; ff = f + KG[i][1];
      if (onBoard(rr, ff) && b[rr * 8 + ff] === king && add(rr * 8 + ff)) return out;
    }
    var dirs = [[BD, 'b'], [RD, 'r']];
    for (var t = 0; t < 2; t++) {
      for (i = 0; i < 4; i++) {
        rr = r; ff = f;
        for (;;) {
          rr += dirs[t][0][i][0]; ff += dirs[t][0][i][1];
          if (!onBoard(rr, ff)) break;
          p = b[rr * 8 + ff];
          if (!p) continue;
          if (colorOf(p) === by && (typeOf(p) === dirs[t][1] || typeOf(p) === 'q') && add(rr * 8 + ff)) return out;
          break;
        }
      }
    }
    return out;
  };

  Chess.prototype.isAttacked = function (sq, by) { return this.attackers(sq, by, true).length > 0; };

  Chess.prototype.kingSquare = function (color) {
    var k = color === 'w' ? 'K' : 'k';
    return this.board.indexOf(k);
  };

  Chess.prototype.inCheck = function (color) {
    color = color || this.turn;
    var k = this.kingSquare(color);
    return k >= 0 && this.isAttacked(k, other(color));
  };

  Chess.prototype._pseudo = function () {
    var b = this.board, us = this.turn, them = other(us), moves = [];
    function push(from, to, extra) {
      var m = { from: from, to: to, piece: b[from], captured: b[to] || null };
      if (extra) for (var k in extra) m[k] = extra[k];
      moves.push(m);
    }
    for (var sq = 0; sq < 64; sq++) {
      var p = b[sq];
      if (!p || colorOf(p) !== us) continue;
      var t = typeOf(p), r = sq >> 3, f = sq & 7, i, rr, ff, to;
      if (t === 'p') {
        var dir = us === 'w' ? -1 : 1, startRank = us === 'w' ? 6 : 1, lastRank = us === 'w' ? 0 : 7;
        var pawnPush = function (from, dest, extra) {
          if ((dest >> 3) === lastRank) {
            ['q', 'r', 'b', 'n'].forEach(function (pp) {
              var e = { promotion: pp };
              if (extra) for (var k in extra) e[k] = extra[k];
              push(from, dest, e);
            });
          } else push(from, dest, extra);
        };
        rr = r + dir;
        if (onBoard(rr, f) && !b[rr * 8 + f]) {
          pawnPush(sq, rr * 8 + f);
          if (r === startRank && !b[(rr + dir) * 8 + f]) push(sq, (rr + dir) * 8 + f, { double: true });
        }
        for (var d = -1; d <= 1; d += 2) {
          ff = f + d;
          if (!onBoard(rr, ff)) continue;
          to = rr * 8 + ff;
          if (b[to] && colorOf(b[to]) === them) pawnPush(sq, to);
          else if (to === this.ep) push(sq, to, { enPassant: true, captured: us === 'w' ? 'p' : 'P' });
        }
      } else if (t === 'n' || t === 'k') {
        var offs = t === 'n' ? KN : KG;
        for (i = 0; i < 8; i++) {
          rr = r + offs[i][0]; ff = f + offs[i][1];
          if (!onBoard(rr, ff)) continue;
          to = rr * 8 + ff;
          if (!b[to] || colorOf(b[to]) === them) push(sq, to);
        }
        if (t === 'k') this._castles(sq, push);
      } else {
        var ds = t === 'b' ? BD : t === 'r' ? RD : BD.concat(RD);
        for (i = 0; i < ds.length; i++) {
          rr = r; ff = f;
          for (;;) {
            rr += ds[i][0]; ff += ds[i][1];
            if (!onBoard(rr, ff)) break;
            to = rr * 8 + ff;
            if (!b[to]) { push(sq, to); continue; }
            if (colorOf(b[to]) === them) push(sq, to);
            break;
          }
        }
      }
    }
    return moves;
  };

  Chess.prototype._castles = function (sq, push) {
    var b = this.board, us = this.turn, them = other(us);
    var home = us === 'w' ? 60 : 4, rook = us === 'w' ? 'R' : 'r';
    if (sq !== home || this.isAttacked(home, them)) return;
    var ks = us === 'w' ? 'K' : 'k', qs = us === 'w' ? 'Q' : 'q';
    if (this.castling.indexOf(ks) >= 0 && b[home + 3] === rook && !b[home + 1] && !b[home + 2] &&
        !this.isAttacked(home + 1, them) && !this.isAttacked(home + 2, them)) {
      push(home, home + 2, { castle: 'k' });
    }
    if (this.castling.indexOf(qs) >= 0 && b[home - 4] === rook && !b[home - 1] && !b[home - 2] && !b[home - 3] &&
        !this.isAttacked(home - 1, them) && !this.isAttacked(home - 2, them)) {
      push(home, home - 2, { castle: 'q' });
    }
  };

  Chess.prototype.moves = function (opts) {
    var us = this.turn, legal = [], self = this;
    var from = opts && opts.square != null ? (typeof opts.square === 'string' ? sqIndex(opts.square) : opts.square) : -1;
    this._pseudo().forEach(function (m) {
      if (from >= 0 && m.from !== from) return;
      self._make(m);
      if (!self.inCheck(us)) legal.push(m);
      self.undo();
    });
    return legal;
  };

  Chess.prototype._make = function (m) {
    var b = this.board, us = this.turn;
    this.history.push({ move: m, castling: this.castling, ep: this.ep, half: this.half, full: this.full });
    b[m.to] = m.promotion ? (us === 'w' ? m.promotion.toUpperCase() : m.promotion) : b[m.from];
    b[m.from] = null;
    if (m.enPassant) b[m.to + (us === 'w' ? 8 : -8)] = null;
    if (m.castle) {
      var rf = m.castle === 'k' ? m.from + 3 : m.from - 4, rt = m.castle === 'k' ? m.from + 1 : m.from - 1;
      b[rt] = b[rf]; b[rf] = null;
    }
    var c = this.castling;
    if (typeOf(m.piece) === 'k') c = c.replace(us === 'w' ? /[KQ]/g : /[kq]/g, '');
    [[63, 'K'], [56, 'Q'], [7, 'k'], [0, 'q']].forEach(function (x) {
      if (m.from === x[0] || m.to === x[0]) c = c.replace(x[1], '');
    });
    this.castling = c;
    this.ep = m.double ? (m.from + m.to) / 2 : -1;
    this.half = typeOf(m.piece) === 'p' || m.captured ? 0 : this.half + 1;
    if (us === 'b') this.full++;
    this.turn = other(us);
  };

  Chess.prototype.undo = function () {
    var h = this.history.pop();
    if (!h) return null;
    var m = h.move, b = this.board, us = other(this.turn);
    b[m.from] = m.piece;
    b[m.to] = m.enPassant ? null : m.captured;
    if (m.enPassant) b[m.to + (us === 'w' ? 8 : -8)] = m.captured;
    if (m.castle) {
      var rf = m.castle === 'k' ? m.from + 3 : m.from - 4, rt = m.castle === 'k' ? m.from + 1 : m.from - 1;
      b[rf] = b[rt]; b[rt] = null;
    }
    this.castling = h.castling; this.ep = h.ep; this.half = h.half; this.full = h.full;
    this.turn = us;
    return m;
  };

  Chess.prototype.isCheckmate = function () { return this.inCheck() && this.moves().length === 0; };
  Chess.prototype.isStalemate = function () { return !this.inCheck() && this.moves().length === 0; };

  Chess.prototype.san = function (m) {
    var t = typeOf(m.piece), s;
    if (m.castle) s = m.castle === 'k' ? 'O-O' : 'O-O-O';
    else if (t === 'p') {
      s = (m.captured ? FILES[m.from & 7] + 'x' : '') + sqName(m.to);
      if (m.promotion) s += '=' + m.promotion.toUpperCase();
    } else {
      var rivals = this.moves().filter(function (o) {
        return o.to === m.to && o.from !== m.from && typeOf(o.piece) === t;
      });
      var dis = '';
      if (rivals.length) {
        var sameFile = rivals.some(function (o) { return (o.from & 7) === (m.from & 7); });
        var sameRank = rivals.some(function (o) { return (o.from >> 3) === (m.from >> 3); });
        if (!sameFile) dis = FILES[m.from & 7];
        else if (!sameRank) dis = String(8 - (m.from >> 3));
        else dis = sqName(m.from);
      }
      s = t.toUpperCase() + dis + (m.captured ? 'x' : '') + sqName(m.to);
    }
    this._make(m);
    if (this.inCheck()) s += this.moves().length ? '+' : '#';
    this.undo();
    return s;
  };

  function cleanSan(s) { return s.replace(/[+#!?]/g, '').replace(/0/g, 'O').replace(/=/g, ''); }

  Chess.prototype.findSan = function (san) {
    var want = cleanSan(san), self = this, found = null;
    this.moves().some(function (m) {
      if (cleanSan(self.san(m)) === want) { found = m; return true; }
      return false;
    });
    return found;
  };

  // Play a move given as SAN string or {from,to,promotion}. Returns the move (with .san) or null.
  Chess.prototype.move = function (mv) {
    var m = null;
    if (typeof mv === 'string') m = this.findSan(mv);
    else {
      var from = typeof mv.from === 'string' ? sqIndex(mv.from) : mv.from;
      var to = typeof mv.to === 'string' ? sqIndex(mv.to) : mv.to;
      var cands = this.moves({ square: from }).filter(function (x) { return x.to === to; });
      m = cands.filter(function (x) { return !x.promotion || x.promotion === (mv.promotion || 'q'); })[0] || null;
    }
    if (!m) return null;
    m.san = this.san(m);
    this._make(m);
    return m;
  };

  var api = { Chess: Chess, START: START, sqName: sqName, sqIndex: sqIndex, colorOf: colorOf, typeOf: typeOf, other: other, VALUE: VALUE };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ChessLib = api;
})(this);
