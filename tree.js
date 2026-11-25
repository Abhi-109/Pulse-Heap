/**
 * ============================================================================
 *  tree.js — draws the heap as an SVG binary tree
 * ============================================================================
 *  This file knows NOTHING about patients, forms or the heap algorithm.
 *  It receives a flat array (the heap's array form) and draws it as a tree:
 *
 *      parent(i) = floor((i - 1) / 2)     left(i) = 2i + 1     right(i) = 2i + 2
 *
 *  Why it is separate from app.js
 *  ------------------------------
 *  app.js is already busy with the form, the waiting list and the animation
 *  engine. Tree drawing is a self-contained problem — layout, circles, edges —
 *  so it lives here behind one small public API:
 *
 *      HeapTree.init()               find the SVG layers and create helpers
 *      HeapTree.render(arr, ms)      draw `arr`, gliding nodes for `ms` ms
 *      HeapTree.highlight            Set of patient ids to ring
 *      HeapTree.markNew(id)          fade this node in on its next render
 *      HeapTree.clearHighlight()
 *
 *  Each node is kept in a Map keyed by patient id, so an existing node GLIDES
 *  to its new place instead of being deleted and recreated. Edges are redrawn
 *  from the same animated positions every frame, so lines stay attached.
 * ============================================================================
 */
