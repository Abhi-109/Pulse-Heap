/**
 * heap.test.js — quick console tests for heap.js
 * Run with:  node heap.test.js
 * (The same assertions can be pasted into the browser console.)
 */
const { MinHeap, comparePatients, sortPatients } = require('./heap.js');

let passed = 0;
let failed = 0;

function check(label, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    passed++;
    console.log('  PASS  ' + label);
  } else {
    failed++;
    console.log('  FAIL  ' + label + '\n        expected ' + e + '\n        got      ' + a);
  }
}

function patient(name, level) {
  return { id: 'P-' + name, name: name, age: 40, condition: 'Test', level: level, arrivalTime: '12:00:00' };
}

console.log('\n--- size / peek on an empty heap ---');
const empty = new MinHeap();
check('size() on empty heap is 0', empty.size(), 0);
check('peek() on empty heap is null', empty.peek(), null);
check('extractMin() on empty heap is guarded', empty.extractMin(), { patient: null, steps: [] });

console.log('\n--- insert keeps the smallest level at the root ---');
const h = new MinHeap();
const levels = [4, 2, 5, 1, 3, 3, 2];
levels.forEach((lv, i) => h.insert(patient('P' + i, lv)));
check('size() after 7 inserts', h.size(), 7);
check('root is level 1', h.peek().level, 1);
// Tree order after inserting levels [4,2,5,1,3,3,2] (verified by hand):
//                 1
//               /   \
//             2       2
//            / \     / \
//           4   3   5   3
check('array tree order', h.toArray().map((p) => p.level), [1, 2, 2, 4, 3, 5, 3]);

console.log('\n--- extractMin always returns priority order (level, then arrival) ---');
const order = [];
while (h.size()) order.push(h.extractMin().patient.level);
check('full extraction order', order, [1, 2, 2, 3, 3, 4, 5]);

console.log('\n--- tie-break by arrival order (same level → first in wins) ---');
const t = new MinHeap();
t.insert(patient('Alice', 2));
t.insert(patient('Bob', 2));
t.insert(patient('Carol', 2));
check('first out is Alice (earliest arrival)', t.extractMin().patient.name, 'Alice');
check('second out is Bob', t.extractMin().patient.name, 'Bob');

console.log('\n--- tie-break works even when the later patient sits deeper ---');
const t2 = new MinHeap();
t2.insert(patient('A', 5));
t2.insert(patient('B', 5));
t2.insert(patient('C', 5));
t2.insert(patient('D', 1)); // forces re-arrangement
t2.extractMin(); // removes D
check('order after removing D', [t2.extractMin().patient.name, t2.extractMin().patient.name], ['A', 'B']);

console.log('\n--- steps are reported for the UI to animate ---');
const s = new MinHeap();
s.insert(patient('X', 5));
const res = s.insert(patient('Y', 1)); // must bubble up to the root
check('insert returns an insert step', res[0].type, 'insert');
check('insert reports swaps', res.some((st) => st.type === 'swap'), true);
check('every step has a message', res.every((st) => typeof st.message === 'string' && st.message.length > 0), true);
check('Y is now the root', s.peek().name, 'Y');
const ex = s.extractMin();
check('extract returns patient + steps', typeof ex.patient.name, 'string');
check('extract starts with remove-root', ex.steps[0].type, 'remove-root');

console.log('\n--- helpers ---');
check('comparePatients: level wins over arrival', comparePatients({ level: 1, seq: 9 }, { level: 2, seq: 1 }), -1);
check('comparePatients: arrival breaks the tie', comparePatients({ level: 2, seq: 1 }, { level: 2, seq: 2 }), -1);
check('sortPatients does not mutate input', sortPatients([patient('A', 5), patient('B', 1)]).map((p) => p.level), [1, 5]);

console.log('\n--- single-element and repeated use ---');
const one = new MinHeap();
one.insert(patient('Solo', 3));
check('extract from size-1 heap', one.extractMin().patient.name, 'Solo');
check('heap is empty again', one.size(), 0);
one.insert(patient('Again', 2));
check('heap works after being emptied', one.peek().name, 'Again');

console.log('\n' + passed + ' passed, ' + failed + ' failed\n');
process.exit(failed ? 1 : 0);
