/**
 * ============================================================================
 *  heap.js — Min-Heap priority queue for the "PulseHeap" project
 * ============================================================================
 *  This file contains ONLY the data structure. No DOM, no framework, no
 *  library — just a plain JavaScript array used as a binary heap.
 *
 *  The heap stores emergency patients ordered by priority:
 *
 *      Rule 1 : the LOWER triage level wins (1 = Critical ... 5 = Non-urgent)
 *      Rule 2 : if the levels are equal, the patient who ARRIVED FIRST wins.
 *               An incrementing counter (`seq`) is stamped onto every patient
 *               at insert time and is used as the tie-breaker.
 *
 *  Array layout of a complete binary tree (0-based indexes):
 *
 *        parent(i) = Math.floor((i - 1) / 2)
 *        left(i)   = 2 * i + 1
 *        right(i)  = 2 * i + 2
 *
 *  Time complexity (n = number of patients currently in the heap):
 *
 *      peek()        O(1)     — only looks at index 0
 *      insert()      O(log n) — one bubble-up along a root-to-leaf path
 *      extractMin()  O(log n) — one sink-down along a root-to-leaf path
 *      heapifyUp()   O(log n) — the tree is at most ⌊log2 n⌋ levels deep
 *      heapifyDown() O(log n) — the tree is at most ⌊log2 n⌋ levels deep
 *      size()        O(1)     — just reads array.length
 *
 *  Every mutating function returns a LIST OF STEPS so the UI (app.js) can
 *  replay the operation and animate each comparison / swap. Step types:
 *
 *      { type: 'compare',     i, j, message }  highlight two nodes (no move)
 *      { type: 'swap',        i, j, message }  exchange the nodes at i and j
 *      { type: 'insert',      index, value, message }   push a new node
 *      { type: 'remove-root', removed, moved, message } take the root, then
 *                                                        move the last node up
 * ============================================================================
 */

/**
 * Compare two patients and return:
 *   < 0  → patient `a` should be treated FIRST (higher priority)
 *   > 0  → patient `b` should be treated first
 *   = 0  → identical priority (should not happen: `seq` is unique)
 *
 * Rule 1: smaller triage level = more urgent.
 * Rule 2: same level → smaller arrival counter (earlier) wins.
 *
 * Time complexity: O(1) — a single comparison.
 */
function comparePatients(a, b) {
  if (a.level !== b.level) {
    return a.level - b.level; // 1 (critical) sorts before 5 (non-urgent)
  }
  return a.seq - b.seq; // tie-break: arrival order
}

/**
 * Return a new array sorted by priority (highest priority first).
 * Used by the waiting-list panel to show the order the heap would serve.
 * Time complexity: O(n log n) — it is only a display helper, not part of
 * the heap itself.
 */
function sortPatients(list) {
  return list.slice().sort(comparePatients);
}

/**
 * ---------------------------------------------------------------------------
 *  MinHeap — a hand-written binary min-heap (priority queue)
 * ---------------------------------------------------------------------------
 *  `this.heap` is an array that mirrors a complete binary tree:
 *
 *              1 (index 0)            ← root = highest priority patient
 *            /   \
 *          2       3
 *         / \     /
 *        4   5   6
 *
 *  The smallest element (most urgent patient) is always at index 0, so the
 *  heap can serve the next patient in O(1) with peek() / O(log n) with
 *  extractMin().
 * ---------------------------------------------------------------------------
 */
class MinHeap {
  constructor() {
    /** @type {Array<object>} the heap array (the tree, stored flat) */
    this.heap = [];

    /**
     * Incrementing arrival counter used to break priority ties.
     * The heap OWNS this counter: every insert() stamps the next value
     * onto the patient as `patient.seq`.
     * @type {number}
     */
    this.counter = 0;
  }

  /**
   * Number of patients currently in the heap.
   * Time complexity: O(1).
   * @returns {number}
   */
  size() {
    return this.heap.length;
  }

  /**
   * Look at the most urgent patient WITHOUT removing her.
   * Time complexity: O(1) — the root is always index 0.
   * @returns {object|null} the patient, or null when the heap is empty
   */
  peek() {
    return this.heap.length === 0 ? null : this.heap[0];
  }

