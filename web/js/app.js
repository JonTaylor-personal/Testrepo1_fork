/* Opening Coach UI: lesson list, interactive board, move discussion. */
(function () {
  'use strict';
  var Chess = ChessLib.Chess, sqName = ChessLib.sqName, colorOf = ChessLib.colorOf;
  var LESSONS = Lessons.LESSONS;
  var app = document.getElementById('app');

  var TAGS = {
    best: { label: 'Best', sym: '!' },
    good: { label: 'Good', sym: '' },
    ok: { label: 'Playable', sym: '' },
    dubious: { label: 'Dubious', sym: '?!' },
    bad: { label: 'Mistake', sym: '?' }
  };
  var ARROW = { best: '--best', good: '--good', ok: '--ok', dubious: '--dubious', bad: '--bad' };
  var SIDE = { w: 'White', b: 'Black' };

  var store = {
    get: function (k, d) { try { var v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } }
  };
  var progress = store.get('oc-progress', {});
  var prefs = store.get('oc-prefs', { arrows: true, mode: 'explore' });

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
  }
  function clean(san) { return san.replace(/[+#!?]/g, ''); }
  function startMoves(lesson) { return lesson.start ? lesson.start.split(' ') : []; }

  /* ---------------- progress ---------------- */
  function countPositions(node) {
    var n = 1;
    node.opts.forEach(function (o) { if (o.next) n += countPositions(o.next); });
    return n;
  }
  LESSONS.forEach(function (l) { l.total = countPositions(l.tree); });

  function visitedFor(id) { return progress[id] || (progress[id] = []); }
  function markVisited(lesson, key) {
    var v = visitedFor(lesson.id);
    if (v.indexOf(key) < 0) { v.push(key); store.set('oc-progress', progress); }
  }
  function percent(lesson) {
    return Math.min(100, Math.round(100 * (progress[lesson.id] || []).length / lesson.total));
  }
  // First line (list of SANs after the start moves) leading to a position not yet visited.
  function nextUnvisited(lesson) {
    var v = progress[lesson.id] || [];
    var found = null;
    (function dfs(node, path) {
      if (found) return;
      if (v.indexOf(path.join(' ')) < 0) { found = path; return; }
      node.opts.forEach(function (o) { if (o.next) dfs(o.next, path.concat(o.san)); });
    })(lesson.tree, []);
    return found;
  }

  /* ---------------- routing ---------------- */
  function route() {
    var m = location.hash.match(/^#\/l\/(\w+)/);
    var lesson = m && LESSONS.filter(function (l) { return l.id === m[1]; })[0];
    if (lesson) openLesson(lesson); else renderHome();
  }
  window.addEventListener('hashchange', route);

  /* ---------------- home ---------------- */
  function renderHome() {
    S = null;
    var groups = [];
    LESSONS.forEach(function (l) {
      var g = groups.filter(function (x) { return x.name === l.group; })[0];
      if (!g) groups.push(g = { name: l.group, items: [] });
      g.items.push(l);
    });
    var html = '<header class="topbar"><h1>Opening Coach</h1></header><main class="home">' +
      '<div class="hero"><h2>Learn the classic openings</h2><p>Play through famous openings move by move. At every position, see the candidate moves for both sides — and why each one is good or bad.</p></div>';
    groups.forEach(function (g) {
      html += '<div class="group-title">' + esc(g.name) + '</div>';
      g.items.forEach(function (l) {
        var icon = l.side === 'w' ? PIECES.N : PIECES.n;
        html += '<button class="card-lesson" data-id="' + l.id + '"><img alt="" src="' + icon + '"><div style="flex:1;min-width:0">' +
          '<div class="t">' + esc(l.title) + '</div><div class="b">' + esc(l.blurb) + '</div>' +
          '<div class="progress" aria-label="' + percent(l) + '% explored"><div style="width:' + percent(l) + '%"></div></div></div></button>';
      });
    });
    html += '<div class="how"><h3>How it works</h3><ul>' +
      '<li><b>Explore</b>: every candidate move is listed with its pros and cons. Tap one to play it, or move a piece on the board.</li>' +
      '<li><b>Practice</b>: the app plays your opponent. Find the right moves yourself and get instant feedback.</li>' +
      '<li>Try a move that isn\'t in the lesson and the coach judges it by opening principles.</li></ul>' +
      '<div class="legend">' + Object.keys(TAGS).map(function (t) { return tagHtml(t); }).join('') + '</div></div>' +
      '<p class="credit">Piece set "cburnett" by Colin M.L. Burnett, CC BY-SA 3.0.</p></main>';
    app.innerHTML = html;
    app.querySelectorAll('.card-lesson').forEach(function (b) {
      b.addEventListener('click', function () { cameFromHome = true; location.hash = '#/l/' + b.dataset.id; });
    });
  }

  function tagHtml(tag) {
    var t = TAGS[tag];
    return '<span class="tag ' + tag + '">' + t.label + (t.sym ? ' ' + t.sym : '') + '</span>';
  }

  /* ---------------- lesson state ---------------- */
  var S = null; // current lesson session
  var autoTimer = null;
  var cameFromHome = false;

  function openLesson(lesson) {
    clearTimeout(autoTimer);
    var game = new Chess();
    startMoves(lesson).forEach(function (s) { game.move(s); });
    S = {
      lesson: lesson, game: game, steps: [], node: lesson.tree, sel: -1, hint: -1,
      mode: prefs.mode, flipped: lesson.side === 'b', feedback: null, hold: false,
      showOpts: false, score: { right: 0, total: 0 }
    };
    markVisited(lesson, '');
    renderLessonShell();
    update();
    scheduleAuto();
  }

  function key() { return S.steps.map(function (s) { return s.san; }).join(' '); }
  function learnerTurn() { return S.game.turn === S.lesson.side; }
  function inPractice() { return S.mode === 'practice'; }

  function canMove() {
    if (S.hold || autoTimer) return false;
    if (!inPractice() || !S.node) return true;
    return learnerTurn();
  }

  function playMove(input, viaAuto) {
    var g = S.game, before = g.clone(), node = S.node;
    var mv = g.move(input);
    if (!mv) return false;
    var opt = node ? node.opts.filter(function (o) { return clean(o.san) === clean(mv.san); })[0] : null;
    var color = colorOf(mv.piece);
    var label = (color === 'w' ? before.full + '. ' : before.full + '... ') + mv.san;
    S.steps.push({ san: mv.san, prevNode: node, opt: opt || null, label: label, move: mv });
    S.sel = -1; S.hint = -1; S.showOpts = false;
    var learner = color === S.lesson.side;
    if (opt) {
      S.node = opt.next;
      markVisited(S.lesson, key());
      S.feedback = { kind: 'book', opt: opt, label: label, color: color, learner: learner };
      if (inPractice() && learner && !viaAuto) {
        S.score.total++;
        if (opt.tag === 'best' || opt.tag === 'good') S.score.right++;
        if (opt.tag === 'dubious' || opt.tag === 'bad') S.hold = true;
        var better = node.opts.filter(function (o) { return o.tag === 'best'; });
        if (opt.tag !== 'best' && opt.tag !== 'good' && better.length) S.feedback.better = better;
      }
    } else {
      S.node = null;
      S.feedback = {
        kind: 'coach', label: label, color: color, learner: learner,
        analysis: Coach.analyse(before, mv),
        book: node ? node.opts.filter(function (o) { return o.tag === 'best' || o.tag === 'good'; }) : null
      };
      if (inPractice() && learner && node && node.opts.length) { S.score.total++; S.hold = true; }
    }
    update();
    scheduleAuto();
    return true;
  }

  function scheduleAuto() {
    clearTimeout(autoTimer); autoTimer = null;
    if (!S || !inPractice() || S.hold || !S.node || !S.node.opts.length || learnerTurn()) return;
    autoTimer = setTimeout(function () {
      autoTimer = null;
      var weights = { best: 5, good: 3, ok: 2, dubious: 2, bad: 2 };
      var opts = S.node.opts, total = 0;
      opts.forEach(function (o) { total += weights[o.tag]; });
      var r = Math.random() * total, pick = opts[0];
      for (var i = 0; i < opts.length; i++) { r -= weights[opts[i].tag]; if (r < 0) { pick = opts[i]; break; } }
      playMove(pick.san, true);
    }, 700);
  }

  function popStep() {
    var step = S.steps.pop();
    if (!step) return;
    S.game.undo();
    S.node = step.prevNode;
  }

  // Take back one move; in practice, keep going back until it is the learner's turn.
  function undo(learnerOnly) {
    clearTimeout(autoTimer); autoTimer = null;
    if (!S.steps.length) return;
    popStep();
    if (!learnerOnly && inPractice() && S.node && !learnerTurn() && S.steps.length) popStep();
    S.hold = false; S.feedback = null; S.sel = -1; S.hint = -1; S.showOpts = false;
    update(); scheduleAuto();
  }

  function restart() { openLesson(S.lesson); }

  // Replays a line from the start in Explore mode.
  function goToLine(sans) {
    openLesson(S.lesson);
    clearTimeout(autoTimer); autoTimer = null;
    S.mode = 'explore';
    sans.forEach(function (s) { playMove(s, true); });
  }

  /* ---------------- rendering ---------------- */
  function renderLessonShell() {
    app.innerHTML =
      '<header class="topbar"><button class="icon-btn" id="home" aria-label="Back to lessons">&#8592;</button>' +
      '<h1>' + esc(S.lesson.title) + '</h1><span class="score" id="score"></span>' +
      '<div class="seg" role="tablist"><button data-mode="explore">Explore</button><button data-mode="practice">Practice</button></div></header>' +
      '<main class="lesson"><div class="moves" id="moves"></div>' +
      '<div class="board-wrap"><div class="board" id="board"></div></div>' +
      '<div class="panel" id="panel"></div></main>' +
      '<nav class="toolbar">' +
      '<button id="t-restart"><span>&#10227;</span>Restart</button>' +
      '<button id="t-undo"><span>&#9664;</span>Take back</button>' +
      '<button id="t-flip"><span>&#8645;</span>Flip</button>' +
      '<button id="t-arrows"><span>&#10138;</span>Arrows</button>' +
      '<button id="t-hint"><span>&#128161;</span>Hint</button></nav>';

    var board = document.getElementById('board');
    for (var i = 0; i < 64; i++) {
      var d = document.createElement('div');
      board.appendChild(d);
    }
    board.insertAdjacentHTML('beforeend', '<svg class="arrows" id="arrows" viewBox="0 0 8 8"></svg>');
    board.addEventListener('click', function (e) {
      var el = e.target.closest('.sq');
      if (el) onSquare(Number(el.dataset.sq));
    });

    document.getElementById('home').onclick = function () {
      if (cameFromHome) history.back(); else location.hash = '';
    };
    app.querySelectorAll('.seg button').forEach(function (b) {
      b.onclick = function () {
        if (S.mode === b.dataset.mode) return;
        prefs.mode = b.dataset.mode; store.set('oc-prefs', prefs);
        openLesson(S.lesson);
      };
    });
    document.getElementById('t-restart').onclick = restart;
    document.getElementById('t-undo').onclick = function () { undo(false); };
    document.getElementById('t-flip').onclick = function () { S.flipped = !S.flipped; update(); };
    document.getElementById('t-arrows').onclick = function () {
      prefs.arrows = !prefs.arrows; store.set('oc-prefs', prefs); update();
    };
    document.getElementById('t-hint').onclick = showHint;
  }

  function showHint() {
    if (!S.node || !S.node.opts.length) return;
    var best = S.node.opts.filter(function (o) { return o.tag === 'best'; })[0] || S.node.opts[0];
    var m = S.game.findSan(best.san);
    if (S.hint === m.from) S.showOpts = true;
    S.hint = m.from;
    update();
  }

  function displayIndex(sq) { return S.flipped ? 63 - sq : sq; }

  function renderBoard() {
    var g = S.game, board = document.getElementById('board'), cells = board.children;
    var last = S.steps.length ? S.steps[S.steps.length - 1].move : (g.history.length ? g.history[g.history.length - 1].move : null);
    var targets = S.sel >= 0 ? g.moves({ square: S.sel }).map(function (m) { return m.to; }) : [];
    var checkSq = g.inCheck() ? g.kingSquare(g.turn) : -1;
    for (var i = 0; i < 64; i++) {
      var sq = S.flipped ? 63 - i : i, r = sq >> 3, f = sq & 7;
      var cls = 'sq ' + ((r + f) % 2 ? 'd' : 'l');
      if (last && (sq === last.from || sq === last.to)) cls += ' last';
      if (sq === S.sel) cls += ' sel';
      if (sq === S.hint) cls += ' hint';
      if (sq === checkSq) cls += ' check';
      var p = g.board[sq], html = p ? '<img alt="' + p + '" src="' + PIECES[p] + '">' : '';
      if (targets.indexOf(sq) >= 0) html += p ? '<span class="ring"></span>' : '<span class="dot"></span>';
      if ((i & 7) === 0) html += '<span class="coord r">' + (8 - r) + '</span>';
      if (i >= 56) html += '<span class="coord f">' + 'abcdefgh'[f] + '</span>';
      var cell = cells[i];
      cell.className = cls; cell.dataset.sq = sq; cell.innerHTML = html;
    }
    renderArrows();
  }

  function renderArrows() {
    var svg = document.getElementById('arrows'), out = '';
    var show = prefs.arrows && S.node && S.node.opts.length && (!inPractice() || S.showOpts);
    if (show) {
      var cs = getComputedStyle(document.documentElement);
      S.node.opts.slice().reverse().forEach(function (o) {
        var m = S.game.findSan(o.san);
        if (!m) return;
        var a = displayIndex(m.from), b = displayIndex(m.to);
        var x1 = (a & 7) + 0.5, y1 = (a >> 3) + 0.5, x2 = (b & 7) + 0.5, y2 = (b >> 3) + 0.5;
        var dx = x2 - x1, dy = y2 - y1, len = Math.sqrt(dx * dx + dy * dy), ux = dx / len, uy = dy / len;
        var w = o.tag === 'best' ? 0.16 : 0.11, head = 0.36;
        var ex = x2 - ux * head, ey = y2 - uy * head;
        var col = cs.getPropertyValue(ARROW[o.tag]).trim();
        out += '<g opacity="0.8"><line x1="' + x1 + '" y1="' + y1 + '" x2="' + ex + '" y2="' + ey + '" stroke="' + col +
          '" stroke-width="' + w + '" stroke-linecap="round"/>' +
          '<polygon points="' + x2 + ',' + y2 + ' ' + (ex - uy * 0.22) + ',' + (ey + ux * 0.22) + ' ' + (ex + uy * 0.22) + ',' + (ey - ux * 0.22) +
          '" fill="' + col + '"/></g>';
      });
    }
    svg.innerHTML = out;
  }

  function renderMoves() {
    var el = document.getElementById('moves'), g = new Chess(), html = '';
    var all = startMoves(S.lesson).map(function (s) { return { san: s, pre: true }; })
      .concat(S.steps.map(function (s) { return { san: s.san, tag: s.opt ? s.opt.tag : null }; }));
    all.forEach(function (m, i) {
      if (g.turn === 'w') html += '<span class="n">' + g.full + '.</span>';
      else if (i === 0) html += '<span class="n">' + g.full + '...</span>';
      g.move(m.san);
      var sym = m.tag && TAGS[m.tag].sym ? TAGS[m.tag].sym : '';
      html += '<span class="m' + (m.pre ? ' pre' : '') + (i === all.length - 1 ? ' cur' : '') + '">' + esc(m.san + sym) + '</span>';
    });
    el.innerHTML = html || '<span class="empty">Starting position</span>';
    el.scrollLeft = el.scrollWidth;
  }

  function pcList(pros, cons) {
    if (!pros.length && !cons.length) return '';
    return '<ul class="pc">' +
      pros.map(function (p) { return '<li class="pro">' + esc(p) + '</li>'; }).join('') +
      cons.map(function (c) { return '<li class="con">' + esc(c) + '</li>'; }).join('') + '</ul>';
  }

  function feedbackHtml() {
    var f = S.feedback;
    if (!f) return '';
    var who = f.learner ? 'You played' : SIDE[f.color] + ' played';
    if (f.kind === 'book') {
      var o = f.opt;
      var cls = f.learner || !inPractice() ? 'fb-' + o.tag : 'fb-opp';
      var html = '<div class="card ' + cls + '"><h3>' + who + ' ' + esc(f.label) + ' ' + tagHtml(o.tag) + '</h3>' +
        (o.note ? '<p>' + esc(o.note) + '</p>' : '') + pcList(o.pros, o.cons);
      if (f.better) html += '<p><b>Better was:</b> ' + f.better.map(function (b) { return esc(b.san) + (b.note ? ' — ' + esc(b.note) : ''); }).join('; ') + '</p>';
      if (S.hold) {
        html += '<div class="btns"><button class="btn primary" data-act="retry">Take back &amp; try again</button>' +
          '<button class="btn" data-act="continue">See what happens</button></div>';
      }
      return html + '</div>';
    }
    var a = f.analysis;
    var h = '<div class="card fb-coach"><h3>' + who + ' ' + esc(f.label) + ' <span class="tag coach">Not in lesson</span></h3>' +
      '<p>The coach\'s view, based on opening principles:</p>' + pcList(a.pros, a.cons);
    if (f.book && f.book.length) {
      h += '<p><b>The lesson suggests:</b> ' + f.book.map(function (b) { return esc(b.san); }).join(', ') + '</p>';
    }
    h += '<div class="btns"><button class="btn primary" data-act="retry">Take back</button>' +
      (S.hold ? '<button class="btn" data-act="continue">Keep playing freely</button>' : '') + '</div>';
    return h + '</div>';
  }

  function optionHtml(o, i) {
    return '<button class="opt" data-opt="' + i + '"><div class="row"><span class="san">' + esc(o.san) + '</span>' + tagHtml(o.tag) + '</div>' +
      (o.note ? '<div class="note">' + esc(o.note) + '</div>' : '') + pcList(o.pros, o.cons) + '</button>';
  }

  function renderPanel() {
    var panel = document.getElementById('panel'), n = S.node, g = S.game, html = '';
    var side = S.lesson.side, turn = g.turn, mine = turn === side;

    if (!S.steps.length && S.lesson.intro) {
      html += '<div class="card"><h3>' + esc(S.lesson.title) + '</h3><p>' + esc(S.lesson.intro) + '</p>' +
        '<p class="to-move">You play ' + SIDE[side] + (inPractice() ? ' · the app plays ' + SIDE[ChessLib.other(side)] : '') + '</p></div>';
    }
    html += feedbackHtml();

    if (g.isCheckmate()) {
      html += '<div class="card"><h3>Checkmate!</h3><p>' + SIDE[ChessLib.other(turn)] + ' wins.</p>' + (n && n.say ? '<p>' + esc(n.say) + '</p>' : '') + endButtons() + '</div>';
    } else if (!n) {
      if (!S.hold) {
        html += '<div class="card"><h3>Free play</h3><p>You\'ve left the lesson\'s map. Move pieces for either side and the coach will comment on each move — or take back to return to the lesson.</p></div>';
      }
    } else if (!n.opts.length) {
      html += '<div class="card"><h3>End of this line</h3><p class="say">' + esc(n.say) + '</p>' + endButtons() + '</div>';
    } else if (!S.hold) {
      html += '<div class="card"><div class="to-move">' + SIDE[turn] + ' to move' + (mine ? ' · your move' : '') + '</div>' +
        (n.say ? '<p class="say">' + esc(n.say) + '</p>' : '') + '</div>';
      if (inPractice() && !S.showOpts) {
        html += mine
          ? '<p class="to-move" style="margin-top:12px">Make your move on the board. Stuck? Tap Hint.</p>'
          : '<p class="to-move" style="margin-top:12px">' + SIDE[turn] + ' is thinking…</p>';
      } else {
        html += '<div class="opts-h"><h4>' + SIDE[turn] + '\'s choices</h4></div>' + n.opts.map(optionHtml).join('');
      }
    }
    panel.innerHTML = html;
    panel.scrollTop = 0;

    panel.querySelectorAll('[data-opt]').forEach(function (b) {
      b.onclick = function () { if (!autoTimer) playMove(n.opts[Number(b.dataset.opt)].san); };
    });
    panel.querySelectorAll('[data-act]').forEach(function (b) {
      b.onclick = function () {
        var act = b.dataset.act;
        if (act === 'retry') undo(true);
        else if (act === 'continue') { S.hold = false; update(); scheduleAuto(); }
        else if (act === 'restart') restart();
        else if (act === 'next') { var line = nextUnvisited(S.lesson); if (line) goToLine(line); }
        else if (act === 'back') undo(false);
        else if (act === 'home') location.hash = '';
      };
    });
  }

  function endButtons() {
    var next = nextUnvisited(S.lesson);
    var pct = percent(S.lesson);
    var html = '<p class="to-move">' + pct + '% of this lesson explored</p><div class="btns">';
    if (next) html += '<button class="btn primary" data-act="next">Next unexplored line</button>';
    html += '<button class="btn" data-act="back">Step back</button><button class="btn" data-act="restart">Restart</button>';
    if (!next) html += '<button class="btn primary" data-act="home">All lessons</button>';
    return html + '</div>';
  }

  function update() {
    if (!S) return;
    renderBoard(); renderMoves(); renderPanel();
    app.querySelectorAll('.seg button').forEach(function (b) { b.classList.toggle('on', b.dataset.mode === S.mode); });
    document.getElementById('t-arrows').classList.toggle('on', prefs.arrows);
    document.getElementById('t-hint').disabled = !(S.node && S.node.opts.length) || (inPractice() && !learnerTurn());
    document.getElementById('t-undo').disabled = !S.steps.length;
    document.getElementById('score').textContent = inPractice() && S.score.total ? '✓ ' + S.score.right + '/' + S.score.total : '';
  }

  function onSquare(sq) {
    if (!S || !canMove() || S.game.moves().length === 0) return;
    var g = S.game, p = g.board[sq];
    if (S.sel >= 0) {
      var cands = g.moves({ square: S.sel }).filter(function (m) { return m.to === sq; });
      if (cands.length) {
        var pick = cands[0];
        if (cands.length > 1) { // promotion: prefer a book move, else a queen
          var book = S.node ? S.node.opts.map(function (o) { return clean(o.san); }) : [];
          pick = cands.filter(function (m) { return book.indexOf(clean(g.san(m))) >= 0; })[0] ||
            cands.filter(function (m) { return m.promotion === 'q'; })[0];
        }
        playMove({ from: pick.from, to: pick.to, promotion: pick.promotion });
        return;
      }
    }
    S.sel = p && colorOf(p) === g.turn && sq !== S.sel ? sq : -1;
    renderBoard();
  }

  /* ---------------- boot ---------------- */
  if ('serviceWorker' in navigator && location.protocol === 'https:' && !/OpeningCoachApp/.test(navigator.userAgent)) {
    navigator.serviceWorker.register('sw.js').catch(function () { /* offline cache is optional */ });
  }
  route();
})();
