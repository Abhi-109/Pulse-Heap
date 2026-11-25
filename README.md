# PulseHeap

**Hospital Emergency Patient Prioritization Using Heaps** — a Data Structures &
Algorithms college project.

A single-page website that registers emergency-room patients, keeps them in a
hand-written **min-heap priority queue**, and serves the most urgent patient
first. The binary heap is drawn as an animated SVG tree so you can *see* every
comparison and swap as it happens.

---

## How to run

No build step, no server, no libraries — just open the file:

1. Double-click **`index.html`** (or drag it into any modern browser).
2. Press **Load demo patients** to add 10 sample patients, or fill in the
   registration form.
3. Press **Treat next** to send the most urgent patient to the treated log and
   watch the heap re-arrange itself.

> Works offline from `file://` in Chrome, Edge, Firefox and Safari.

### Run the unit tests and the terminal dry-run (optional, needs Node.js)

```
node heap.test.js        → 22 assertions covering insert, extract, tie-breaks
node tools/dry-run.js    → prints every heap step in the terminal
```

The dry-run uses the same `heap.js` as the page, so it is a good way to explain
the algorithm without a browser (or to see what the animation will do).

---

## Files

| File | What it contains |
|---|---|
| `index.html` | Page structure: header, stat strip, toolbar, three panels, explainer |
| `style.css` | All styling, including the dark theme, print and contrast rules |
| `heap.js` | **The data structure only** — `MinHeap` class, no DOM code |
| `tree.js` | **The drawing only** — draws an array as an SVG binary tree |
| `app.js` | **The page** — form validation, panels, step replay, animation |
| `heap.test.js` | Console tests for `heap.js` (run with `node heap.test.js`) |
| `tools/dry-run.js` | Terminal demo that prints every step of the heap |
| `static/logo.svg` | Header logo — a 3-node heap above a heartbeat line |
| `static/favicon.svg` | Tab icon — the logo simplified for 16×16 / 32×32 |
| `README.md` | This file |
| `SRS.md` | Software Requirements Specification — requirement IDs, data rules, design, traceability, demo script |

All scripts are plain `<script>` files (no modules), so the page also runs
directly from the file system.

---

## Tech stack in one minute

There is no framework, no package manager, no build step and no server. A
browser already knows how to run all three languages used here:

| Layer | Language | Plain-English job | In this project |
|---|---|---|---|
| Structure | HTML | The skeleton — what is on the page | `index.html` |
| Style | CSS | The paint — colours, spacing, motion | `style.css` |
| Behaviour | JavaScript | The brain — data and updates | `heap.js`, `tree.js`, `app.js` |

Why this is enough for the project:

- **The algorithm needs no library.** A heap is just an array plus two loops,
  so hand-writing it is shorter than learning a dependency.
- **The drawing is plain SVG.** Browsers can draw circles and lines natively;
  `tree.js` creates those elements and moves them — no charting library.
- **Everything runs offline.** Double-click `index.html`; nothing to install,
  nothing to compile, nothing to deploy.

If you had to explain it in one sentence: *“It is a static web page: HTML for
the layout, CSS for the look, and plain JavaScript for the min-heap and the
animation.”*

---

## The heap logic (`heap.js`)

### Priority rule

Each patient holds `{ id, name, age, condition, level, arrivalTime, seq }`.

1. **Lower triage level wins** — `1 = Critical` … `5 = Non-urgent`.
2. **Tie-break by arrival order** — every `insert()` stamps the patient with
   `seq = ++counter`, so among equal levels the patient who arrived first is
   treated first. The counter lives inside the heap and never repeats.

The comparison is one function, used everywhere:

```js
function comparePatients(a, b) {
  if (a.level !== b.level) return a.level - b.level; // more urgent first
  return a.seq - b.seq;                              // earlier arrival first
}
```

### Array representation

The tree is stored flat in an array; index `i`'s relatives are pure arithmetic:

```
parent(i) = floor((i - 1) / 2)      left(i) = 2*i + 1      right(i) = 2*i + 2

                1 (index 0)                  ← root = most urgent patient
              /   \
            2       3
           / \     /
          4   5   6
```

### The five functions

| Function | What it does | Complexity |
|---|---|---|
| `insert(p)` | append at the next free slot, then `heapifyUp` | **O(log n)** |
| `extractMin()` | save root, move last node into the root, then `heapifyDown` | **O(log n)** |
| `peek()` | return `heap[0]` without removing it | **O(1)** |
| `heapifyUp(i)` | while node `i` beats its parent → swap, move up | **O(log n)** |
| `heapifyDown(i)` | while node `i` is beaten by its smaller child → swap, move down | **O(log n)** |
| `size()` | returns `heap.length` | **O(1)** |

