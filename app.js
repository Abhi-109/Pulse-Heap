/**
 * ============================================================================
 *  app.js — UI logic for "PulseHeap"
 * ============================================================================
 *  Everything DOM-related lives here. The other two files stay focused:
 *
 *      heap.js    → how the priority queue works      (pure data, no DOM)
 *      tree.js    → how the heap is drawn as a tree   (pure drawing, no data)
 *      app.js     → how the page reacts               (forms, panels, steps)
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

  /** Where the session is remembered (theme, patients, counters…). */
  var STORE_KEY = 'pulseheap.v1';
  var MAX_HISTORY = 30;

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
  var searchTerm = '';            // current filter text for the waiting list
  var theme = 'light';            // 'light' | 'dark'

  /** Totals used by the stat strip (restored with the session). */
  var stats = { compares: 0, swaps: 0 };

  /** Undo stack: one snapshot per completed action. */
  var historyStack = [];

  // Respect the OS "reduce motion" setting: no travel, very short pauses.
  var reduceMotion =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /** The operation that is currently being animated (if any). */
  var op = {
    busy: false,
    steps: [],
    cursor: 0,
    preState: [],   // array BEFORE the operation (used by the step scrubber)
    state: [],      // replayed copy of the array (starts as pre-operation)
    timer: null,
    onDone: null,
    focusAfter: null,
  };

  /* ======================================================================
     3. Small helpers
     ====================================================================== */

  var $ = function (sel) { return document.querySelector(sel); };
  var $$ = function (sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); };

  /** Escape user input before putting it into innerHTML (name, condition…). */
  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /** Shorten a string for array chips. */
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

  /** Order patients by their arrival counter (used when rebuilding the heap). */
  function bySeq(a, b) { return (a.seq || 0) - (b.seq || 0); }

  /**
   * Rebuild the heap from a plain list of patients.
   * Inserting them in arrival order re-creates exactly the same priorities
   * (the heap's comparator only uses level + seq), which is what makes undo
   * and level editing possible without touching heap.js.
   */
  function rebuildHeap(list) {
    heap.clear();
    list.slice().sort(bySeq).forEach(function (p) { heap.insert(p); });
  }

  /** Does every parent beat both of its children? (the heap property) */
  function heapHolds(arr) {
    for (var i = 1; i < arr.length; i++) {
      if (comparePatients(arr[i], arr[(i - 1) >> 1]) < 0) return false;
    }
    return true;
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
     5. Stat strip + triage distribution
     ====================================================================== */

  function renderStats() {
    var list = displayState;
    var counts = [0, 0, 0, 0, 0, 0];   // index = triage level

    list.forEach(function (p) { counts[p.level] += 1; });

    $('#statWaiting').textContent = String(list.length);
    $('#statCritical').textContent = String(counts[1]);
    $('#statTreated').textContent = String(treated.length);
    $('#statCompares').textContent = String(stats.compares);
    $('#statSwaps').textContent = String(stats.swaps);

    for (var lv = 1; lv <= 5; lv++) {
      var countEl = document.getElementById('distLv' + lv);
      if (countEl) countEl.textContent = String(counts[lv]);
    }

    var bar = $('#distBar');
    if (list.length === 0) {
      bar.innerHTML = '<span class="dist-empty">No patients yet — the bar fills as you register them.</span>';
      bar.setAttribute('aria-label', 'Triage distribution: empty');
      return;
    }

    var parts = [];
    for (var level = 1; level <= 5; level++) {
      if (!counts[level]) continue;
      var pct = (counts[level] / list.length) * 100;
      parts.push(
        '<span class="dist-seg lv' + level + '" style="width:' + pct.toFixed(2) + '%" ' +
          'title="Level ' + level + ' ' + TRIAGE[level] + ': ' + counts[level] + ' patient' +
          (counts[level] === 1 ? '' : 's') + '"></span>'
      );
    }
    bar.innerHTML = parts.join('');
    bar.setAttribute(
      'aria-label',
      'Triage distribution: ' + [1, 2, 3, 4, 5]
        .map(function (l) { return counts[l] + ' at level ' + l; })
        .join(', ')
    );
  }

  /* ======================================================================
     6. Panel rendering (waiting list, treated history, counts)
     ====================================================================== */

  /** The level picker that sits where the old static level tag was. */
  function levelSelect(p) {
    var options = '';
    for (var lv = 1; lv <= 5; lv++) {
      options += '<option value="' + lv + '"' + (lv === p.level ? ' selected' : '') + '>' +
        lv + ' · ' + TRIAGE[lv] + '</option>';
    }
    return (
      '<select class="lvl-edit lv' + p.level + '" data-pid="' + escapeHtml(p.id) + '" ' +
        'aria-label="Change triage level for ' + escapeHtml(p.name) + '">' +
        options +
      '</select>'
    );
  }

  /** One waiting-list card (priority order, with rank). */
  function patientCard(p, rank) {
    var waited = formatWaiting(Date.now() - p.arrivalTs);
    return (
      '<article class="card lv' + p.level + '" data-pid="' + escapeHtml(p.id) + '" role="listitem">' +
        '<span class="level-chip" aria-label="Triage level ' + p.level +
          ': ' + TRIAGE[p.level] + '">' + p.level + '</span>' +
        '<div class="patient-body">' +
          '<div class="patient-top">' +
            '<h4>' + escapeHtml(p.name) +
              '<span class="pid">' + escapeHtml(p.id) + '</span></h4>' +
            levelSelect(p) +
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
      '<li class="row lv' + p.level + '" role="listitem">' +
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

  /** Does this patient match the search box? */
  function matchesSearch(p) {
    if (!searchTerm) return true;
    var q = searchTerm.toLowerCase();
    return (
      p.name.toLowerCase().indexOf(q) !== -1 ||
      p.id.toLowerCase().indexOf(q) !== -1 ||
      p.condition.toLowerCase().indexOf(q) !== -1
    );
  }

  /** A short signature of the waiting order, e.g. "prio|P3,P1,P2". */
  function waitingKey(list) {
    return (fifoMode ? 'fifo|' : 'prio|') + searchTerm + '|' +
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
    var list = sortPatients(displayState);          // highest priority first
    var visible = list.filter(matchesSearch);       // apply the search filter

    $('#waitCount').textContent = searchTerm
      ? visible.length + ' / ' + list.length
      : String(list.length);

    var key = waitingKey(visible);
    if (key === lastWaitingKey) return;             // same patients, same order
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

    if (visible.length === 0) {
      box.innerHTML = emptyState(
        'No patient matches “' + escapeHtml(searchTerm) + '”',
        'Try another name, ID or condition — or clear the filter.'
      );
      arrivingId = null;
      return;
    }

    if (fifoMode) {
      // Same patients, two orders side by side: heap priority vs arrival.
      var fifo = visible
        .slice()
        .sort(function (a, b) { return a.seq - b.seq; });

      var priorityRows = visible
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

    box.innerHTML = visible
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
        '<li class="empty" role="listitem">' +
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

  /** Heap size + the live heap-property badge. */
  function updateHeapMeta() {
    $('#heapSize').textContent =
      displayState.length + (displayState.length === 1 ? ' node' : ' nodes');
    $('#heapEmpty').hidden = displayState.length > 0;

    var ok = heapHolds(displayState);
    var badge = $('#heapBadge');
    badge.textContent = ok ? '✓ min-heap holds' : '⚠ order broken';
    badge.classList.toggle('is-broken', !ok);
  }

  /** Re-render every panel from the current displayState. */
  function renderAll(duration) {
    renderStats();
    renderWaiting();
    renderTreated();
    HeapTree.render(displayState, duration || 0);
    renderArray(displayState);
    updateHeapMeta();
  }

  /* ======================================================================
     7. Array form of the heap (chips under the tree)
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
        var active = HeapTree.highlight.has(p.id) ? ' is-active' : '';
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
     8. Animation engine — replays the steps returned by the heap
     ====================================================================== */

  /**
   * Apply one step to a plain array. Pure: no DOM, no heap.
   * @returns {'insert'|'remove'|'swap'|'compare'} the kind of movement
   */
  function mutateState(s, step) {
    if (step.type === 'insert') {
      s.push(step.value);
      return 'insert';
    }
    if (step.type === 'remove-root') {
      if (s.length <= 1) {
        s.length = 0;                 // the only patient left
      } else {
        var last = s.pop();           // take the last node out…
        s.shift();                    // …clear the old root…
        s.unshift(last);              // …and put it at index 0
      }
      return 'remove';
    }
    if (step.type === 'swap') {
      var tmp = s[step.i];
      s[step.i] = s[step.j];
      s[step.j] = tmp;
      return 'swap';
    }
    return 'compare';
  }

  /** Highlight the two nodes (and array chips) involved in a step. */
  function setHighlight(step, state) {
    HeapTree.highlight.clear();
    if (typeof step.i === 'number' && state[step.i]) HeapTree.highlight.add(state[step.i].id);
    if (typeof step.j === 'number' && state[step.j]) HeapTree.highlight.add(state[step.j].id);
    if (step.type === 'insert' && step.value) HeapTree.highlight.add(step.value.id);
    if (step.type === 'remove-root' && step.moved) HeapTree.highlight.add(step.moved.id);
  }

  function clearHighlight() {
    HeapTree.clearHighlight();
  }

  /** Keep the step scrubber in sync with the operation. */
  function updateScrub() {
    var row = $('#scrubRow');
    var range = $('#scrubRange');
    var show = op.busy && stepMode && op.steps.length > 0;
    row.hidden = !show;
    if (!show) return;
    range.max = String(op.steps.length);
    range.value = String(op.cursor);
    $('#scrubValue').textContent = op.cursor + ' / ' + op.steps.length;
  }

  /**
   * Apply ONE step to the replayed array and redraw the panels.
   * Returns how long the UI should pause before the next step (ms).
   */
  function applyStep(step) {
    var kind = mutateState(op.state, step);

    if (step.type === 'insert') {
      HeapTree.markNew(step.value.id);
      arrivingId = step.value.id;   // let the waiting-list card rise to its rank
    }

    displayState = op.state;
    clearHighlight();
    setHighlight(step, op.state);
    setStepText(step.message);

    // Redraw every panel so everything stays in sync with the array.
    // Compare steps only highlight — nothing travels, so no animation.
    HeapTree.render(op.state, kind === 'compare' ? 0 : scaledMove(kind));
    renderArray(op.state);
    renderWaiting();
    renderTreated();
    renderStats();
    updateHeapMeta();
    updateScrub();

    return scaledWait(kind);
  }

  /** Build the array that exists after the first `k` steps. */
  function stateAfter(k) {
    var s = op.preState.slice();
    for (var i = 0; i < k && i < op.steps.length; i++) mutateState(s, op.steps[i]);
    return s;
  }

  /** Jump the paused operation to step `k` (the step scrubber). */
  function jumpToStep(k) {
    if (!op.busy) return;
    op.cursor = Math.max(0, Math.min(op.steps.length, k));
    arrivingId = null;
    displayState = stateAfter(op.cursor);
    op.state = displayState;

    clearHighlight();
    if (op.cursor > 0) setHighlight(op.steps[op.cursor - 1], displayState);

    HeapTree.render(displayState, 0);
    renderArray(displayState);
    renderWaiting();
    renderTreated();
    renderStats();
    updateHeapMeta();

    if (op.cursor === 0) {
      setStepText('Step-by-step mode — press “Next step” to run the first step.');
    } else {
      setStepText(op.steps[op.cursor - 1].message);
    }
    updateScrub();
  }

  /** Start replaying a finished heap operation, step by step. */
  function startOperation(preState, steps, onDone, focusAfter) {
    op.busy = true;
    op.steps = steps;
    op.cursor = 0;
    op.preState = preState.slice();
    op.state = preState.slice();
    op.onDone = onDone;
    op.focusAfter = focusAfter || null;

    // The heap already did the work, so its real cost is known right now.
    stats.compares += steps.filter(function (s) { return s.type === 'compare'; }).length;
    stats.swaps += steps.filter(function (s) { return s.type === 'swap'; }).length;

    displayState = op.state;
    clearHighlight();
    renderAll();
    updateControls();
    updateScrub();

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
    var focusAfter = op.focusAfter;

    op.busy = false;
    op.steps = [];
    op.cursor = 0;
    op.onDone = null;
    op.focusAfter = null;
    op.preState = [];
    clearHighlight();
    displayState = heap.toArray();   // the authoritative final state
    if (done) done();

    renderAll();
    updateControls();
    updateScrub();
    clearStepText();
    save();

    if (focusAfter) {
      var el = $(focusAfter);
      if (el && !el.disabled) el.focus({ preventScroll: true });
    }
  }

  /* ======================================================================
     9. Undo history + persistence
     ====================================================================== */

  /** Freeze the current session so it can be restored later. */
  function snapshot(label) {
    return {
      label: label,
      patients: heap.toArray(),
      treated: treated.slice(),
      idCounter: idCounter,
      stats: { compares: stats.compares, swaps: stats.swaps },
    };
  }

  function pushHistory(label) {
    historyStack.push(snapshot(label));
    if (historyStack.length > MAX_HISTORY) historyStack.shift();
    updateControls();
  }

  /** Step back one completed action. */
  function undo() {
    if (op.busy || historyStack.length === 0) {
      if (!op.busy) setStatus('Nothing to undo yet.', true);
      return;
    }

    var snap = historyStack.pop();
    heap.clear();
    snap.patients.slice().sort(bySeq).forEach(function (p) { heap.insert(p); });

    treated = snap.treated;
    idCounter = snap.idCounter;
    stats = snap.stats;

    displayState = heap.toArray();
    arrivingId = null;
    lastWaitingKey = '';

    renderAll();
    updateControls();
    clearStepText();
    save();
    setStatus('Undid ' + snap.label + '.');
  }

  /** Save the session (patients, counters, theme, options) in this browser. */
  function save() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({
        v: 1,
        patients: heap.toArray(),
        treated: treated,
        idCounter: idCounter,
        stats: stats,
        theme: theme,
        fifo: fifoMode,
        step: stepMode,
        speed: speed,
      }));
    } catch (e) {
      // Storage can be blocked (private mode, some file:// setups) — the page
      // still works, it just forgets between visits.
    }
  }

  /** Is this a patient object we can trust from storage? */
  function isPatient(p) {
    return !!p && typeof p.id === 'string' && typeof p.name === 'string' &&
      typeof p.condition === 'string' && typeof p.arrivalTs === 'number' &&
      typeof p.level === 'number' && p.level >= 1 && p.level <= 5 &&
      typeof p.arrivalTime === 'string';
  }

  /** Restore the previous session. Returns true when something was loaded. */
  function restore() {
    var raw = null;
    try { raw = localStorage.getItem(STORE_KEY); } catch (e) { return false; }
    if (!raw) return false;

    var data;
    try { data = JSON.parse(raw); } catch (e) { return false; }
    if (!data || data.v !== 1) return false;

    applyTheme(data.theme === 'dark' ? 'dark' : 'light');
    fifoMode = !!data.fifo;
    stepMode = !!data.step;
    speed = typeof data.speed === 'number' ? data.speed : 1;

    stats = {
      compares: data.stats && Number(data.stats.compares) || 0,
      swaps: data.stats && Number(data.stats.swaps) || 0,
    };

    var patients = (Array.isArray(data.patients) ? data.patients : []).filter(isPatient);
    rebuildHeap(patients);

    treated = (Array.isArray(data.treated) ? data.treated : [])
      .filter(function (entry) {
        return entry && isPatient(entry.patient) && typeof entry.waitedMs === 'number';
      });

    idCounter = Math.max(Number(data.idCounter) || 0, patients.length);
    displayState = heap.toArray();
    lastWaitingKey = '';
    return patients.length > 0 || treated.length > 0;
  }

  /* ======================================================================
     10. CSV export
     ====================================================================== */

  function csvCell(value) {
    var s = String(value == null ? '' : value);
    return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  /** Download every waiting + treated patient as a spreadsheet-friendly file. */
  function exportCsv() {
    var now = Date.now();
    var rows = [['Status', 'ID', 'Name', 'Age', 'Triage level', 'Triage name',
                 'Condition', 'Arrived', 'Waiting']];

    sortPatients(heap.toArray()).forEach(function (p) {
      rows.push(['Waiting', p.id, p.name, p.age, p.level, TRIAGE[p.level],
                 p.condition, p.arrivalTime, formatWaiting(now - p.arrivalTs)]);
    });

    treated.forEach(function (entry) {
      var p = entry.patient;
      rows.push(['Treated', p.id, p.name, p.age, p.level, TRIAGE[p.level],
                 p.condition, p.arrivalTime, formatWaiting(entry.waitedMs)]);
    });

    var csv = rows.map(function (row) { return row.map(csvCell).join(','); }).join('\r\n');
    var stamp = new Date();
    var name = 'pulseheap-' + stamp.getFullYear() +
      pad2(stamp.getMonth() + 1) + pad2(stamp.getDate()) + '-' +
      pad2(stamp.getHours()) + pad2(stamp.getMinutes()) + '.csv';

    var blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var link = document.createElement('a');
    link.href = url;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);

    setStatus(
      rows.length === 1
        ? 'Nothing to export yet — register or load a patient first.'
        : 'Exported ' + (rows.length - 1) + ' patients to ' + name + '.',
      rows.length === 1
    );
  }

  /* ======================================================================
     11. Operations: register, treat, demo, clear, level edit
     ====================================================================== */

  /** Insert a validated patient and animate the bubble-up. */
  function startInsert(patient) {
    if (op.busy) return;
    var preState = heap.toArray();
    pushHistory('registration of ' + patient.name);
    var steps = heap.insert(patient);       // mutates immediately, returns steps

    startOperation(preState, steps, function () {
      setStatus(
        'Registered ' + patient.name + ' (' + patient.id +
        ') as level ' + patient.level + ' — ' + TRIAGE[patient.level] + '.'
      );
    }, '#pName');
  }

  /** Extract the most urgent patient and animate the sink-down. */
  function treatNext() {
    if (op.busy) return;

    // Edge case: treating an empty queue must never throw.
    if (heap.size() === 0) {
      setStatus('No patients waiting — nothing to treat.', true);
      return;
    }

    var next = heap.peek();
    var preState = heap.toArray();
    pushHistory('treating ' + next.name);

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
    }, '#treatBtn');
  }

  /** Load the 10 demo patients instantly (bulk insert, no animation). */
  function loadDemo() {
    if (op.busy) return;
    var now = Date.now();

    pushHistory('loading the demo patients');

    DEMO_PATIENTS.forEach(function (d, i) {
      // Stagger arrivals so waiting times differ (last one just arrived).
      var arrivalTs = now - (DEMO_PATIENTS.length - 1 - i) * 45000;
      heap.insert(makePatient(d, arrivalTs));
    });

    displayState = heap.toArray();
    clearHighlight();
    lastWaitingKey = '';
    renderAll();
    save();
    setStatus('Loaded ' + DEMO_PATIENTS.length + ' demo patients into the heap.');
    clearStepText();
  }

  /** Empty the heap and the treated history (a fresh simulation). */
  function resetAll() {
    if (op.busy) return;
    if (heap.size() === 0 && treated.length === 0) {
      setStatus('Already empty — register a patient or load the demo.');
      return;
    }

    pushHistory('clearing everything');

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
    save();
    setStatus('Cleared — the heap and the treated history are empty again.');
  }

  /** Change a waiting patient's triage level in place and re-heapify. */
  function changeLevel(id, level) {
    if (op.busy) return;

    var arr = heap.toArray();
    var patient = null;
    for (var i = 0; i < arr.length; i++) {
      if (arr[i].id === id) { patient = arr[i]; break; }
    }
    if (!patient || patient.level === level) return;

    var oldLevel = patient.level;
    pushHistory('changing ' + patient.name + ' to level ' + level);

    patient.level = level;
    rebuildHeap(arr);

    displayState = heap.toArray();
    arrivingId = null;
    lastWaitingKey = '';
    renderAll(reduceMotion ? 0 : 420);
    save();

    setStatus(
      'Changed ' + patient.name + ' from level ' + oldLevel + ' (' +
      TRIAGE[oldLevel] + ') to level ' + level + ' (' + TRIAGE[level] +
      ') — the heap re-ordered itself in O(log n).'
    );

    // Put the keyboard focus back on the same picker after the re-render.
    requestAnimationFrame(function () {
      var sel = document.querySelector('.lvl-edit[data-pid="' + id + '"]');
      if (sel) sel.focus({ preventScroll: true });
    });
  }

  /* ======================================================================
     12. Form validation
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
  }

  /* ======================================================================
     13. Control states (disabled while an animation is running)
     ====================================================================== */

  function updateControls() {
    $('#registerBtn').disabled = op.busy;
    $('#demoBtn').disabled = op.busy;
    $('#resetBtn').disabled = op.busy;
    $('#treatBtn').disabled = op.busy;
    $('#stepToggle').disabled = op.busy;   // cannot change modes mid-operation
    $('#undoBtn').disabled = op.busy || historyStack.length === 0;

    // The "Next step" button only exists while a paused operation is running.
    $('#nextStepBtn').hidden = !(op.busy && stepMode);
  }

  /* ======================================================================
     14. Mode toggles + theme
     ====================================================================== */

  function toggleFifo(force) {
    fifoMode = force === undefined ? !fifoMode : !!force;
    $('#fifoToggle').checked = fifoMode;
    lastWaitingKey = '';
    renderWaiting();
    save();
    setStatus(
      fifoMode
        ? 'FIFO comparison on — priority order shown next to arrival order.'
        : 'FIFO comparison off — showing priority order only.'
    );
  }

  function toggleStep(force) {
    stepMode = force === undefined ? !stepMode : !!force;
    $('#stepToggle').checked = stepMode;
    updateControls();
    updateScrub();
    save();
    setStatus(
      stepMode
        ? 'Step-by-step mode ON — operations will pause for “Next step”.'
        : 'Step-by-step mode OFF — operations play automatically.'
    );
    if (!op.busy) clearStepText();
  }

  function applyTheme(mode) {
    theme = mode === 'dark' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', theme);
    var btn = $('#themeBtn');
    btn.setAttribute('aria-pressed', theme === 'dark' ? 'true' : 'false');
    btn.textContent = theme === 'dark' ? 'Light mode' : 'Dark mode';
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'dark' ? '#0b1120' : '#334155');
  }

  function toggleTheme() {
    applyTheme(theme === 'dark' ? 'light' : 'dark');
    save();
    setStatus(theme === 'dark' ? 'Dark mode on.' : 'Light mode on.');
  }

  /* ======================================================================
     15. Guided tour
     ====================================================================== */

  var TOUR_STEPS = [
    {
      target: '#registerPanel',
      title: 'Register a patient',
      text: 'Fill in the name, age, condition and triage level. Level 1 is the most urgent. ' +
            'Press “Register patient” and watch where the new card lands.',
    },
    {
      target: '#waitList',
      title: 'The waiting list',
      text: 'This is priority order, not arrival order — level 1 first, ties broken by who ' +
            'arrived earlier. Change a card’s level right on the card to see it re-sort.',
    },
    {
      target: '#heapPanel',
      title: 'Inside the heap',
      text: 'The tree is the array you see below it. A node only ever moves along one ' +
            'root-to-leaf path, which is why insert and remove cost O(log n).',
    },
    {
      target: '#demoBtn',
      title: 'Try it now',
      text: 'Load 10 demo patients, then press “Treat next”. Turn on Step-by-step to walk ' +
            'through every comparison and swap yourself.',
    },
  ];

  var tour = { index: 0, bubble: null, open: false };

  function buildTourBubble() {
    var bubble = document.createElement('div');
    bubble.className = 'tour';
    bubble.id = 'tourBubble';
    bubble.setAttribute('role', 'dialog');
    bubble.setAttribute('aria-modal', 'false');
    bubble.setAttribute('aria-live', 'polite');
    bubble.hidden = true;
    bubble.innerHTML =
      '<p class="tour-count"></p>' +
      '<h3 class="tour-title"></h3>' +
      '<p class="tour-text"></p>' +
      '<div class="tour-actions">' +
        '<button type="button" class="btn btn--ghost btn--small" data-tour="skip">Skip</button>' +
        '<button type="button" class="btn btn--small" data-tour="prev">Back</button>' +
        '<button type="button" class="btn btn--primary btn--small" data-tour="next">Next</button>' +
      '</div>';
    document.body.appendChild(bubble);

    bubble.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-tour]');
      if (!btn) return;
      var action = btn.getAttribute('data-tour');
      if (action === 'skip') endTour();
      else if (action === 'prev') showTourStep(tour.index - 1);
      else if (action === 'next') {
        if (tour.index >= TOUR_STEPS.length - 1) endTour();
        else showTourStep(tour.index + 1);
      }
    });

    tour.bubble = bubble;
    return bubble;
  }

  function startTour() {
    if (op.busy) return;
    if (!tour.bubble) buildTourBubble();
    tour.open = true;
    showTourStep(0);
  }

  function showTourStep(index) {
    if (!tour.open) return;

    if (index < 0) index = 0;
    if (index >= TOUR_STEPS.length) {
      endTour();
      return;
    }
    tour.index = index;

    var step = TOUR_STEPS[index];
    var target = $(step.target);
    if (!target) { endTour(); return; }

    $$('.tour-target').forEach(function (el) { el.classList.remove('tour-target'); });
    target.classList.add('tour-target');
    target.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'auto' });

    var bubble = tour.bubble;
    bubble.hidden = false;
    bubble.querySelector('.tour-count').textContent =
      'Step ' + (index + 1) + ' of ' + TOUR_STEPS.length;
    bubble.querySelector('.tour-title').textContent = step.title;
    bubble.querySelector('.tour-text').textContent = step.text;

    var prev = bubble.querySelector('[data-tour="prev"]');
    var next = bubble.querySelector('[data-tour="next"]');
    prev.disabled = index === 0;
    next.textContent = index === TOUR_STEPS.length - 1 ? 'Done' : 'Next';

    positionTourBubble(target);
    bubble.querySelector('[data-tour="next"]').focus({ preventScroll: true });
  }

  function positionTourBubble(target) {
    var bubble = tour.bubble;
    if (!bubble || bubble.hidden) return;

    var rect = target.getBoundingClientRect();
    var width = bubble.offsetWidth || 320;
    var height = bubble.offsetHeight || 170;

    var top = rect.bottom + 12;
    if (top + height > window.innerHeight - 12) {
      top = Math.max(12, rect.top - height - 12);
    }
    var left = Math.min(Math.max(12, rect.left + 8), window.innerWidth - width - 12);

    bubble.style.top = Math.round(top) + 'px';
    bubble.style.left = Math.round(left) + 'px';
  }

  function endTour() {
    if (!tour.open) return;
    tour.open = false;
    if (tour.bubble) tour.bubble.hidden = true;
    $$('.tour-target').forEach(function (el) { el.classList.remove('tour-target'); });
    setStatus('Tour finished — press “?” any time to see it again.');
    var demo = $('#demoBtn');
    if (demo && !demo.disabled) demo.focus({ preventScroll: true });
  }

  /* ======================================================================
     15b. Live waiting times (updates every second, no full re-render)
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
     16. Event wiring
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

    // --- Demo data / undo / clear / export ---
    $('#demoBtn').addEventListener('click', loadDemo);
    $('#undoBtn').addEventListener('click', undo);
    $('#resetBtn').addEventListener('click', resetAll);
    $('#exportBtn').addEventListener('click', exportCsv);
    $('#tourBtn').addEventListener('click', startTour);

    // --- FIFO comparison toggle ---
    $('#fifoToggle').addEventListener('change', function () { toggleFifo(this.checked); });

    // --- Step-by-step mode ---
    $('#stepToggle').addEventListener('change', function () { toggleStep(this.checked); });

    // --- Next step button ---
    $('#nextStepBtn').addEventListener('click', runOneStep);

    // --- Step scrubber ---
    $('#scrubRange').addEventListener('input', function () {
      jumpToStep(Number(this.value));
    });

    // --- Animation speed ---
    $('#speedRange').addEventListener('input', function () {
      speed = Number(this.value);
      $('#speedValue').textContent = speed + '×';
      save();
    });

    // --- In-place level editing (delegated: cards are re-rendered) ---
    $('#waitList').addEventListener('change', function (e) {
      var sel = e.target.closest('.lvl-edit');
      if (!sel) return;
      changeLevel(sel.getAttribute('data-pid'), Number(sel.value));
    });

    // --- Search / filter ---
    $('#searchInput').addEventListener('input', function () {
      searchTerm = this.value.trim();
      $('#searchClearBtn').hidden = searchTerm === '';
      lastWaitingKey = '';
      renderWaiting();
    });
    $('#searchClearBtn').addEventListener('click', function () {
      searchTerm = '';
      $('#searchInput').value = '';
      $('#searchClearBtn').hidden = true;
      lastWaitingKey = '';
      renderWaiting();
      $('#searchInput').focus();
    });

    // --- Theme ---
    $('#themeBtn').addEventListener('click', toggleTheme);

    // --- Keyboard shortcuts ---
    document.addEventListener('keydown', onKeyDown);

    // --- Keep the tour bubble anchored after a resize ---
    window.addEventListener('resize', function () {
      if (!tour.open) return;
      var target = $(TOUR_STEPS[tour.index].target);
      if (target) positionTourBubble(target);
    });
  }

  /** Keyboard shortcuts (ignored while typing in a field). */
  function onKeyDown(e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;

    var tag = (e.target.tagName || '').toLowerCase();
    var typing = tag === 'input' || tag === 'textarea' || tag === 'select' ||
      e.target.isContentEditable;

    if (typing) {
      if (e.key === 'Escape') e.target.blur();
      return;
    }

    if (e.key === '/') {
      e.preventDefault();
      $('#searchInput').focus();
      return;
    }
    if (e.key === 'Escape') {
      endTour();
      return;
    }

    switch (e.key.toLowerCase()) {
      case 'd': loadDemo(); break;
      case 't': treatNext(); break;
      case 'u': undo(); break;
      case 'e': exportCsv(); break;
      case 'f': toggleFifo(); break;
      case 's': toggleStep(); break;
      case '?': startTour(); break;
      default: break;
    }
  }

  /* ======================================================================
     17. Start the app
     ====================================================================== */

  function syncModeControls() {
    $('#fifoToggle').checked = fifoMode;
    $('#stepToggle').checked = stepMode;
    $('#speedRange').value = String(speed);
    $('#speedValue').textContent = speed + '×';
    $('#searchClearBtn').hidden = true;
    updateScrub();
  }

  function init() {
    statusEl = $('#statusMsg');
    stepEl = $('#stepText');

    HeapTree.init();

    var restored = false;
    try { restored = restore(); } catch (e) { restored = false; }
    if (!restored) applyTheme('light');

    bindEvents();
    syncModeControls();
    updateControls();
    renderAll();
    startWaitingTicker();

    setStatus(
      restored
        ? 'Welcome back — restored your last session from this browser.'
        : 'Ready — register a patient or load the demo to begin.'
    );
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
