/**
 * ============================================================================
 *  app.js — UI logic for "PulseHeap"
 * ============================================================================
 *  Everything DOM-related lives here. The data structure itself is in
 *  heap.js (MinHeap) so the two concerns stay separate:
 *
 *      heap.js  → how the priority queue works  (pure data)
 *      app.js   → how the page reacts           (forms, panels, animation)
 *
 *  How the animation works
 *  -----------------------
 *  heap.insert() / heap.extractMin() mutate the heap immediately and return
 *  a LIST OF STEPS (compare / swap / insert / remove-root). The UI keeps a
 *  snapshot of the array from BEFORE the operation, replays those steps on
 *  that snapshot one at a time, and redraws the tree after every step — so
 *  the student can watch each swap happen. At the end the real heap array
 *  is used as the final state.
 * ============================================================================
 */
(function () {
  'use strict';

  /* ======================================================================
     1. Constants and demo data
     ====================================================================== */

  var TRIAGE = {
    1: 'Critical',
    2: 'Emergent',
    3: 'Urgent',
    4: 'Less urgent',
    5: 'Non-urgent',
  };

  /** 10 sample patients for the "Load demo patients" button.
   *  They are listed in ARRIVAL order, which deliberately differs from
   *  priority order (a level-5 sprain arrives before a level-1 chest pain)
   *  so the FIFO comparison shows something interesting. Their arrival
   *  times are staggered, and three patients share level 2 to demonstrate
   *  the arrival-order tie-break. */
  var DEMO_PATIENTS = [
    { name: 'Noah Williams', age: 19, condition: 'Sprained ankle',       level: 5 },
    { name: 'Tom Baker',     age: 8,  condition: 'High fever',           level: 3 },
    { name: 'Maria Lopez',   age: 67, condition: 'Chest pain',           level: 1 },
    { name: 'Grace Kim',     age: 26, condition: 'Migraine',             level: 4 },
    { name: 'Priya Sharma',  age: 71, condition: 'Dizziness',            level: 2 },
    { name: 'Carlos Mendes', age: 29, condition: 'Deep laceration',      level: 4 },
    { name: 'Fatima Ali',    age: 60, condition: 'Abdominal pain',       level: 2 },
    { name: 'Lena Vogel',    age: 54, condition: 'Fracture',             level: 3 },
    { name: 'John Carter',   age: 45, condition: 'Severe bleeding',      level: 1 },
    { name: 'Aisha Khan',    age: 32, condition: 'Difficulty breathing', level: 2 },
  ];

  /** Base delay (ms) per step type, divided by the speed slider value. */
  var WAIT = { compare: 340, swap: 560, insert: 500, remove: 560 };

  /* ======================================================================
     2. Application state
     ====================================================================== */

  var heap = new MinHeap();       // the real priority queue (heap.js)
  var treated = [];               // history log: { patient, waitedMs, at }
  var idCounter = 0;              // gives every patient a unique ID (P1, P2…)
  var displayState = [];          // array currently drawn in the three panels
  var speed = 1;                  // animation speed multiplier (slider)
  var stepMode = false;           // pause after every step?
  var fifoMode = false;           // show FIFO column next to priority order?
  var arrivingId = null;          // patient whose card should rise from the bottom
  var lastWaitingKey = '';        // signature of the last waiting order drawn

  // Respect the OS "reduce motion" setting: no travel, very short pauses.
  var reduceMotion =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /** The operation that is currently being animated (if any). */
  var op = {
    busy: false,
    steps: [],
    cursor: 0,
    state: [],      // replayed copy of the array (starts as pre-operation)
    timer: null,
    onDone: null,
  };

  /* ======================================================================
     3. Small helpers
     ====================================================================== */

  var $ = function (sel) { return document.querySelector(sel); };

  /** Escape user input before putting it into innerHTML (name, condition…). */
  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /** Shorten a string for tree labels / array chips. */
  function truncate(str, max) {
    str = String(str);
    return str.length > max ? str.slice(0, max - 1) + '…' : str;
  }

  function pad2(n) { return n < 10 ? '0' + n : String(n); }

  /** "14:03:11" — used for arrivalTime / treated-at labels. */
  function formatClock(ts) {
    var d = new Date(ts);
    return pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ':' + pad2(d.getSeconds());
  }

  /** Human-friendly waiting time: 45s → 12m 5s → 2h 14m. */
  function formatWaiting(ms) {
    var total = Math.max(0, Math.round(ms / 1000));
    if (total < 60) return total + 's';
    var m = Math.floor(total / 60);
    if (m < 60) return m + 'm ' + (total % 60) + 's';
    return Math.floor(m / 60) + 'h ' + (m % 60) + 'm';
  }

  /** Build a patient object (the fields required by the project spec). */
  function makePatient(fields, arrivalTs) {
    return {
      id: 'P' + (++idCounter),
      name: fields.name,
      age: fields.age,
      condition: fields.condition,
      level: fields.level,
      arrivalTime: formatClock(arrivalTs),
      arrivalTs: arrivalTs,
      // seq is stamped by heap.insert() — it is the arrival-order tie-break
    };
  }

  /** Wait time scaled by the speed slider (never below 60ms). */
  function scaledWait(kind) {
    if (reduceMotion) return 120;
    return Math.max(60, Math.round((WAIT[kind] || 400) / speed));
  }

  /** Tree travel duration scaled by the speed slider. */
  function scaledMove(kind) {
    if (reduceMotion) return 0;
    return Math.max(80, Math.round((WAIT[kind] || 400) * 0.85 / speed));
  }

  /* ======================================================================
     4. Status + step text lines
     ====================================================================== */

  var statusEl, stepEl;

  function setStatus(msg, isError) {
    statusEl.textContent = msg;
    statusEl.classList.toggle('is-error', !!isError);
  }

  /** The text line that describes the current swap/comparison. */
  function setStepText(msg) {
    var text = msg;
    if (stepMode && op.busy && op.cursor > 0) {
      text += '  ·  step ' + op.cursor + '/' + op.steps.length;
    }
    stepEl.textContent = text;
    stepEl.classList.add('is-active');
  }

  function clearStepText() {
    stepEl.textContent =
      'Step descriptions appear here while a patient is registered or treated.';
    stepEl.classList.remove('is-active');
  }

  /* ======================================================================
     5. Panel rendering (waiting list, treated history, counts)
     ====================================================================== */

  /** One waiting-list card (priority order, with rank). */
  function patientCard(p, rank) {
    var waited = formatWaiting(Date.now() - p.arrivalTs);
    return (
      '<article class="card lv' + p.level + '" data-pid="' + escapeHtml(p.id) + '">' +
        '<span class="level-chip" aria-label="Triage level ' + p.level +
          ': ' + TRIAGE[p.level] + '">' + p.level + '</span>' +
        '<div class="patient-body">' +
          '<div class="patient-top">' +
            '<h4>' + escapeHtml(p.name) +
              '<span class="pid">' + escapeHtml(p.id) + '</span></h4>' +
            '<span class="level-tag">' + TRIAGE[p.level] + '</span>' +
          '</div>' +
          '<p class="patient-meta">' + p.age + ' yrs · ' +
            escapeHtml(p.condition) + '</p>' +
          '<p class="patient-meta">Arrived ' + p.arrivalTime +
            ' · priority #' + rank +
            ' · waiting <span class="wait" data-ts="' + p.arrivalTs + '">' +
            waited + '</span></p>' +
        '</div>' +
      '</article>'
    );
  }

  /** One compact row — used by the FIFO comparison and the history log. */
  function patientRow(p, meta) {
    return (
      '<li class="row lv' + p.level + '">' +
        '<span class="level-chip small">' + p.level + '</span>' +
        '<span class="row-name">' + escapeHtml(p.name) + '</span>' +
        '<span class="row-meta">' + meta + '</span>' +
      '</li>'
    );
  }

  function emptyState(title, hint) {
    return (
      '<div class="empty">' +
        '<p class="empty-title">' + title + '</p>' +
        '<p class="empty-hint">' + hint + '</p>' +
      '</div>'
    );
  }

  /** A short signature of the waiting order, e.g. "prio|P3,P1,P2". */
  function waitingKey(list) {
    return (fifoMode ? 'fifo|' : 'prio|') +
      list.map(function (p) { return p.id; }).join(',');
  }

  /**
   * Render the waiting list — priority order, optionally next to FIFO.
   *
   * The list is ALWAYS sorted by priority, so its order does not change while
   * a patient bubbles up inside the heap array. Two touches make the movement
   * visible anyway:
   *   · existing cards glide to their new slot (the FLIP technique)
   *   · a newly registered card rises from the bottom of the list to its rank
   * When the order did not change (most compare/swap steps) we skip the whole
   * re-render, so a running animation is never restarted halfway.
   */
  function renderWaiting() {
    var list = sortPatients(displayState);   // highest priority first
    $('#waitCount').textContent = String(list.length);

    var key = waitingKey(list);
    if (key === lastWaitingKey) return;      // same patients, same order
    lastWaitingKey = key;

    var box = $('#waitList');

    if (list.length === 0) {
      box.innerHTML = emptyState(
        'No patients waiting',
        'Register a patient or load the demo to fill the list.'
      );
      arrivingId = null;
      return;
    }

    if (fifoMode) {
      // Same patients, two orders side by side: heap priority vs arrival.
      var fifo = displayState
        .slice()
        .sort(function (a, b) { return a.seq - b.seq; });

      var priorityRows = list
        .map(function (p, i) { return patientRow(p, '#' + (i + 1)); })
        .join('');
      var fifoRows = fifo
        .map(function (p) { return patientRow(p, p.arrivalTime); })
        .join('');

      box.innerHTML =
        '<div class="compare">' +
          '<div class="compare-col">' +
            '<h4>Priority order <span>(min-heap)</span></h4>' +
            '<ol class="rows">' + priorityRows + '</ol>' +
          '</div>' +
          '<div class="compare-col">' +
            '<h4>FIFO order <span>(arrival)</span></h4>' +
            '<ol class="rows">' + fifoRows + '</ol>' +
          '</div>' +
        '</div>';
      arrivingId = null;
      return;
    }

    // Remember where every card was BEFORE the rebuild (FLIP: First–Last–Invert–Play).
    var before = new Map();
    if (!reduceMotion) {
      var oldCards = box.querySelectorAll('.card[data-pid]');
      for (var o = 0; o < oldCards.length; o++) {
        before.set(
          oldCards[o].getAttribute('data-pid'),
          oldCards[o].getBoundingClientRect().top
        );
      }
    }

    box.innerHTML = list
      .map(function (p, i) { return patientCard(p, i + 1); })
      .join('');

    if (reduceMotion) { arrivingId = null; return; }

    // 1. Cards whose rank changed glide from their old position to the new one.
    var cards = box.querySelectorAll('.card[data-pid]');
    for (var c = 0; c < cards.length; c++) {
      var card = cards[c];
      var oldTop = before.get(card.getAttribute('data-pid'));
      if (oldTop === undefined) continue;     // brand-new card: handled below
      var delta = oldTop - card.getBoundingClientRect().top;
      if (Math.abs(delta) < 0.5) continue;
      card.style.transition = 'none';
      card.style.transform = 'translateY(' + delta + 'px)';
      glideCard(card);
    }

    // 2. The patient who was just registered rises from the bottom to its rank.
    if (arrivingId) {
      var newCard = box.querySelector('.card[data-pid="' + arrivingId + '"]');
      if (newCard) {
        var listRect = box.getBoundingClientRect();
        var cardRect = newCard.getBoundingClientRect();
        var travel = Math.max(48, Math.min(300, listRect.bottom - cardRect.bottom - 4));
        newCard.style.setProperty('--travel', travel + 'px');
        newCard.classList.add('card--arriving');
      }
      arrivingId = null;
    }
  }

  /** Next frame, release the offset so the card transitions back to Y = 0. */
  function glideCard(el) {
    requestAnimationFrame(function () {
      el.style.transition = 'transform 0.42s cubic-bezier(0.2, 0.8, 0.2, 1)';
      el.style.transform = '';
    });
  }

  /** Render the "Treated" history log with each patient's waiting time. */
  function renderTreated() {
    $('#treatedCount').textContent = String(treated.length);

    if (treated.length === 0) {
      $('#treatedList').innerHTML =
        '<li class="empty">' +
          '<p class="empty-title">No patients treated yet</p>' +
          '<p class="empty-hint">“Treat next” moves the most urgent patient ' +
          'here with their waiting time.</p>' +
        '</li>';
      return;
    }

    $('#treatedList').innerHTML = treated
      .slice()
      .reverse()   // newest first
      .map(function (entry) {
        var meta =
          'waited ' + formatWaiting(entry.waitedMs) + ' · ' + entry.at;
        return patientRow(entry.patient, meta);
      })
      .join('');
  }

  /** Re-render every panel from the current displayState. */
  function renderAll() {
    renderWaiting();
    renderTreated();
    renderTree(displayState, 0);
    renderArray(displayState);
    $('#heapSize').textContent =
      displayState.length + (displayState.length === 1 ? ' node' : ' nodes');
    $('#heapEmpty').hidden = displayState.length > 0;
  }

  /* ======================================================================
     6. Array form of the heap (chips under the tree)
     ====================================================================== */

  /** Draw the heap as [index: level name] chips, highlighting active nodes. */
  function renderArray(arr) {
    var box = $('#heapArray');

    if (arr.length === 0) {
      box.innerHTML = '<li class="array-empty">Array view is empty — no nodes in the heap.</li>';
      return;
    }

    box.innerHTML = arr
      .map(function (p, i) {
        var active = highlightIds.has(p.id) ? ' is-active' : '';
        return (
          '<li class="chip lv' + p.level + active + '" data-idx="' + i +
            '" title="index ' + i + ' — ' + escapeHtml(p.name) +
            ' (level ' + p.level + ')">' +
            '<span class="chip-idx">' + i + '</span>' +
            '<span class="chip-val">' + p.level + '</span>' +
            '<span class="chip-name">' + escapeHtml(truncate(p.name, 9)) + '</span>' +
          '</li>'
        );
      })
      .join('');
  }

  /* ======================================================================
     7. Heap tree view (SVG)
     ------------------------------------------------------------------------
     The tree is laid out from the flat array using the standard formulas:
        depth(i)    = floor(log2(i + 1))
        parent(i)   = floor((i - 1) / 2)
     Nodes are <g> elements kept in a Map keyed by patient id, so a node
     glides to its new position (JS animation) instead of being recreated.
     Edges are redrawn from the SAME animated positions every frame, so the
     lines always stay attached to the circles.
     ====================================================================== */

  var SVG_NS = 'http://www.w3.org/2000/svg';
  var TREE_W = 720;       // viewBox width (scales to the panel width)
  var PAD_X = 46;         // side padding inside the viewBox
  var TOP_Y = 46;         // y of the root row
  var NODE_R_MAX = 20;    // biggest circle radius

  var tree = {
    svg: null, edgeLayer: null, nodeLayer: null,
    nodes: new Map(),   // patient id -> <g>
    edges: [],          // [{ line, parentId, childId }]
    pos: new Map(),     // patient id -> { x, y } last drawn position
    raf: null,          // id of the running animation frame
    highlight: new Set(),
    newIds: new Set(),  // ids that should fade in on their first drawing
    rootTag: null,      // the small "NEXT" label above the root
    rootId: null,       // patient id currently at index 0
    r: NODE_R_MAX,      // current node radius (also used to trim the edges)
  };
  var highlightIds = tree.highlight;  // shorthand used by renderArray()

  /**
   * Position every patient of `arr` on the canvas.
   * Time complexity: O(n).
   */
  function computeLayout(arr) {
    var n = arr.length;
    var positions = new Map();
    if (n === 0) return { w: TREE_W, h: 240, r: NODE_R_MAX, positions: positions };

    var maxDepth = Math.floor(Math.log2(n));         // deepest level
    var maxSlots = Math.pow(2, maxDepth);            // nodes that row could hold
    var slot = (TREE_W - PAD_X * 2) / maxSlots;      // px available per node
    // Shrink the circles as the tree gets wide so nodes never overlap.
    var r = Math.max(9, Math.min(NODE_R_MAX, Math.floor(slot / 2) - 5));
    var rowH = maxDepth === 0 ? 0 : Math.min(86, (330 - TOP_Y) / maxDepth);

    for (var i = 0; i < n; i++) {
      var depth = Math.floor(Math.log2(i + 1));
      var first = Math.pow(2, depth) - 1;            // index of the leftmost node
      var k = i - first;                             // position within the row
      var count = Math.pow(2, depth);
      var x = PAD_X + ((k + 0.5) / count) * (TREE_W - PAD_X * 2);
      var y = TOP_Y + depth * rowH;
      positions.set(arr[i].id, { x: x, y: y, index: i });
    }

    var h = TOP_Y + maxDepth * rowH + r + 36;        // extra room for name labels
    return { w: TREE_W, h: h, r: r, positions: positions };
  }

  /** Create one tree node: ring + coloured circle + level number + name. */
  function createNodeGroup(p, r) {
    var g = document.createElementNS(SVG_NS, 'g');
    g.setAttribute('class', 'node lv' + p.level);

    var ring = document.createElementNS(SVG_NS, 'circle');
    ring.setAttribute('class', 'ring');
    ring.setAttribute('r', String(r + 6));

    var dot = document.createElementNS(SVG_NS, 'circle');
    dot.setAttribute('class', 'dot');
    dot.setAttribute('r', String(r));

    var lvl = document.createElementNS(SVG_NS, 'text');
    lvl.setAttribute('class', 'lvl');
    lvl.setAttribute('y', '0');
    lvl.textContent = String(p.level);

    var name = document.createElementNS(SVG_NS, 'text');
    name.setAttribute('class', 'name');
    name.setAttribute('y', String(r + 15));
    name.textContent = truncate(p.name, 11);

    g.appendChild(ring);
    g.appendChild(dot);
    g.appendChild(lvl);
    g.appendChild(name);
    return g;
  }

  /** Move every node to its target position (instantly or animated). */
  function moveNodesTo(layout, duration) {
    if (tree.raf) { cancelAnimationFrame(tree.raf); tree.raf = null; }

    var targets = layout.positions;
    var dur = reduceMotion ? 0 : duration;

    function setPos(id, x, y) {
      tree.pos.set(id, { x: x, y: y });
      var g = tree.nodes.get(id);
      if (g) g.setAttribute('transform', 'translate(' + x.toFixed(2) + ' ' + y.toFixed(2) + ')');
    }

    if (dur <= 0) {
      targets.forEach(function (t, id) { setPos(id, t.x, t.y); });
      syncEdges();
      return;
    }

    // Snapshot where each node is NOW (mid-flight nodes start from there).
    var from = new Map();
    targets.forEach(function (t, id) {
      var cur = tree.pos.get(id);
      from.set(id, cur ? { x: cur.x, y: cur.y } : { x: t.x, y: t.y });
    });

    var startTime = performance.now();
    var easeOut = function (t) { return 1 - Math.pow(1 - t, 3); };

    function frame(now) {
      var t = Math.min(1, (now - startTime) / dur);
      var k = easeOut(t);
      targets.forEach(function (target, id) {
        var f = from.get(id);
        setPos(id, f.x + (target.x - f.x) * k, f.y + (target.y - f.y) * k);
      });
      syncEdges();
      if (t < 1) {
        tree.raf = requestAnimationFrame(frame);
      } else {
        tree.raf = null;
        targets.forEach(function (target, id) { setPos(id, target.x, target.y); });
        syncEdges();
      }
    }
    tree.raf = requestAnimationFrame(frame);
  }

  /**
   * Redraw every edge from the CURRENT animated node positions.
   * Lines are trimmed at both ends so they never poke through the circles,
   * and the "NEXT" tag always follows the node at index 0.
   */
  function syncEdges() {
    var pad = (tree.r || NODE_R_MAX) + 6;   // stay outside the highlight ring
    var root = tree.rootId ? tree.pos.get(tree.rootId) : null;

    for (var i = 0; i < tree.edges.length; i++) {
      var e = tree.edges[i];
      var parent = tree.pos.get(e.parentId);
      var child = tree.pos.get(e.childId);
      if (!parent || !child) { e.line.setAttribute('visibility', 'hidden'); continue; }

      var dx = child.x - parent.x;
      var dy = child.y - parent.y;
      var len = Math.sqrt(dx * dx + dy * dy);
      if (len < pad * 2) { e.line.setAttribute('visibility', 'hidden'); continue; }

      var ux = dx / len;
      var uy = dy / len;
      e.line.setAttribute('visibility', 'visible');
      e.line.setAttribute('x1', (parent.x + ux * pad).toFixed(2));
      e.line.setAttribute('y1', (parent.y + uy * pad).toFixed(2));
      e.line.setAttribute('x2', (child.x - ux * pad).toFixed(2));
      e.line.setAttribute('y2', (child.y - uy * pad).toFixed(2));
    }

    if (tree.rootTag) {
      if (!root) {
        tree.rootTag.setAttribute('visibility', 'hidden');
      } else {
        tree.rootTag.setAttribute('visibility', 'visible');
        tree.rootTag.setAttribute('x', root.x.toFixed(2));
        tree.rootTag.setAttribute('y', (root.y - pad - 4).toFixed(2));
      }
    }
  }

  /**
   * Draw / update the tree for `arr`.
   * @param {Array} arr  the array to draw (replayed or final state)
   * @param {number} duration  ms of travel for nodes that changed place
   */
  function renderTree(arr, duration) {
    var layout = computeLayout(arr);
    tree.r = layout.r;
    tree.rootId = arr.length > 0 ? arr[0].id : null;
    tree.svg.setAttribute('viewBox', '0 0 ' + layout.w + ' ' + layout.h);

    // 1. remove nodes that are no longer in the heap
    tree.nodes.forEach(function (g, id) {
      if (!layout.positions.has(id)) {
        g.remove();
        tree.nodes.delete(id);
        tree.pos.delete(id);
      }
    });

    // 2. create nodes for brand-new patients (fade in)
    arr.forEach(function (p) {
      if (tree.nodes.has(p.id)) return;
      var g = createNodeGroup(p, layout.r);
      if (tree.newIds.has(p.id)) {
        g.classList.add('is-new');
        tree.newIds.delete(p.id);
      }
      tree.nodeLayer.appendChild(g);
      tree.nodes.set(p.id, g);
      tree.pos.set(p.id, layout.positions.get(p.id));
    });

    // 3. keep circle radius / label sizes in sync with the tree width
    tree.nodes.forEach(function (g, id) {
      var t = layout.positions.get(id);
      if (!t) return;
      g.querySelector('.dot').setAttribute('r', layout.r);
      g.querySelector('.ring').setAttribute('r', layout.r + 6);
      g.querySelector('.name').setAttribute('y', layout.r + 15);
      g.querySelector('.name').setAttribute('font-size', layout.r < 14 ? '9' : '10.5');
      g.querySelector('.lvl').setAttribute('font-size', String(Math.max(10, Math.min(13, layout.r))));
      // highlight ring on the two nodes taking part in the current step
      g.classList.toggle('is-highlight', tree.highlight.has(id));
    });

    // 4. rebuild the edges (parents shift around as the array changes)
    tree.edgeLayer.textContent = '';
    tree.edges = [];
    for (var i = 1; i < arr.length; i++) {
      var parent = arr[Math.floor((i - 1) / 2)];
      var line = document.createElementNS(SVG_NS, 'line');
      // The edge inherits the CHILD's triage colour, so the graph stays readable.
      line.setAttribute('class', 'edge lv' + arr[i].level);
      tree.edgeLayer.appendChild(line);
      tree.edges.push({ line: line, parentId: parent.id, childId: arr[i].id });
    }

    moveNodesTo(layout, duration || 0);

    // Keep the "NEXT" tag drawn above the nodes.
    if (tree.rootTag) tree.nodeLayer.appendChild(tree.rootTag);
  }

  /* ======================================================================
     8. Animation engine — replays the steps returned by the heap
     ====================================================================== */

  /** Highlight the two nodes (and array chips) involved in a step. */
  function setHighlight(step) {
    tree.highlight.clear();
    var state = op.state;
    if (typeof step.i === 'number' && state[step.i]) tree.highlight.add(state[step.i].id);
    if (typeof step.j === 'number' && state[step.j]) tree.highlight.add(state[step.j].id);
    if (step.type === 'insert' && step.value) tree.highlight.add(step.value.id);
    if (step.type === 'remove-root' && step.moved) tree.highlight.add(step.moved.id);
  }

  function clearHighlight() { tree.highlight.clear(); }

  /**
   * Apply ONE step to the replayed array and redraw the panels.
   * Returns how long the UI should pause before the next step (ms).
   */
  function applyStep(step) {
    var s = op.state;
    var kind = 'compare';
    clearHighlight();

    if (step.type === 'insert') {
      // The new patient appears in its leaf slot, then bubbles up.
      s.push(step.value);
      tree.newIds.add(step.value.id);
      arrivingId = step.value.id;   // let the waiting-list card rise to its rank
      setHighlight(step);
      kind = 'insert';
    } else if (step.type === 'remove-root') {
      // Remove the root, then move the LAST node into the root slot.
      if (s.length <= 1) {
        s.length = 0;
      } else {
        var last = s.pop();     // take the last node out…
        s.shift();              // …clear the old root…
        s.unshift(last);        // …and put it at index 0
      }
      if (step.moved) setHighlight(step);
      kind = 'remove';
    } else if (step.type === 'swap') {
      var tmp = s[step.i];
      s[step.i] = s[step.j];
      s[step.j] = tmp;
      setHighlight(step);
      kind = 'swap';
    } else if (step.type === 'compare') {
      setHighlight(step);       // highlight only — nothing moves
      kind = 'compare';
    }

    displayState = s;
    setStepText(step.message);

    // Redraw all three panels so everything stays in sync with the array.
    // Compare steps only highlight — nothing travels, so no animation.
    renderTree(s, kind === 'compare' ? 0 : scaledMove(kind));
    renderArray(s);
    renderWaiting();
    renderTreated();

    return scaledWait(kind);
  }

  /** Start replaying a finished heap operation, step by step. */
  function startOperation(preState, steps, onDone) {
    op.busy = true;
    op.steps = steps;
    op.cursor = 0;
    op.state = preState.slice();
    op.onDone = onDone;
    displayState = op.state;
    clearHighlight();
    renderAll();
    updateControls();

    if (stepMode) {
      setStepText('Step-by-step mode — press “Next step” to run the first step.');
      if (steps.length === 0) finishOperation();
    } else {
      // Pause one short beat so the browser paints the BEFORE state first.
      // Without it the insert step lands in the same frame and looks instant.
      op.timer = setTimeout(autoTick, reduceMotion ? 0 : 240);
    }
  }

  /** Automatic mode: run the next step, then wait `wait` ms. */
  function autoTick() {
    if (!op.busy || stepMode) return;
    if (op.cursor >= op.steps.length) { finishOperation(); return; }
    var step = op.steps[op.cursor++];
    var wait = applyStep(step);
    op.timer = setTimeout(autoTick, wait);
  }

  /** Step-by-step mode: the "Next step" button runs exactly one step. */
  function runOneStep() {
    if (!op.busy || !stepMode) return;
    if (op.cursor >= op.steps.length) { finishOperation(); return; }
    var step = op.steps[op.cursor++];
    var wait = applyStep(step);
    if (op.cursor >= op.steps.length) {
      // Show the final step briefly, then settle on the real heap state.
      op.timer = setTimeout(finishOperation, Math.max(wait, 350));
    }
  }

  /** Finish the operation: adopt the real heap array and unlock the UI. */
  function finishOperation() {
    if (op.timer) { clearTimeout(op.timer); op.timer = null; }
    var done = op.onDone;

    op.busy = false;
    op.steps = [];
    op.cursor = 0;
    op.onDone = null;
    clearHighlight();
    displayState = heap.toArray();   // the authoritative final state
    if (done) done();

    renderAll();
    updateControls();
    clearStepText();
  }

  /* ======================================================================
     9. Operations: register, treat, demo
     ====================================================================== */

  /** Insert a validated patient and animate the bubble-up. */
  function startInsert(patient) {
    if (op.busy) return;
    var preState = heap.toArray();
    var steps = heap.insert(patient);       // mutates immediately, returns steps

    startOperation(preState, steps, function () {
      setStatus(
        'Registered ' + patient.name + ' (' + patient.id +
        ') as level ' + patient.level + ' — ' + TRIAGE[patient.level] + '.'
      );
    });
  }

  /** Extract the most urgent patient and animate the sink-down. */
  function treatNext() {
    if (op.busy) return;

    // Edge case: treating an empty queue must never throw.
    if (heap.size() === 0) {
      setStatus('No patients waiting — nothing to treat.', true);
      return;
    }

    var preState = heap.toArray();
    var result = heap.extractMin();
    var patient = result.patient;

    startOperation(preState, result.steps, function () {
      var waitedMs = Date.now() - patient.arrivalTs;
      treated.push({
        patient: patient,
        waitedMs: waitedMs,
        at: formatClock(Date.now()),
      });
      setStatus(
        'Treated ' + patient.name + ' (' + patient.id +
        ') — waited ' + formatWaiting(waitedMs) + '.'
      );
    });
  }

  /** Load the 10 demo patients instantly (bulk insert, no animation). */
  function loadDemo() {
    if (op.busy) return;
    var now = Date.now();

    DEMO_PATIENTS.forEach(function (d, i) {
      // Stagger arrivals so waiting times differ (last one just arrived).
      var arrivalTs = now - (DEMO_PATIENTS.length - 1 - i) * 45000;
      heap.insert(makePatient(d, arrivalTs));
    });

    displayState = heap.toArray();
    clearHighlight();
    renderAll();
    setStatus('Loaded ' + DEMO_PATIENTS.length + ' demo patients into the heap.');
    clearStepText();
  }

  /** Empty the heap and the treated history (a fresh simulation). */
  function resetAll() {
    if (op.busy) return;

    heap.clear();
    treated = [];
    idCounter = 0;
    displayState = [];
    arrivingId = null;
    lastWaitingKey = '';
    clearHighlight();

    renderAll();
    updateControls();
    clearStepText();
    setStatus('Cleared — the heap and the treated history are empty again.');
  }

  /* ======================================================================
     10. Form validation
     ====================================================================== */

  function showError(id, msg) {
    var el = $(id);
    el.textContent = msg || '';
    return !msg;   // true when the field is valid
  }

  /** Validate the registration form; returns { ok, data } or { ok, errors }. */
  function validateForm() {
    var name = $('#pName').value.trim();
    var ageRaw = $('#pAge').value.trim();
    var condition = $('#pCondition').value.trim();
    var levelInput = document.querySelector('input[name="level"]:checked');
    var ok = true;

    // Name: 2–40 characters, letters/spaces/hyphens/apostrophes/periods.
    if (!name) {
      ok = showError('#errName', 'Enter the patient name.') && ok;
    } else if (!/^[A-Za-z][A-Za-z' .-]{1,39}$/.test(name)) {
      ok = showError('#errName',
        'Use 2–40 letters, spaces, hyphens, apostrophes or periods.') && ok;
    } else {
      showError('#errName', '');
    }

    // Age: required whole number between 0 and 120.
    if (!ageRaw) {
      ok = showError('#errAge', 'Enter the age.') && ok;
    } else if (!/^\d{1,3}$/.test(ageRaw) || Number(ageRaw) > 120) {
      ok = showError('#errAge', 'Age must be a whole number from 0 to 120.') && ok;
    } else {
      showError('#errAge', '');
    }

    // Condition: 2–60 characters.
    if (condition.length < 2) {
      ok = showError('#errCondition', 'Enter a short condition.') && ok;
    } else if (condition.length > 60) {
      ok = showError('#errCondition', 'Keep it under 60 characters.') && ok;
    } else {
      showError('#errCondition', '');
    }

    // Triage level: one of 1–5 must be chosen.
    if (!levelInput) {
      ok = showError('#errLevel', 'Choose a triage level (1–5).') && ok;
    } else {
      showError('#errLevel', '');
    }

    if (!ok) return { ok: false };

    return {
      ok: true,
      data: {
        name: name,
        age: Number(ageRaw),
        condition: condition,
        level: Number(levelInput.value),
      },
    };
  }

  /** Clear every error message and the form itself. */
  function resetForm() {
    ['#errName', '#errAge', '#errCondition', '#errLevel'].forEach(function (id) {
      $(id).textContent = '';
    });
    $('#patientForm').reset();
    ['pName', 'pAge', 'pCondition'].forEach(function (id) {
      $('#' + id).removeAttribute('aria-invalid');
    });
    $('#pName').focus();
  }

  /* ======================================================================
     11. Control states (disabled while an animation is running)
     ====================================================================== */

  function updateControls() {
    $('#registerBtn').disabled = op.busy;
    $('#demoBtn').disabled = op.busy;
    $('#resetBtn').disabled = op.busy;
    $('#treatBtn').disabled = op.busy;
    $('#stepToggle').disabled = op.busy;   // cannot change modes mid-operation

    // The "Next step" button only exists while a paused operation is running.
    $('#nextStepBtn').hidden = !(op.busy && stepMode);
  }

  /* ======================================================================
     12. Live waiting times (updates every second, no full re-render)
     ====================================================================== */

  function startWaitingTicker() {
    setInterval(function () {
      var nodes = document.querySelectorAll('[data-ts]');
      var now = Date.now();
      for (var i = 0; i < nodes.length; i++) {
        nodes[i].textContent = formatWaiting(now - Number(nodes[i].dataset.ts));
      }
    }, 1000);
  }

  /* ======================================================================
     13. Event wiring
     ====================================================================== */

  function bindEvents() {
    // --- Register a patient ---
    $('#patientForm').addEventListener('submit', function (e) {
      e.preventDefault();
      if (op.busy) return;

      var result = validateForm();
      if (!result.ok) {
        setStatus('Please fix the highlighted fields before registering.', true);
        var firstError = document.querySelector('.field-error:not(:empty)');
        if (firstError) {
          var field = firstError.closest('.field, fieldset');
          var input = field && field.querySelector('input');
          if (input) input.focus();
        }
        return;
      }

      startInsert(makePatient(result.data, Date.now()));
      resetForm();
    });

    // --- Treat the most urgent patient ---
    $('#treatBtn').addEventListener('click', treatNext);

    // --- Demo data ---
    $('#demoBtn').addEventListener('click', loadDemo);

    // --- Clear everything ---
    $('#resetBtn').addEventListener('click', resetAll);

    // --- FIFO comparison toggle ---
    $('#fifoToggle').addEventListener('change', function () {
      fifoMode = this.checked;
      renderWaiting();
      setStatus(
        fifoMode
          ? 'FIFO comparison on — priority order shown next to arrival order.'
          : 'FIFO comparison off — showing priority order only.'
      );
    });

    // --- Step-by-step mode ---
    $('#stepToggle').addEventListener('change', function () {
      stepMode = this.checked;
      setStatus(
        stepMode
          ? 'Step-by-step mode ON — operations will pause for “Next step”.'
          : 'Step-by-step mode OFF — operations play automatically.'
      );
      if (!op.busy) clearStepText();
    });

    // --- Next step button ---
    $('#nextStepBtn').addEventListener('click', runOneStep);

    // --- Animation speed ---
    $('#speedRange').addEventListener('input', function () {
      speed = Number(this.value);
      $('#speedValue').textContent = speed + '×';
    });
  }

  /* ======================================================================
     14. Start the app
     ====================================================================== */

  function init() {
    statusEl = $('#statusMsg');
    stepEl = $('#stepText');

    tree.svg = $('#heapSvg');
    tree.edgeLayer = $('#edgeLayer');
    tree.nodeLayer = $('#nodeLayer');

    // Small label above the root: the patient who will be treated next.
    tree.rootTag = document.createElementNS(SVG_NS, 'text');
    tree.rootTag.setAttribute('class', 'root-tag');
    tree.rootTag.textContent = 'NEXT';
    tree.nodeLayer.appendChild(tree.rootTag);

    bindEvents();
    updateControls();
    renderAll();
    startWaitingTicker();
    setStatus('Ready — register a patient or load the demo to begin.');
  }

  try {
    init();
  } catch (err) {
    // Never fail silently: show the problem on the page instead.
    var msg = document.getElementById('statusMsg');
    if (msg) {
      msg.textContent = 'Something went wrong while starting the page: ' + err.message;
      msg.classList.add('is-error');
    }
  }
})();