  /**
   * Insert a new patient into the heap.
   *
   * Steps:
   *   1. stamp the arrival counter (`seq`) used for tie-breaking
   *   2. append the patient at the next free leaf slot (end of the array)
   *   3. bubble it up with heapifyUp() until the heap property holds
   *
   * Time complexity: O(log n) — at most one swap per level of the tree.
   *
   * @param {object} patient { id, name, age, condition, level, arrivalTime }
   * @returns {Array<object>} the list of steps for the UI to animate
   */
  insert(patient) {
    // Tie-break rule: arrival order. The counter never repeats, so two
    // patients with the same triage level keep a stable, fair order.
    patient.seq = ++this.counter;

    this.heap.push(patient);
    const index = this.heap.length - 1;

    const steps = [
      {
        type: 'insert',
        index: index,
        value: patient,
        message:
          'Inserted ' + patient.name + ' (level ' + patient.level +
          ') at index ' + index,
      },
    ];

    // Bubble the new leaf towards the root — O(log n)
    return steps.concat(this.heapifyUp(index));
  }

  /**
   * Remove and return the MOST URGENT patient (the root).
   *
   * Steps:
   *   1. save the root (index 0)
   *   2. move the LAST array element into the root slot (fill the hole)
   *   3. sink the new root down with heapifyDown() until the heap holds
   *
   * Time complexity: O(log n) — at most one swap per level of the tree.
   *
   * @returns {{patient: object|null, steps: Array<object>}}
   */
  extractMin() {
    if (this.heap.length === 0) {
      // Edge case: treating an empty queue. The UI checks this too, but the
      // data structure guards itself so it can never throw.
      return { patient: null, steps: [] };
    }

    const removed = this.heap[0];
    const steps = [];

    if (this.heap.length === 1) {
      // Only one patient: after removing it the heap is simply empty.
      this.heap.pop();
      steps.push({
        type: 'remove-root',
        removed: removed,
        moved: null,
        message: 'Removed ' + removed.name + ' — the heap is now empty',
      });
      return { patient: removed, steps: steps };
    }

    // Move the last node into the root slot, then sink it down.
    const last = this.heap.pop();
    this.heap[0] = last;

    steps.push({
      type: 'remove-root',
      removed: removed,
      moved: last,
      message:
        'Removed ' + removed.name + ' (level ' + removed.level +
        ') — moved last node ' + last.name + ' (level ' + last.level +
        ') to the root',
    });

    // Sink the new root — O(log n)
    steps.push.apply(steps, this.heapifyDown(0));
    return { patient: removed, steps: steps };
  }

  /**
   * ---------------------------------------------------------------------------
   *  heapifyUp — restore the heap property by moving a node UP the tree
   * ---------------------------------------------------------------------------
   *  Called after an insert. While the node has a HIGHER priority than its
   *  parent (i.e. a smaller level, or an earlier arrival), it swaps places
   *  with the parent and continues one level higher.
   *
   *  Terminates when: the node reaches the root, OR its parent already has
   *  higher-or-equal priority (heap property restored).
   *
   *  Time complexity: O(log n) — at most one swap per tree level.
   *
   *  @param {number} startIndex index of the node to bubble up
   *  @returns {Array<object>} every compare/swap step made along the way
   * ---------------------------------------------------------------------------
   */
  heapifyUp(startIndex) {
    const steps = [];
    let child = startIndex;

    // Keep climbing while we are not at the root.
    while (child > 0) {
      const parent = Math.floor((child - 1) / 2);
      const childPatient = this.heap[child];
      const parentPatient = this.heap[parent];
      const order = comparePatients(childPatient, parentPatient);

      if (order >= 0) {
        // The parent already has higher (or equal) priority → stop bubbling.
        steps.push({
          type: 'compare',
          i: child,
          j: parent,
          message:
            'Level ' + childPatient.level + ' does not beat parent level ' +
            parentPatient.level + ' — stop bubbling',
        });
        break;
      }

      // The child is more urgent than the parent → report the check, then swap.
      steps.push({
        type: 'compare',
        i: child,
        j: parent,
        message:
          'Comparing level ' + childPatient.level + ' with parent level ' +
          parentPatient.level + ' — bubble up',
      });

      // --- the actual swap (two array writes) ---
      this.heap[child] = parentPatient;
      this.heap[parent] = childPatient;

      steps.push({
        type: 'swap',
        i: child,
        j: parent,
        message:
          'Swapped ' + childPatient.level + ' with parent ' +
          parentPatient.level + ' (' + childPatient.name + ' ↑ / ' +
          parentPatient.name + ' ↓)',
      });

      child = parent; // continue one level higher
    }

    return steps;
  }