(function (global) {
  'use strict';

  var SVG_NS = 'http://www.w3.org/2000/svg';
  var TREE_W = 720;        // viewBox width (scales to the panel width)
  var PAD_X = 46;          // side padding inside the viewBox
  var TOP_Y = 46;          // y of the root row
  var NODE_R_MAX = 20;     // biggest circle radius

  var reduceMotion =
    typeof global.matchMedia === 'function' &&
    global.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /** Shorten a name so a label never spills into its neighbours. */
  function truncate(str, max) {
    str = String(str);
    return str.length > max ? str.slice(0, max - 1) + '…' : str;
  }

  var t = {
    svg: null,
    guideLayer: null,
    edgeLayer: null,
    nodeLayer: null,
    nodes: new Map(),     // patient id -> <g>
    edges: [],            // [{ line, parentId, childId }]
    pos: new Map(),       // patient id -> { x, y } last drawn position
    raf: null,            // id of the running animation frame
    highlight: new Set(), // patient ids drawn with the dashed ring
    newIds: new Set(),    // ids that should fade in on their first drawing
    rootTag: null,        // the small "NEXT" label above the root
    rootId: null,         // patient id currently at index 0
    r: NODE_R_MAX,        // current node radius (also used to trim the edges)
  };

  /* ------------------------------------------------------------------------
     1. Layout — where should every node sit?
     ------------------------------------------------------------------------ */

  /**
   * Compute a position for every patient in `arr`.
   * Time complexity: O(n).
   * @param {Array} arr flat heap array
   * @returns {{w:number,h:number,r:number,positions:Map,maxDepth:number,rowH:number}}
   */
  function computeLayout(arr) {
    var n = arr.length;
    var positions = new Map();
    if (n === 0) {
      return { w: TREE_W, h: 240, r: NODE_R_MAX, positions: positions, maxDepth: 0, rowH: 0 };
    }

    var maxDepth = Math.floor(Math.log2(n));      // deepest level
    var maxSlots = Math.pow(2, maxDepth);         // nodes that row could hold
    var slot = (TREE_W - PAD_X * 2) / maxSlots;   // px available per node
    // Shrink the circles as the tree gets wide so nodes never overlap.
    var r = Math.max(9, Math.min(NODE_R_MAX, Math.floor(slot / 2) - 5));
    var rowH = maxDepth === 0 ? 0 : Math.min(86, (330 - TOP_Y) / maxDepth);

    for (var i = 0; i < n; i++) {
      var depth = Math.floor(Math.log2(i + 1));
      var first = Math.pow(2, depth) - 1;         // index of the leftmost node
      var k = i - first;                          // position within the row
      var count = Math.pow(2, depth);
      var x = PAD_X + ((k + 0.5) / count) * (TREE_W - PAD_X * 2);
      var y = TOP_Y + depth * rowH;
      positions.set(arr[i].id, { x: x, y: y, index: i });
    }

    var h = TOP_Y + maxDepth * rowH + r + 36;      // extra room for name labels
    return {
      w: TREE_W, h: h, r: r, positions: positions,
      maxDepth: maxDepth, rowH: rowH,
    };
  }

  /* ------------------------------------------------------------------------
     2. Building one node
     ------------------------------------------------------------------------ */

  /** Create one tree node: ring + coloured circle + level number + name + index. */
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

    // The array index, so the tree and the array chips can be read together.
    var idx = document.createElementNS(SVG_NS, 'text');
    idx.setAttribute('class', 'idx');
    idx.setAttribute('y', String(r + 27));
    idx.textContent = '#0';

    g.appendChild(ring);
    g.appendChild(dot);
    g.appendChild(lvl);
    g.appendChild(name);
    g.appendChild(idx);
    return g;
  }

  /* ------------------------------------------------------------------------
     3. Faint depth guides behind the tree
     ------------------------------------------------------------------------ */

  function drawGuides(layout) {
    var layer = t.guideLayer;
    if (!layer) return;
    layer.textContent = '';

    if (!layout.positions.size) return;

    for (var d = 0; d <= layout.maxDepth; d++) {
      var y = TOP_Y + d * layout.rowH;
      var line = document.createElementNS(SVG_NS, 'line');
      line.setAttribute('class', 'guide' + (d % 2 ? ' guide--odd' : ''));
      line.setAttribute('x1', String(PAD_X * 0.4));
      line.setAttribute('x2', String(TREE_W - PAD_X * 0.4));
      line.setAttribute('y1', y.toFixed(2));
      line.setAttribute('y2', y.toFixed(2));
      layer.appendChild(line);

      var label = document.createElementNS(SVG_NS, 'text');
      label.setAttribute('class', 'guide-label');
      label.setAttribute('x', '7');
      label.setAttribute('y', (y + 3).toFixed(2));
      label.textContent = 'd' + d;
      layer.appendChild(label);
    }
  }

  /* ------------------------------------------------------------------------
     4. Moving nodes (with a tiny easing animation)
     ------------------------------------------------------------------------ */

  /** Move every node to its target position (instantly or animated). */
  function moveNodesTo(layout, duration) {
    if (t.raf) { cancelAnimationFrame(t.raf); t.raf = null; }

    var targets = layout.positions;
    var dur = reduceMotion ? 0 : duration;

    function setPos(id, x, y) {
      t.pos.set(id, { x: x, y: y });
      var g = t.nodes.get(id);
      if (g) g.setAttribute('transform', 'translate(' + x.toFixed(2) + ' ' + y.toFixed(2) + ')');
    }

    if (dur <= 0) {
      targets.forEach(function (target, id) { setPos(id, target.x, target.y); });
      syncEdges();
      return;
    }

    // Snapshot where each node is NOW (mid-flight nodes start from there).
    var from = new Map();
    targets.forEach(function (target, id) {
      var cur = t.pos.get(id);
      from.set(id, cur ? { x: cur.x, y: cur.y } : { x: target.x, y: target.y });
    });

    var startTime = performance.now();
    var easeOut = function (x) { return 1 - Math.pow(1 - x, 3); };

    function frame(now) {
      var progress = Math.min(1, (now - startTime) / dur);
      var k = easeOut(progress);
      targets.forEach(function (target, id) {
        var f = from.get(id);
        setPos(id, f.x + (target.x - f.x) * k, f.y + (target.y - f.y) * k);
      });
      syncEdges();
      if (progress < 1) {
        t.raf = requestAnimationFrame(frame);
      } else {
        t.raf = null;
        targets.forEach(function (target, id) { setPos(id, target.x, target.y); });
        syncEdges();
      }
    }
    t.raf = requestAnimationFrame(frame);
  }

  /* ------------------------------------------------------------------------
     5. Edges + the NEXT tag
     ------------------------------------------------------------------------ */

  /**
   * Redraw every edge from the CURRENT animated node positions.
   * Lines are trimmed at both ends so they never poke through the circles,
   * and the "NEXT" tag always follows the node at index 0.
   */
  function syncEdges() {
    var pad = (t.r || NODE_R_MAX) + 6;   // stay outside the highlight ring
    var root = t.rootId ? t.pos.get(t.rootId) : null;

    for (var i = 0; i < t.edges.length; i++) {
      var e = t.edges[i];
      var parent = t.pos.get(e.parentId);
      var child = t.pos.get(e.childId);
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

    if (t.rootTag) {
      if (!root) {
        t.rootTag.setAttribute('visibility', 'hidden');
      } else {
        t.rootTag.setAttribute('visibility', 'visible');
        t.rootTag.setAttribute('x', root.x.toFixed(2));
        t.rootTag.setAttribute('y', (root.y - pad - 4).toFixed(2));
      }
    }
  }

  /* ------------------------------------------------------------------------
     6. Public API
     ------------------------------------------------------------------------ */

  /** Find the SVG layers and create the persistent helpers. */
  function init() {
    t.svg = document.getElementById('heapSvg');
    t.guideLayer = document.getElementById('guideLayer');
    t.edgeLayer = document.getElementById('edgeLayer');
    t.nodeLayer = document.getElementById('nodeLayer');

    // Small label above the root: the patient who will be treated next.
    t.rootTag = document.createElementNS(SVG_NS, 'text');
    t.rootTag.setAttribute('class', 'root-tag');
    t.rootTag.setAttribute('visibility', 'hidden');
    t.rootTag.textContent = 'NEXT';
    t.nodeLayer.appendChild(t.rootTag);
  }

  /**
   * Draw / update the tree for `arr`.
   * @param {Array} arr the array to draw (replayed or final state)
   * @param {number} duration ms of travel for nodes that changed place
   */
  function render(arr, duration) {
    var layout = computeLayout(arr);
    t.r = layout.r;
    t.rootId = arr.length > 0 ? arr[0].id : null;
    t.svg.setAttribute('viewBox', '0 0 ' + layout.w + ' ' + layout.h);

    drawGuides(layout);

    // 1. remove nodes that are no longer in the heap
    t.nodes.forEach(function (g, id) {
      if (!layout.positions.has(id)) {
        g.remove();
        t.nodes.delete(id);
        t.pos.delete(id);
      }
    });

    // 2. create nodes for brand-new patients (fade in)
    arr.forEach(function (p) {
      if (t.nodes.has(p.id)) return;
      var g = createNodeGroup(p, layout.r);
      if (t.newIds.has(p.id)) {
        g.classList.add('is-new');
        t.newIds.delete(p.id);
      }
      t.nodeLayer.appendChild(g);
      t.nodes.set(p.id, g);
      t.pos.set(p.id, layout.positions.get(p.id));
    });

    // 3. keep radius / labels / highlight rings in sync with the tree width
    t.nodes.forEach(function (g, id) {
      var target = layout.positions.get(id);
      if (!target) return;
      g.querySelector('.dot').setAttribute('r', layout.r);
      g.querySelector('.ring').setAttribute('r', layout.r + 6);
      g.querySelector('.lvl').setAttribute('font-size', String(Math.max(10, Math.min(13, layout.r))));

      var name = g.querySelector('.name');
      name.setAttribute('y', String(layout.r + 15));
      name.setAttribute('font-size', layout.r < 14 ? '9' : '10.5');

      var idx = g.querySelector('.idx');
      idx.setAttribute('y', String(layout.r + 27));
      idx.setAttribute('font-size', layout.r < 14 ? '7.5' : '8.5');
      idx.textContent = '#' + target.index;

      g.classList.toggle('is-highlight', t.highlight.has(id));
    });

    // 4. rebuild the edges (parents shift around as the array changes)
    t.edgeLayer.textContent = '';
    t.edges = [];
    for (var i = 1; i < arr.length; i++) {
      var parent = arr[Math.floor((i - 1) / 2)];
      var line = document.createElementNS(SVG_NS, 'line');
      // The edge inherits the CHILD's triage colour, so the graph stays readable.
      line.setAttribute('class', 'edge lv' + arr[i].level);
      t.edgeLayer.appendChild(line);
      t.edges.push({ line: line, parentId: parent.id, childId: arr[i].id });
    }

    moveNodesTo(layout, duration || 0);

    // Keep the "NEXT" tag drawn above the nodes.
    if (t.rootTag) t.nodeLayer.appendChild(t.rootTag);
  }

  /** Redraw the highlight rings without moving anything. */
  function refreshHighlight() {
    t.nodes.forEach(function (g, id) {
      g.classList.toggle('is-highlight', t.highlight.has(id));
    });
  }

  global.HeapTree = {
    init: init,
    render: render,
    highlight: t.highlight,
    markNew: function (id) { t.newIds.add(id); },
    clearHighlight: function () { t.highlight.clear(); refreshHighlight(); },
    refreshHighlight: refreshHighlight,
  };
})(window);
