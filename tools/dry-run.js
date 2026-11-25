/**
 * tools/dry-run.js — run the heap in the terminal and print every step
 * ----------------------------------------------------------------------------
 * Use this when you want to explain the project without the browser, or to
 * check what the animation will show before it plays.
 *
 *   node tools/dry-run.js
 *
 * It uses the SAME heap.js the web page uses, so the output is the truth.
 */
const { MinHeap } = require('../heap.js');

function patient(name, level) {
  return { id: name, name, age: 30, condition: 'demo', level, arrivalTime: '12:00:00' };
}

function levelList(heap) {
  return '[' + heap.toArray().map((p) => p.level).join(', ') + ']';
}

const waits = new MinHeap();
const arrivals = [
  patient('Noah', 5),
  patient('Tom', 3),
  patient('Maria', 1),
  patient('Grace', 4),
  patient('Priya', 2),
];

console.log('\n=== INSERTING PATIENTS ===');
for (const p of arrivals) {
  const steps = waits.insert(p);
  console.log('\ninsert ' + p.name + ' (level ' + p.level + ')');
  for (const step of steps) console.log('   ' + step.type.padEnd(11) + step.message);
  console.log('   array  ' + levelList(waits));
}

console.log('\n=== TREATING PATIENTS (most urgent first) ===');
while (waits.size() > 0) {
  const result = waits.extractMin();
  console.log('\ntreat ' + result.patient.name + ' (level ' + result.patient.level + ')');
  for (const step of result.steps) console.log('   ' + step.type.padEnd(11) + step.message);
  console.log('   array  ' + levelList(waits));
}

console.log('\n=== TIE-BREAK: same level, earlier arrival wins ===');
const ties = new MinHeap();
['Alice', 'Bob', 'Carol'].forEach((name) => ties.insert(patient(name, 2)));
while (ties.size() > 0) console.log('   next: ' + ties.extractMin().patient.name);

console.log('\nDone. Every "insert" costs one bubble-up; every "treat" is one sink-down.\n');