Why O(log n)? The array always represents a *complete* binary tree, so its
height is `⌊log2 n⌋`. A bubble-up or sink-down visits at most one node per
level, i.e. at most `⌊log2 n⌋` swaps.

### Animated steps

`insert()` and `extractMin()` return a **list of steps** instead of just a
result, so the UI can replay the operation:

```js
{ type: 'insert',      index, value, message }   // "Inserted Maria (level 1) at index 0"
{ type: 'remove-root', removed, moved, message } // "Removed X … moved last node Y to the root"
{ type: 'compare',     i, j, message }           // highlight two nodes, nothing moves
{ type: 'swap',        i, j, message }           // "Swapped 2 with parent 4 (… ↑ / … ↓)"
```

`app.js` keeps a snapshot of the array from *before* the operation, applies the
steps one at a time to that snapshot, and redraws the tree after each one —
which is exactly what you see animating.

---

## Features

### Simulating the emergency room

- **Register patient** — validated form (name 2–40 chars, age 0–120, condition,
  triage level 1–5). Duplicate names are allowed; every patient gets a unique ID.
- **Waiting list** — cards sorted by priority with rank, arrival time and a
  live waiting-time counter. A new patient's card **rises from the bottom to its
  rank** and the other cards slide down, so the reordering is visible rather than
  instant. **Treat next** pops the root and appends the patient to the
  **Treated history** with their waiting time.
- **Change a level in place** — every card carries a small level picker. Change
  it and the heap re-heapifies before your eyes (the tree glides into place).
- **Filter** — search by name, ID or condition; the count shows `visible / total`.
- **Heap view** — the heap drawn as an SVG tree with faint depth guides (`d0`,
  `d1`, …) and each node's **array index**. New nodes fade in and bubble up, the
  last node travels to the root and sinks down, and the **array form** is shown
  underneath with the active indices highlighted.
- **Load demo patients** — 10 sample patients whose *arrival* order differs from
  their *priority* order (a level-5 sprain arrives first), so…
- **Compare with FIFO** — shows the priority order next to plain arrival order.
- **Step-by-step mode** + **step scrubber** — pause every operation, then either
  press **Next step** or drag the slider to jump to any step. The text line
  describes each comparison and swap.
- **Animation speed** slider (0.5× – 2.5×) and a complexity badge
  (`insert O(log n)`, `remove O(log n)`, `peek O(1)`).

### Explaining itself

- **Stat strip** — patients waiting, patients at level 1, patients treated, and
  the total **comparisons / swaps** the heap has done, plus a live **triage
  distribution bar**.
- **Heap-property badge** — `✓ min-heap holds` updates after every step, so you
  can watch it flip to `⚠ order broken` while a removal is mid-sink and then
  heal. That is the algorithm proving itself.
- **Guided tour** (`Take the tour` or <kbd>?</kbd>) — four short coach marks
  pointing at the form, the waiting list, the heap and the demo button.
- **“How this page works”** section — the stack, the idea, the click-to-animation
  flow, glossary tooltips and a **heap vs sorted-array cost table**.
- **README walkthrough** below for teammates and viva questions.

### Quality of life

- **Undo** — one click (or <kbd>U</kbd>) steps back through the last 30 actions,
  including level changes, demo loads and “Clear all”.
- **Export CSV** — downloads every waiting and treated patient with level,
  condition, arrival and waiting time (opens in Excel/Sheets).
- **Remembers your session** — patients, counters, theme, speed and modes are
  stored in `localStorage`, so a refresh does not lose the demo.
- **Dark mode** — the header switch recolours the whole page and is remembered.
- **Keyboard shortcuts** — <kbd>D</kbd> demo, <kbd>T</kbd> treat, <kbd>U</kbd>
  undo, <kbd>E</kbd> export, <kbd>F</kbd> FIFO, <kbd>S</kbd> step mode,
  <kbd>/</kbd> search, <kbd>?</kbd> tour.
- **Print styles** — printing gives a clean snapshot of the panels without the
  toolbar or the tour.
- **Accessibility** — ARIA list roles on the waiting/treated lists, a live
  status region, visible focus styles, focus returned to the right control after
  an operation, `prefers-reduced-motion` support and a `prefers-contrast` mode.
- Responsive down to mobile width, and no console errors.

### Edge cases handled

- **Treat while empty** → friendly message *"No patients waiting — nothing to
  treat."*, never a crash (`extractMin()` also guards itself).
- **Duplicate names** → allowed on purpose; unique IDs (`P1, P2 …`) keep the
  cards distinguishable.
- **Extracting the only patient**, **inserting into an empty heap**, and
  **level ties** (resolved by arrival order) are all unit-tested.