  /**
   * ---------------------------------------------------------------------------
   *  heapifyDown — restore the heap property by moving a node DOWN the tree
   * ---------------------------------------------------------------------------
   *  Called after extractMin() puts the last node at the root. While the node
   *  is LESS urgent than its smaller child, it swaps with that child and
   *  continues one level lower.
   *
   *  Terminates when: the node has no children, OR both children already have
   *  higher-or-equal priority (heap property restored).
   *
   *  Time complexity: O(log n) — at most one swap per tree level.
   *
   *  @param {number} startIndex index of the node to sink down (usually 0)
   *  @returns {Array<object>} every compare/swap step made along the way
   * ---------------------------------------------------------------------------
   */
  heapifyDown(startIndex) {
    const steps = [];
    const n = this.heap.length;
    let parent = startIndex;

    // Each iteration sinks one level, so the loop always terminates.
    while (true) {
      const left = 2 * parent + 1;
      const right = 2 * parent + 2;
      let smallest = parent; // assume the parent is already the smallest

      // --- check the LEFT child ---
      if (left < n) {
        const cmp = comparePatients(this.heap[left], this.heap[smallest]);
        steps.push({
          type: 'compare',
          i: parent,
          j: left,
          message:
            cmp < 0
              ? 'Level ' + this.heap[left].level +
                ' (left child) beats level ' + this.heap[smallest].level
              : 'Left child level ' + this.heap[left].level +
                ' does not beat level ' + this.heap[smallest].level,
        });
        if (cmp < 0) smallest = left;
      }

      // --- check the RIGHT child (against the current smallest) ---
      if (right < n) {
        const cmp = comparePatients(this.heap[right], this.heap[smallest]);
        steps.push({
          type: 'compare',
          i: parent,
          j: right,
          message:
            cmp < 0
              ? 'Level ' + this.heap[right].level +
                ' (right child) beats level ' + this.heap[smallest].level
              : 'Right child level ' + this.heap[right].level +
                ' does not beat level ' + this.heap[smallest].level,
        });
        if (cmp < 0) smallest = right;
      }

      // --- done? ---
      if (smallest === parent) {
        if (left >= n && right >= n) {
          // No children at all → nothing left to check.
          steps.push({
            type: 'compare',
            i: parent,
            j: parent,
            message: 'Node has no children — heap property restored',
          });
        }
        break; // parent is the smallest here → stop sinking
      }

      // --- the actual swap (two array writes) ---
      const parentNode = this.heap[parent];
      const childNode = this.heap[smallest];
      this.heap[parent] = childNode;
      this.heap[smallest] = parentNode;

      steps.push({
        type: 'swap',
        i: parent,
        j: smallest,
        message:
          'Swapped ' + parentNode.level + ' with ' + childNode.level +
          ' ' + (smallest === left ? 'left' : 'right') + ' child (' +
          parentNode.name + ' ↓ / ' + childNode.name + ' ↑)',
      });

      parent = smallest; // continue one level lower
    }

    return steps;
  }

  /**
   * Copy of the heap array (in tree order, NOT sorted).
   * The UI renders the tree/array view from this copy.
   * Time complexity: O(n).
   * @returns {Array<object>}
   */
  toArray() {
    return this.heap.slice();
  }

  /**
   * Empty the heap. The arrival counter is deliberately NOT reset so that
   * `seq` values (and therefore tie-breaks) never repeat.
   * Time complexity: O(1).
   */
  clear() {
    this.heap.length = 0;
  }
}

// ---------------------------------------------------------------------------
// Export for Node.js unit tests (heap.test.js). In the browser these globals
// are simply available to app.js because the file is loaded with <script>.
// ---------------------------------------------------------------------------
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { MinHeap, comparePatients, sortPatients };
}