- **Blocked storage** (private mode, some `file://` setups) → the page still
  works, it just forgets between visits.

---

## Explain the code in plain English

### The files, one job each

```
index.html   →  the page skeleton (nothing clever)
style.css    →  how it looks (colours, spacing, animation styles)
heap.js      →  the data structure      (knows nothing about the page)
tree.js      →  the drawing             (knows nothing about the heap rules)
app.js       →  the page                (knows nothing about how a heap works)
```

The split is the key idea: **business logic, drawing and presentation never
mix.** `heap.js` could be reused in a terminal program (`tools/dry-run.js`
does exactly that), `tree.js` could draw any array-based tree, and `app.js`
could drive any other data structure.

### What a min-heap is, without jargon

Imagine a hospital queue where the sickest patient is always first. Instead of
re-sorting the whole queue when someone arrives, you put them at the end and let
them “walk forward” past anyone less urgent. Removing the sickest works in
reverse: the last patient steps into the front spot and “walks back” until they
are in the right place.

That walk is the whole algorithm — one path from a leaf to the root (or back),
which is at most `log2 n` steps. That is why the cost is `O(log n)` and not
`O(n)` or `O(n log n)`.

The tree is stored in a flat array; the family links are arithmetic:

```
parent(i) = floor((i - 1) / 2)      left(i) = 2*i + 1      right(i) = 2*i + 2
```

### How one registration travels through the code

1. **`index.html`** — the user fills the form and presses *Register*.
2. **`app.js · validateForm()`** — checks the fields and builds
   `{ name, age, condition, level, arrivalTime }`.
3. **`app.js · startInsert()`** — pushes an undo snapshot, takes a snapshot of
   the current array, then calls **`heap.js · insert()`**.
4. **`insert()`** — appends the patient, stamps `seq` for the tie-break, bubbles
   up, and **returns a list of steps** (`insert`, `compare`, `swap`) with a
   readable message for each one.
5. **`app.js · startOperation()`** — replays those steps on the snapshot, one at
   a time, redrawing the tree (`tree.js`), the array chips and the waiting list.
6. **`finishOperation()`** — adopts the real heap array (`heap.toArray()`),
   updates the counters, saves the session and unlocks the buttons.

**Treat next** is the same pipeline with `extractMin()` (a `remove-root` step,
then `compare`/`swap` steps going down). **Load demo**, **Clear all**, **Undo**
and **level changes** skip the animation because they are bulk setup, not a
single operation.

### Questions people ask

**“Why is the waiting list already sorted, and why does a critical patient jump
straight to #1?”**

The waiting list is a *view*, not the heap itself: it is deliberately drawn in
priority order so you can read who is next. The heap's internal array is a
different shape — the same patients in tree order. That is why the two panels
do not match. What the tree shows is *how* the patient got to the front; the
waiting list now animates the card rising to its rank, and the other cards slide
down so the change is never silent.

**“Why does removing use the last node?”**

A complete tree must stay complete. Deleting the root would leave a hole, so we
fill it with the last leaf (the array's last element) and sink it down. The tree
keeps its shape and height, and only one path changes.

**“What breaks a tie?”**

`seq`, an arrival counter the heap owns. Same triage level → smaller `seq` wins,
so equal patients are served strictly first-come-first-served.

**“How does undo work without touching `heap.js`?”**

A snapshot is just the current array plus the treated log and the counters.
Undo clears the heap and re-inserts the snapshot in arrival order. Because the
comparator only looks at `level` and `seq`, re-inserting in arrival order
reproduces exactly the same heap.

---

## Project structure for the viva

```
index.html  ──loads──►  heap.js   (MinHeap: insert / extractMin / peek /
                                    heapifyUp / heapifyDown / size)
                    ├─►  tree.js   (array → positioned SVG nodes and edges)
                    └─►  app.js    (form → heap.insert() → steps → animation)
```

Talking points:

1. **Why a heap?** Selecting the most urgent patient from a sorted array is
   `O(n)` every time (or `O(n log n)` to keep it sorted); a binary heap gives
   `O(1)` peek and `O(log n)` insert/remove — the best all-round choice for a
   queue that is constantly changing.
2. **Why a min-heap and not a max-heap?** Level `1` (most urgent) must come
   first, so the *smallest* key is the highest priority → min-heap.
3. **Why a complete binary tree?** It lets us store the tree in an array with
   no pointers and guarantees height `⌊log2 n⌋`.
4. **Fairness:** the `seq` counter makes the queue stable — equal triage levels
   are served strictly in arrival order (no starvation).
5. **The badge is the proof:** the heap-property badge checks every parent
   against its children after every step, so the invariant is verified live.
