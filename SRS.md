# Software Requirements Specification (SRS)

## PulseHeap — Hospital Emergency Patient Prioritization Using Heaps

| Item | Detail |
|---|---|
| Document title | Software Requirements Specification for PulseHeap |
| Version | 1.0 (as-built specification) |
| Date | 24 November 2026 |
| Project type | Data Structures & Algorithms (DSA) academic project |
| Prepared by | Project team |
| Status | Implemented and verified — this document describes the software that exists in this folder |
| Reference standard | Structured after IEEE 830 / ISO/IEC/IEEE 29148 (SRS outline) |
| Intended readers | Evaluator/examiner, project guide, teammates, future maintainers |

> This is a self-contained text document. Every requirement has an ID so it can be
> quoted in a viva, a report, or a test log. Section 8 is the "what we actually
> built" inventory and Section 9 is a five-minute demo script.

---

## Table of contents

1. Introduction
2. Overall description
3. System features and functional requirements
4. External interface requirements
5. Non-functional requirements
6. Data requirements
7. System design (how the requirements are met)
8. What has been developed (delivered scope, traceability, verification)
9. Acceptance criteria and demo script
10. Known limitations and future enhancements
11. Appendices (glossary, viva questions)

---

# 1. Introduction

## 1.1 Purpose

This document specifies the requirements of **PulseHeap**, a single-page web
application that simulates an emergency department waiting room. Patients are
registered with a triage level, stored in a hand-written **binary min-heap
priority queue**, and served most-urgent-first. The heap is drawn as an animated
SVG tree so every comparison and swap is visible.

The purpose of this SRS is to:

- state exactly what the software must do, in testable terms;
- record the design constraints chosen for an academic DSA submission
  (no libraries, no build step, no server);
- provide traceability from each requirement to the file and function that
  implements it;
- give an examiner a checklist that can be executed in a few minutes.

## 1.2 Scope

**In scope (this software):**

- Register a patient through a validated form (name, age, condition, triage level).
- Maintain the waiting patients in a min-heap ordered by
  `(triage level ascending, arrival order ascending)`.
- Show the waiting list in priority order, with a visible animation when a new
  patient moves to its rank.
- Remove ("treat") the highest-priority patient and log it with its waiting time.
- Visualise the heap twice: as a tree (SVG) and as the underlying flat array.
- Explain the operation step by step: step mode, step scrubbing, live counters,
  heap-property verification, and an in-page plain-English explainer.
- Educate: guided tour, FIFO-vs-priority comparison, demo data, cost table.
- Quality-of-life: undo, CSV export, session persistence, search filter, dark
  mode, keyboard shortcuts, print styles, reduced-motion and high-contrast support.
- Developer tooling: a Node.js unit-test script and a terminal dry-run script.

**Out of scope (deliberately not built):**

- Any server, database, login, or multi-user collaboration.
- Real medical use, real patient data, or integration with hospital systems.
- Persistent storage outside the browser's `localStorage`.
- Frameworks, package managers, bundlers, CSS preprocessors, chart libraries.
- Internationalisation, analytics, advertising, or telemetry.
- Deployment configuration (the folder runs by opening `index.html`).

## 1.3 Definitions, acronyms and abbreviations

| Term | Meaning |
|---|---|
| **Heap / min-heap** | A complete binary tree stored in an array where every parent is at least as urgent as its children, so the root is the highest-priority item. |
| **Priority queue** | An abstract data type supporting "insert" and "remove the highest-priority item". A heap is one implementation. |
| **Triage level** | Severity score 1–5 used as the priority key. 1 = Critical (most urgent), 5 = Non-urgent. |
| **Root** | Index 0 of the heap array; always the next patient to be treated. |
| **heapifyUp** | Bubble a new leaf upward until its parent is at least as urgent. |
| **heapifyDown (sink)** | Push a node downward until both children are less urgent. |
| **`seq`** | Monotonic arrival counter stamped by `insert()`; breaks ties between equal triage levels. |
| **Step** | A recorded unit of work (`insert`, `remove-root`, `compare`, `swap`) returned by the heap so the UI can replay it. |
| **Replay** | Applying the step list to a snapshot of the pre-operation array, one step at a time, redrawing after each. |
| **FLIP** | Animation technique: measure First positions, apply the new layout (Last), Invert with a transform, then Play the transition. |
| **FR / NFR** | Functional requirement / non-functional requirement. |
| **SVG** | Scalable Vector Graphics — the browser-native drawing format used for the tree. |
| **SPA** | Single-page application; here, one HTML file with no routing. |
| **FIFO** | First-In-First-Out ordering — pure arrival order, used only for comparison. |
| **`localStorage`** | Browser key/value store used to remember the session. |
| **P1, P2 …** | Unique patient identifiers generated by the app. |

## 1.4 References

1. IEEE Std 830-1998, *Recommended Practice for Software Requirements Specifications*.
2. ISO/IEC/IEEE 29148:2018, *Systems and software engineering — Life cycle processes — Requirements engineering*.
3. Cormen, Leiserson, Rivest, Stein, *Introduction to Algorithms*, 3rd ed., Chapter 6 (Heapsort / priority queues).
4. Project repository files: `README.md` (plain-English walkthrough), `heap.js`,
   `tree.js`, `app.js`, `style.css`, `index.html`, `heap.test.js`, `tools/dry-run.js`.
5. MDN Web Docs: *Web Storage API*, *SVG*, *Blob*, *prefers-reduced-motion*.

## 1.5 Document conventions

- **Requirement IDs:** `FR-<feature>.<n>` for functional, `NFR-<area>.<n>` for
  non-functional, `TC-<n>` for technical constraints, `I-<n>` for invariants.
- **Priority (MoSCoW):** **M** = Must have, **S** = Should have, **C** = Could
  have. Everything marked **M** and **S** in this document is implemented;
  items marked "future" are listed in Section 10.
- "The system" means the web page as a whole. "The heap module" means `heap.js`.
- Times are written `HH:MM:SS` in the user's local time zone.

---

# 2. Overall description

## 2.1 Product perspective

PulseHeap is a **standalone, client-side, static web application**. It has no
backend and no network calls at runtime. All state lives in JavaScript memory and
is mirrored to `localStorage`. It is a teaching artefact for the min-heap data
structure, presented as a hospital triage simulator.

```
        ┌──────────────────────── Browser tab ────────────────────────┐
        │  index.html  (structure, ARIA roles, SVG canvas)            │
        │      ▲                                                      │
        │      │ DOM updates                                          │
        │  app.js  ──────────────► heap.js   (MinHeap, no DOM)         │
        │      │  ▼ steps                ▲                            │
        │      │  tree.js  (array → SVG) │  array snapshot             │
        │      ▼                         │                            │
        │  style.css (look, motion, themes)                           │
        │                                                             │
        │  localStorage "pulseheap.v1"  ◄── save() / restore()        │
        └─────────────────────────────────────────────────────────────┘
             No server · no database · no network · works offline
```

Optional developer context: `node heap.test.js` and `node tools/dry-run.js`
load the same `heap.js` outside the browser.

## 2.2 Product functions (summary)

| # | Function | One-line description |
|---|---|---|
| 1 | Register patient | Validated form inserts a patient and animates the bubble-up. |
| 2 | Priority ordering | Lower triage level first; equal levels by arrival order. |
| 3 | Waiting list | Priority-ordered cards with rank, arrival time and live wait time; a new card rises to its rank while the others glide. |
| 4 | Treat next | Extracts the root, animates the sink-down, logs the patient with waiting time. |
| 5 | Tree view | SVG binary tree with depth guides, array indices, highlight rings and a "NEXT" tag. |
| 6 | Array view | Flat array chips showing index + level + name, active indices highlighted. |
| 7 | Step control | Step-by-step mode, "Next step" button, step scrubber, descriptive text line. |
| 8 | Live metrics | Waiting / critical / treated counts, comparison and swap totals, triage distribution bar, heap-property badge. |
| 9 | Level editing | Change any waiting patient's triage level in place; the heap re-orders visibly. |
| 10 | FIFO comparison | Priority order shown beside plain arrival order. |
| 11 | Filter | Search by name, ID or condition; count becomes "visible / total". |
| 12 | Demo data | Ten sample patients whose arrival order differs from priority order. |
| 13 | Undo | Reverts the last 30 completed actions. |
| 14 | CSV export | Downloads waiting + treated patients as a spreadsheet-friendly file. |
| 15 | Session persistence | Restores patients, counters, theme, speed and modes after a refresh. |
| 16 | Guided tour | Four coach marks pointing at the form, list, heap and demo button. |
| 17 | Explanation | In-page "How this page works" section plus `README.md`; glossary tooltips; cost table. |
| 18 | Presentation options | Dark mode, print styles, animation-speed slider, keyboard shortcuts. |

## 2.3 User characteristics

| User class | Background | Needs |
|---|---|---|
| Student author | Knows basic data structures | Demonstrate correctness and complexity; explain the code. |
| Examiner / guide | DSA expert, limited time | See the invariant hold live, inspect code separation, ask complexity questions. |
| Classmate | Beginner | Understand what a heap is without jargon; try it without instructions. |

No training is required. The page is usable within seconds of opening; the tour
and the explainer section carry the teaching load.

## 2.4 Operating environment

| Aspect | Requirement |
|---|---|
| Platform | Any desktop or mobile OS with a modern browser (Windows, macOS, Linux, Android, iOS). |
| Browsers | Chrome, Edge, Firefox, Safari — current and previous major versions (needs ES5+ JavaScript, SVG, `Map`, `Set`, `requestAnimationFrame`, CSS Grid/Flexbox). |
| Launch methods | Double-click `index.html` (`file://`), or serve the folder over HTTP (`python -m http.server`). |
| Network | Not required. No external fonts, scripts, images or APIs. |
| Optional tooling | Node.js 14+ only for `node heap.test.js` and `node tools/dry-run.js`. |
| Screen sizes | 360 px mobile width up to large desktop; layout reflows at defined breakpoints. |
| Storage | `localStorage` when available; the app degrades gracefully when blocked. |

## 2.5 Design and implementation constraints

| ID | Constraint | Reason |
|---|---|---|
| TC-1 | No third-party libraries or frameworks (no React, jQuery, D3, Chart.js). | The project must demonstrate the data structure itself; a library would hide it. |
| TC-2 | No build step, bundler, transpiler or package manager; plain `<script>` tags in dependency order (`heap.js` → `tree.js` → `app.js`). | Must run by double-clicking a file, including offline and on a lab PC. |
| TC-3 | No server, backend, database or network request at runtime. | Portability and zero setup; also avoids storing health-like data off-device. |
| TC-4 | `heap.js` must contain no DOM access, and `tree.js` no heap rules; only `app.js` may touch the page. | Separation of concerns; allows reuse (terminal dry-run) and easy explanation. |
| TC-5 | Persistence limited to `localStorage` under one key, versioned (`v: 1`). | No dependencies; corrupted/old data must be ignorable. |
| TC-6 | Single HTML page, no routing, no hash navigation. | Keeps the mental model simple for a demo. |
| TC-7 | All user-supplied text must be escaped before insertion into HTML. | Prevents broken markup and script injection through patient names. |
| TC-8 | Animation must be cancellable/skippable and respect `prefers-reduced-motion`. | Accessibility and demo time control. |

## 2.6 Assumptions and dependencies

- **A-1** The user opens the page in a browser with JavaScript enabled.
- **A-2** The browser supports SVG and CSS transitions (all targeted browsers do).
- **A-3** `localStorage` may be unavailable (private mode, some `file://` setups);
  the app then works without memory between visits. This is accepted, not an error.
- **A-4** System clock is correct; waiting times are derived from it.
- **A-5** A single user works in one tab at a time (no cross-tab synchronisation).
- **A-6** Patient data entered is fictitious; the app is a simulation, not a medical device.

---

# 3. System features and functional requirements

Each feature lists its behaviour (stimulus → response), its requirements, and its
acceptance criteria. "UI" means `app.js`; "heap" means `heap.js`.

## 3.1 F1 — Patient registration

**Description.** A visitor fills the registration form; the system validates it,
creates a patient, inserts it into the heap, and animates the bubble-up.

| ID | Requirement | Pri |
|---|---|---|
| FR-1.1 | The system shall provide a form with: patient name, age, condition, triage level (radio buttons 1–5). | M |
| FR-1.2 | Name shall be trimmed and must match `^[A-Za-z][A-Za-z' .-]{1,39}$` (2–40 characters). | M |
| FR-1.3 | Age shall be required, a whole number, 0 ≤ age ≤ 120. | M |
| FR-1.4 | Condition shall be trimmed and 2–60 characters; a `datalist` of common conditions shall be offered. | S |
| FR-1.5 | Exactly one triage level 1–5 shall be required; none selected is an error. | M |
| FR-1.6 | On invalid input, the system shall show a message under each offending field, mark the field with `aria-invalid`, move focus to the first invalid field, and announce a summary in the live status region. | M |
| FR-1.7 | On valid input, the system shall create `{ id, name, age, condition, level, arrivalTime, arrivalTs }`, insert it, clear the form and its errors. | M |
| FR-1.8 | Each patient shall receive a unique ID of the form `P<n>`, incrementing per session; duplicate names are permitted. | M |
| FR-1.9 | The system shall ignore submit events while an operation is animating. | M |

**Acceptance:** submitting an empty form highlights name, age, condition and
level; entering `Maria / 67 / Chest pain / level 1` registers `P<n>` and the card
appears at rank 1.

## 3.2 F2 — Priority ordering and the waiting list

| ID | Requirement | Pri |
|---|---|---|
| FR-2.1 | Ordering key: lower `level` first; if levels are equal, smaller `seq` (earlier arrival) first. | M |
| FR-2.2 | `insert()` shall stamp `seq = ++counter` and the counter shall never repeat, even after `clear()`. | M |
| FR-2.3 | The waiting list shall always be displayed in priority order with rank `#1`, `#2`, … | M |
| FR-2.4 | Each card shall show triage chip, name, ID, age, condition, arrival time, rank, a live waiting time and a level picker. | M |
| FR-2.5 | Waiting times shall refresh every second without re-rendering the list. | S |
| FR-2.6 | When a new patient is registered, its card shall **rise from the bottom of the list to its rank**, and cards whose rank changed shall glide from their old position to the new one. | M |
| FR-2.7 | If the list order did not change, the list shall not be rebuilt (so a running animation is never restarted). | S |
| FR-2.8 | With reduced motion or FIFO mode active, the rise animation shall be skipped and the final order shown immediately. | S |
| FR-2.9 | An empty list shall show a friendly empty state; a filter with no match shall show a “no match” state naming the term. | S |

**Acceptance:** with 10 demo patients, registering a level-1 patient plays a
rise animation (`card--arriving`, `--travel ≈ 300 px`) and lands at `#1`; no
other card jumps without motion.

## 3.3 F3 — Treat next (extract the root)

| ID | Requirement | Pri |
|---|---|---|
| FR-3.1 | "Treat next" shall remove the root patient and animate the process: the last node moves to the root, then sinks down. | M |
| FR-3.2 | The treated patient shall be appended to the treated history with the waiting duration and the treatment clock time; the history shall show newest first. | M |
| FR-3.3 | Treating an empty queue shall not throw; it shall announce "No patients waiting — nothing to treat." | M |
| FR-3.4 | A single-element heap shall become empty after one extraction. | M |
| FR-3.5 | The treated history shall have its own count and empty state. | S |

## 3.4 F4 — Heap visualisation

| ID | Requirement | Pri |
|---|---|---|
| FR-4.1 | The heap shall be drawn as a binary tree in SVG using the array layout `parent = ⌊(i−1)/2⌋`, `left = 2i+1`, `right = 2i+2`. | M |
| FR-4.2 | Nodes shall be positioned level by level; node radius shall shrink as the tree widens so nodes never overlap. | M |
| FR-4.3 | Each node shall show the triage level, a truncated name and its array index (`#i`), coloured by triage level. | S |
| FR-4.4 | Faint depth guides labelled `d0, d1, …` shall be drawn behind the tree. | C |
| FR-4.5 | The root shall carry a "NEXT" tag that follows it through animations. | S |
| FR-4.6 | Existing nodes shall **glide** to new positions instead of being recreated; edges shall stay attached by being redrawn from current animated positions and trimmed at both ends. | M |
| FR-4.7 | Newly inserted nodes shall fade in. | S |
| FR-4.8 | The array form shall be displayed as index-ordered chips below the tree, with the indices involved in the current step highlighted. | M |
| FR-4.9 | Comparing steps shall highlight nodes without moving them. | M |
| FR-4.10 | The SVG `viewBox` shall grow with the tree height so deep heaps remain visible. | S |

## 3.5 F5 — Live metrics and self-verification

| ID | Requirement | Pri |
|---|---|---|
| FR-5.1 | The system shall display: patients waiting, patients at level 1, patients treated. | S |
| FR-5.2 | The system shall display cumulative comparison and swap counts, incremented for every step of every insert/extract. | S |
| FR-5.3 | The system shall display a triage distribution bar segmented by level with a legend of counts, plus a text `aria-label` summary. | C |
| FR-5.4 | A heap-property badge shall verify, after every redraw, that each `arr[i]` is not more urgent than `arr[⌊(i−1)/2⌋]`, showing `✓ min-heap holds` or `⚠ order broken`. | S |
| FR-5.5 | Badge text shall not rely on colour alone. | S |

## 3.6 F6 — Step-by-step control

| ID | Requirement | Pri |
|---|---|---|
| FR-6.1 | Every mutating heap operation shall return an ordered step list with a human-readable message per step. | M |
| FR-6.2 | In automatic mode, steps shall play with per-type delays (compare shorter than swap) divided by the speed setting, never below 60 ms. | M |
| FR-6.3 | A short initial pause (~240 ms) shall let the "before" state paint so the first step is not invisible. | S |
| FR-6.4 | In step mode the operation shall pause at step 0; "Next step" shall execute exactly one step and update the description line. | M |
| FR-6.5 | A scrubber shall appear in step mode showing `current / total` and allow jumping to any step (0…total), reconstructing that intermediate array. | S |
| FR-6.6 | The description line shall name the patients/levels being compared or swapped. | M |
| FR-6.7 | Mode and step toggle shall be locked while an operation runs; controls shall re-enable when it finishes. | M |

## 3.7 F7 — Priority vs FIFO comparison

| ID | Requirement | Pri |
|---|---|---|
| FR-7.1 | A "Compare with FIFO" toggle shall show two columns: priority order (`#n`) and arrival order (arrival time) for the same patients. | S |
| FR-7.2 | The toggle state shall persist. | C |

## 3.8 F8 — Search / filter

| ID | Requirement | Pri |
|---|---|---|
| FR-8.1 | Typing in the search box shall filter cards by case-insensitive substring of name, ID or condition. | S |
| FR-8.2 | The count shall display `visible / total` while a filter is active. | S |
| FR-8.3 | A Clear button shall appear only when a filter is active and shall return focus to the input. | C |

## 3.9 F9 — In-place triage level editing

| ID | Requirement | Pri |
|---|---|---|
| FR-9.1 | Each waiting card shall carry a `<select>` of levels 1–5. | S |
| FR-9.2 | Changing it shall update the patient, rebuild the heap so the invariant holds, redraw with a glide, and announce the old and new level. | S |
| FR-9.3 | Keyboard focus shall return to the same picker after the re-render. | S |
| FR-9.4 | Selecting the current level shall be a no-op. | C |

## 3.10 F10 — Demo, clear and undo

| ID | Requirement | Pri |
|---|---|---|
| FR-10.1 | "Load demo patients" shall insert 10 predefined patients whose arrival order differs from priority order, with arrivals staggered 45 s apart. | S |
| FR-10.2 | "Clear all" shall empty the heap, the treated history and the ID counter, and reset the display. | M |
| FR-10.3 | Each completed action (register, treat, level change, demo load, clear) shall push a snapshot (`patients`, `treated`, `idCounter`, `stats`, `label`). | S |
| FR-10.4 | Undo shall restore the most recent snapshot and be limited to the last 30 snapshots. | S |
| FR-10.5 | Undo shall be disabled when the stack is empty or an operation is running, and shall say "Nothing to undo yet." when pressed empty. | S |
| FR-10.6 | Undo shall restore priority order exactly, without modifying `heap.js`. | S |

## 3.11 F11 — CSV export

| ID | Requirement | Pri |
|---|---|---|
| FR-11.1 | Export shall download a UTF-8 CSV (with BOM, CRLF line endings) named `pulseheap-YYYYMMDD-HHmm.csv`. | S |
| FR-11.2 | Columns: `Status, ID, Name, Age, Triage level, Triage name, Condition, Arrived, Waiting`. | S |
| FR-11.3 | Rows: waiting patients in priority order (waiting time computed at export), then treated patients in treatment order. | S |
| FR-11.4 | Values containing `,` `"` or newlines shall be quoted with doubled quotes. | S |
| FR-11.5 | Exporting an empty simulation shall not create a file; it shall report that there is nothing to export. | C |

## 3.12 F12 — Session persistence

| ID | Requirement | Pri |
|---|---|---|
| FR-12.1 | The system shall save patients, treated history, counter, stats, theme, FIFO, step mode and speed to `localStorage['pulseheap.v1']` after each completed action and settings change. | S |
| FR-12.2 | On load it shall restore that state and announce "restored your last session", or start empty if absent/invalid. | S |
| FR-12.3 | Restored patients shall be re-inserted in arrival order to rebuild an identical heap. | S |
| FR-12.4 | Restored records shall be validated field by field; malformed records shall be dropped. | S |
| FR-12.5 | If storage throws (quota/blocked), the app shall continue silently. | M |

## 3.13 F13 — Theme, tour, shortcuts, presentation

| ID | Requirement | Pri |
|---|---|---|
| FR-13.1 | A theme button shall switch light/dark, set `data-theme` on `<html>`, update `aria-pressed`, the button label and the `theme-color` meta. | S |
| FR-13.2 | Theme shall persist across reloads. | C |
| FR-13.3 | "Take the tour" shall show four coach marks (form, waiting list, heap panel, demo button) with Skip / Back / Next-Done; `Escape` shall close it. | S |
| FR-13.4 | Shortcuts: `D` demo, `T` treat, `U` undo, `E` export, `F` FIFO, `S` step mode, `/` search, `?` tour. | C |
| FR-13.5 | Shortcuts shall be inactive while typing in a field; `Escape` in a field shall blur it. | S |
| FR-13.6 | Printing shall produce a clean snapshot: controls, tour and buttons hidden. | C |
| FR-13.7 | An animation speed control (0.5×–2.5×) shall scale all delays and be persisted. | C |

## 3.14 F14 — Explanation and teaching content

| ID | Requirement | Pri |
|---|---|---|
| FR-14.1 | The page shall contain a "How this page works" section covering the stack, the heap idea, the click-to-animation flow, glossary tooltips and a complexity cost table. | S |
| FR-14.2 | Complexity badges (`insert O(log n)`, `remove O(log n)`, `peek O(1)`) shall be visible in the header. | C |
| FR-14.3 | `README.md` shall explain the stack, the file split, the algorithm, the step protocol, undo and typical viva questions in plain English. | S |
| FR-14.4 | `tools/dry-run.js` shall print the same heap operations in a terminal. | C |

## 3.15 F15 — Error handling and edge cases

| ID | Requirement | Pri |
|---|---|---|
| FR-15.1 | `extractMin()` on an empty heap shall return `{ patient: null, steps: [] }` and never throw. | M |
| FR-15.2 | `peek()` on an empty heap shall return `null`. | M |
| FR-15.3 | All patient/condition text shall be HTML-escaped before rendering. | M |
| FR-15.4 | An unexpected startup error shall be shown in the status region instead of failing silently. | S |
| FR-15.5 | All controls that mutate state shall be disabled while an operation animates. | M |
| FR-15.6 | Any in-flight animation frame/timer shall be cleared before starting a new one. | S |

---

# 4. External interface requirements

## 4.1 User interface

A single scrollable page in this order:

| Region | Content | Notes |
|---|---|---|
| Header | Logo, title, tagline, three complexity badges, theme toggle | Sticky-friendly, wraps on mobile |
| Status line | Live region (`role="status"`, `aria-live="polite"`) | Announces results and errors |
| Overview strip | 4 stat tiles + triage distribution bar and legend | Updates live |
| Toolbar | Demo, Undo, Export, Clear, FIFO, Step mode, Next step, Tour, Speed, shortcut hints, step text, scrubber | Buttons disabled during animation |
| Panel 1 | Register form | Errors under fields |
| Panel 2 | Waiting list (cards) + treated history | Scrollable list |
| Panel 3 | SVG tree, array chips, triage legend | Tree scales with panel |
| Explainer | Three cards, cost table, footer note | Static teaching content |
| Footer | Project one-liner | |

- Colours encode triage level consistently in cards, chips, tree nodes and edges;
  the level number is always printed as well, so meaning never depends on colour.
- Level 3 uses a darkened amber (`#ca8a04`) for text contrast on light backgrounds.
- The layout reflows to a single column on narrow screens.

## 4.2 Hardware interfaces

None. No camera, microphone, geolocation, Bluetooth or file-system access. The
only device interactions are keyboard/mouse/touch input and a browser download
for CSV export.

## 4.3 Software interfaces

| Interface | Direction | Usage |
|---|---|---|
| DOM / SVG DOM | read/write | All rendering; no framework virtual DOM. |
| `localStorage` | read/write | Key `pulseheap.v1`; JSON; failures swallowed. |
| `Blob` + `URL.createObjectURL` + `<a download>` | write out | CSV file download; URL revoked after 2 s. |
| `window.matchMedia` | read | `prefers-reduced-motion: reduce` disables travel and shortens waits. |
| `requestAnimationFrame` / `setTimeout` / `setInterval` | scheduling | Node gliding, step timing, 1 s waiting-time ticker. |
| Network APIs | **not used** | No fetch/XHR/WebSocket anywhere. |

## 4.4 Communication interfaces

None. The application is fully offline; there are no protocols, ports, API keys
or endpoints.

---

# 5. Non-functional requirements

## 5.1 Performance

| ID | Requirement |
|---|---|
| NFR-P.1 | Registration, treatment and level change shall complete in O(log n) heap work; the UI shall animate rather than block. |
| NFR-P.2 | Redrawing the tree + array + list for n ≤ 100 patients shall stay smooth (≤ 16 ms per frame budget on a typical laptop; drawing is O(n)). |
| NFR-P.3 | A step's visual pause shall be 60–560 ms depending on type and speed, so a 10-patient demo remains watchable. |
| NFR-P.4 | Waiting-time refresh shall update text nodes only (no list rebuild) once per second. |
| NFR-P.5 | Page load shall require no network requests and no build; all assets are local and small (inline SVG logos included). |

## 5.2 Reliability and robustness

| ID | Requirement |
|---|---|
| NFR-R.1 | No uncaught exceptions for any sequence of user actions, including empty-heap operations. |
| NFR-R.2 | Invalid or partial saved data shall be ignored without breaking startup. |
| NFR-R.3 | The heap invariant shall hold after every completed operation; it may be temporarily false mid-animation (and the badge reports that honestly). |
| NFR-R.4 | Repeated rapid clicks shall not start parallel operations or duplicate patients. |

## 5.3 Usability

| ID | Requirement |
|---|---|
| NFR-U.1 | A first-time visitor shall be able to load the demo and treat a patient without reading instructions. |
| NFR-U.2 | Every operation shall give immediate textual feedback in the status or step line. |
| NFR-U.3 | Empty states shall explain the next action rather than showing blank space. |
| NFR-U.4 | The interface shall explain itself in-place (explainer section, tooltips, tour). |

## 5.4 Accessibility

| ID | Requirement |
|---|---|
| NFR-A.1 | Interactive elements shall be native controls or have correct roles; lists use `role="list"`/`listitem`. |
| NFR-A.2 | A polite live region shall announce results; error messages use `role="alert"`. |
| NFR-A.3 | Focus shall be visible, moved to the first invalid field on validation failure, and returned to a sensible control after operations and tour dismissal. |
| NFR-A.4 | Meaning shall never depend on colour alone (level digits, badge text, `aria-label`s). |
| NFR-A.5 | `prefers-reduced-motion: reduce` shall remove travel animations and shorten pauses. |
| NFR-A.6 | A `prefers-contrast: more` block shall strengthen borders and text contrast. |
| NFR-A.7 | All form inputs shall have programmatic labels; the SVG shall carry an `aria-label`. |
| NFR-A.8 | Keyboard-only operation shall be possible for all functions (tab order, shortcuts, Escape). |

## 5.5 Maintainability and testability

| ID | Requirement |
|---|---|
| NFR-M.1 | `heap.js`, `tree.js` and `app.js` shall each be independently readable; `heap.js` shall be importable in Node without a browser. |
| NFR-M.2 | Code shall be commented with purpose, complexity and role of each function. |
| NFR-M.3 | The step protocol shall be documented in code and in `README.md` so new step types can be added in one place. |
| NFR-M.4 | Unit tests shall be runnable with `node heap.test.js` and exit non-zero on failure. |
| NFR-M.5 | No global namespace pollution beyond `MinHeap`, `comparePatients`, `sortPatients` and `HeapTree`. |

## 5.6 Portability and compatibility

| ID | Requirement |
|---|---|
| NFR-C.1 | Work from `file://` and `http://` alike. |
| NFR-C.2 | Work on Windows, macOS, Linux, iOS and Android browsers. |
| NFR-C.3 | Degrade gracefully where `localStorage` or `matchMedia` is missing (guarded access). |
| NFR-C.4 | No dependency on installed fonts; system font stack only. |

## 5.7 Security and privacy

| ID | Requirement |
|---|---|
| NFR-S.1 | No data shall leave the device; no analytics, cookies for tracking, or third-party requests. |
| NFR-S.2 | User input shall be escaped before HTML insertion (XSS defence). |
| NFR-S.3 | The app shall be presented as a simulation, not for real clinical decisions. |
| NFR-S.4 | CSV export shall be user-initiated only. |

## 5.8 Capacity

| ID | Requirement |
|---|---|
| NFR-CAP.1 | Support at least 100 patients comfortably; tree radius/height adapt automatically. |
| NFR-CAP.2 | Undo history capped at 30 snapshots to bound memory. |
| NFR-CAP.3 | Saved session shall stay well under typical `localStorage` quotas (5 MB) for hundreds of patients. |

---

# 6. Data requirements

## 6.1 Patient record

| Field | Type | Rule | Example |
|---|---|---|---|
| `id` | string | `P` + incrementing integer, unique per session | `"P4"` |
| `name` | string | 2–40 chars, letters/spaces/`'`/`.`/`-` | `"Maria Lopez"` |
| `age` | number | integer 0–120 | `67` |
| `condition` | string | 2–60 chars | `"Chest pain"` |
| `level` | number | 1–5 (1 most urgent) | `1` |
| `arrivalTime` | string | local clock `HH:MM:SS` | `"14:03:11"` |
| `arrivalTs` | number | epoch milliseconds, used for waiting time | `1732453391000` |
| `seq` | number | stamped by `heap.insert()`; arrival-order tie-break | `7` |

## 6.2 Treated-history record

| Field | Type | Meaning |
|---|---|---|
| `patient` | Patient | the extracted patient, unchanged |
| `waitedMs` | number | milliseconds between registration and treatment |
| `at` | string | treatment clock time `HH:MM:SS` |

## 6.3 Session record (`localStorage['pulseheap.v1']`)

```json
{
  "v": 1,
  "patients": [ { "id": "P1", "name": "...", "age": 0, "condition": "...",
                  "level": 1, "arrivalTime": "HH:MM:SS",
                  "arrivalTs": 0, "seq": 1 } ],
  "treated": [ { "patient": {}, "waitedMs": 0, "at": "HH:MM:SS" } ],
  "idCounter": 1,
  "stats": { "compares": 0, "swaps": 0 },
  "theme": "light",
  "fifo": false,
  "step": false,
  "speed": 1
}
```

Rules: unknown `v` → ignore whole record; each patient validated by
`isPatient()`; `idCounter` restored as `max(saved, patients.length)`;
`seq` uniqueness is preserved because `insert()` re-stamps during rebuild.

## 6.4 Exported CSV

```
Status,ID,Name,Age,Triage level,Triage name,Condition,Arrived,Waiting
Waiting,P3,Maria Lopez,67,1,Critical,Chest pain,14:03:11,2m 41s
Treated,P1,Noah Williams,19,5,Non-urgent,Sprained ankle,13:58:02,6m 3s
```

- Encoding: UTF-8 with BOM; line ending CRLF; comma-separated, quoted as needed.
- Waiting rows sorted by priority; treated rows in treatment order.
- `Waiting` for waiting patients is computed at export time.

## 6.5 Validation rules (single source of truth)

| Field | Empty | Invalid | Valid |
|---|---|---|---|
| Name | "Enter the patient name." | message about 2–40 letters/spaces/hyphens/apostrophes/periods | trimmed value stored |
| Age | "Enter the age." | "Age must be a whole number from 0 to 120." | stored as Number |
| Condition | "Enter a short condition." | "Keep it under 60 characters." | trimmed value stored |
| Level | "Choose a triage level (1–5)." | — (radios constrain input) | 1–5 |

## 6.6 Invariants that must always hold after a completed operation

| ID | Invariant |
|---|---|
| I-1 | `heap[i]` is not more urgent than `heap[⌊(i−1)/2⌋]` for all `i ≥ 1`. |
| I-2 | `heap.length` equals the number of waiting patients displayed. |
| I-3 | The waiting list is exactly `sortPatients(heap)` filtered by the search term. |
| I-4 | Array indices shown on tree nodes match the chip indices below. |
| I-5 | `seq` values are unique and strictly increase with arrival. |
| I-6 | Treated history contains each extracted patient exactly once. |

## 6.7 Data lifecycle

Created at registration → lives in memory and `localStorage` → removed at
treatment (moved to history) or "Clear all" → discarded when the browser's site
data is cleared. No copies exist anywhere else; the CSV is the only export.

---

# 7. System design (how the requirements are met)

## 7.1 Layered architecture

```
        ┌──────────────────────────────────────────────┐
        │  Presentation                                │
        │  index.html (semantic regions, ARIA, SVG)     │
        │  style.css  (design tokens, themes, motion)   │
        ├──────────────────────────────────────────────┤
        │  Application / controller                    │
        │  app.js                                      │
        │   form validation · state · step replay ·    │
        │   undo · persistence · CSV · tour · events   │
        ├──────────────────────────────────────────────┤
        │  View helper              │  Model           │
        │  tree.js                  │  heap.js         │
        │  array → SVG layout       │  MinHeap         │
        │  nodes, edges, guides     │  + step lists    │
        └──────────────────────────────────────────────┘
```

Dependency direction is strictly downward at load time
(`index.html` → `heap.js` → `tree.js` → `app.js`), and `heap.js` depends on
nothing. This satisfies TC-4 and makes each layer independently explainable.

## 7.2 Module responsibilities

| File | Responsibility | Public surface | Depends on |
|---|---|---|---|
| `heap.js` | The data structure and its ordering rules | `MinHeap` (`insert`, `extractMin`, `peek`, `size`, `heapifyUp`, `heapifyDown`, `toArray`, `clear`), `comparePatients`, `sortPatients` | nothing |
| `tree.js` | Draw any flat array as a binary tree | `HeapTree.init`, `.render(arr, ms)`, `.highlight` (Set), `.markNew(id)`, `.clearHighlight()`, `.refreshHighlight()` | DOM only |
| `app.js` | Everything the user does | none (IIFE, private) | `MinHeap`, `HeapTree`, DOM, `localStorage` |
| `style.css` | Visual system: tokens, layout, components, motion, dark theme, print, contrast, responsive | CSS custom properties | nothing |
| `index.html` | Structure and accessible names | DOM ids listed in `README.md` | CSS + three scripts |
| `heap.test.js` | 22 assertions over `heap.js` | console runner, exit code | `heap.js` |
| `tools/dry-run.js` | Terminal demonstration of the same operations | script | `heap.js` |

## 7.3 Core algorithms

**Insert — O(log n)**

```
seq ← ++counter                      # tie-break stamp
heap.push(p); i ← heap.length − 1
steps ← [insert step at i]
while i > 0:
    parent ← ⌊(i−1)/2⌋
    if compare(heap[i], heap[parent]) ≥ 0: record compare; stop
    record compare; swap(i, parent); record swap; i ← parent
```

**Extract minimum — O(log n)**

```
if heap empty: return {patient: null, steps: []}
removed ← heap[0]
if size = 1: pop; record remove-root; return removed
last ← heap.pop(); heap[0] ← last; record remove-root(removed, last)
i ← 0
loop:
    l ← 2i+1, r ← 2i+2, smallest ← i
    compare l with smallest → maybe smallest ← l
    compare r with smallest → maybe smallest ← r
    if smallest = i: stop
    swap(i, smallest); record swap; i ← smallest
```

**Comparison — O(1)**: `level` difference first, then `seq` difference. Because
`seq` is unique, the ordering is total and deterministic, so rebuilding by
re-inserting in `seq` order reproduces the identical heap (used by undo, level
edit and restore).

**Step replay (UI)**: the heap has already finished the operation, so its final
array and true cost are known. `app.js` keeps `preState`, applies each step to a
copy with `mutateState()`, redraws, and finally adopts `heap.toArray()`.

**Tree layout — O(n)**: for index `i`, `depth = ⌊log2(i+1)⌋`,
`first = 2^depth − 1`, `k = i − first`, `x = PAD + ((k+0.5)/2^depth)·(W−2·PAD)`,
`y = TOP + depth·rowH`; radius scales with slot width (9–20 px); `rowH` shrinks
with depth; viewBox height grows to fit.

**Glide animation**: nodes are keyed by patient ID in a `Map`; on re-render each
node's previous position is the start, the new layout is the target, and an
eased (cubic ease-out) `requestAnimationFrame` loop interpolates. Edges are
redrawn from live positions and trimmed by `r + 6` so they never pierce circles.

**FLIP on the waiting list**: record each card's `top`, rebuild the list, then
translate every moved card back to its old `top` and release it on the next frame
(0.42 s cubic-bezier), while the new card is placed at a computed `--travel`
offset and rises to its rank.

## 7.4 UI state machine

```
IDLE ──register / treat / level-change──► BUSY(automatic)
IDLE ──register / treat (step mode on)──► PAUSED(step 0)
PAUSED ──Next step──► PAUSED(step k+1) ──last step──► SETTLING ──► IDLE
PAUSED ──scrubber──► PAUSED(any k)
BUSY ──all steps played──► IDLE (adopt real heap, save, focus restored)
BUSY/PAUSED ──mode or structural buttons disabled──
```

Undo, demo, clear and level editing are **synchronous** (no step replay) because
they are bulk setup rather than a single heap operation.

## 7.5 Complexity summary

| Operation | Structure cost | Why |
|---|---|---|
| `peek` | O(1) | root is index 0 |
| `insert` | O(log n) | at most one swap per level on one root path |
| `extractMin` | O(log n) | move last leaf to root + one sink path |
| `sortPatients` (view only) | O(n log n) | display helper, not part of the heap |
| Tree render | O(n) | one position per node, one line per edge |
| Undo / restore rebuild | O(n log n) | n inserts in arrival order |
| Level change | O(n log n) worst case | rebuild for a mid-heap key change (simplicity over a decrease-key) |

## 7.6 Traceability of the step protocol

`heap.js` step objects → `app.js` consumers:

| Step | Payload | UI effect |
|---|---|---|
| `insert` | `index`, `value`, `message` | push into replay array, fade node in, make card rise |
| `remove-root` | `removed`, `moved`, `message` | drop root, move last node to index 0 |
| `compare` | `i`, `j`, `message` | highlight two nodes/chips, no movement |
| `swap` | `i`, `j`, `message` | exchange replay entries, glide nodes |

Counters are incremented once per step at operation start, so "work done" is
exact even when a user scrubs backwards.

---

# 8. What has been developed

This section is the complete delivered-scope inventory: features, files, and the
mapping from each requirement to where it lives.

## 8.1 Delivered feature inventory

| Area | Delivered |
|---|---|
| Data structure | Hand-written binary min-heap on a plain array; `insert`, `extractMin`, `peek`, `size`, `heapifyUp`, `heapifyDown`, `toArray`, `clear`; total order via `(level, seq)`; step lists for every mutation. |
| Simulation | Registration form with four validated fields; treat-next; clear-all; demo data of 10 patients; in-place level editing; search filter. |
| Waiting list | Priority-ordered cards (chip, name, ID, age, condition, arrival clock, rank, live wait time, level picker); FLIP gliding; new card rises to its rank; `visible / total` count; empty and no-match states. |
| Tree visualisation | SVG binary tree with adaptive radius/row height, depth guides `d0…`, array index labels, triage colours, "NEXT" tag on the root, node gliding, fade-in for new nodes, trimmed edges, dashed highlight ring. |
| Array view | Index chips with level + truncated name, active indices highlighted in sync with the tree. |
| Teaching tools | Step-by-step mode with Next-step button; scrubber `k / total` with intermediate-state reconstruction; per-step description line; comparisons/swaps counters; triage distribution bar; live heap-property badge (`✓ / ⚠`); FIFO vs priority columns; guided tour (4 steps); glossary tooltips; cost table; in-page explainer; README walkthrough; terminal dry-run. |
| Convenience | Undo (30 levels); CSV export (BOM, CRLF, quoting, timestamped name); session persistence (patients, treated, counters, theme, modes, speed); dark mode; animation speed 0.5×–2.5×; keyboard shortcuts; print styles. |
| Accessibility | Live status/step regions, `role="alert"` errors, `aria-invalid`, labelled inputs, list roles, visible focus, focus management after validation/operations/tour, text equivalents for colour, `prefers-reduced-motion`, `prefers-contrast`, keyboard-only operation. |
| Quality | 22-assertion unit test suite; terminal dry-run; guarded storage; escaped user text; error surfaced on page if startup fails; comments explaining purpose and complexity. |

## 8.2 File inventory

| File | Role | Runtime |
|---|---|---|
| `index.html` | Page structure, ARIA, SVG canvas, explainer | Browser |
| `style.css` | Design tokens, layout, components, motion, dark theme, print, contrast, responsive | Browser |
| `heap.js` | `MinHeap` + comparator (pure data) | Browser + Node |
| `tree.js` | Array → SVG tree drawing (pure view) | Browser |
| `app.js` | State, validation, step replay, undo, storage, CSV, tour, events | Browser |
| `heap.test.js` | Unit tests | Node |
| `tools/dry-run.js` | Terminal demonstration of insert/remove/tie-break | Node |
| `static/logo.svg`, `static/favicon.svg` | Branding assets | Browser |
| `README.md` | Plain-English stack/code walkthrough, features, viva notes | — |
| `SRS.md` | This specification | — |

Load order in `index.html`: `heap.js` → `tree.js` → `app.js` (dependency order;
no modules, so `file://` works).

## 8.3 Requirement → implementation traceability

| Requirement group | Primary implementation |
|---|---|
| FR-1.x registration, validation | `app.js: validateForm`, `resetForm`, `makePatient`, `startInsert`, submit handler |
| FR-2.x ordering, waiting list, rise animation | `heap.js: comparePatients`, `insert`; `app.js: renderWaiting`, `patientCard`, `glideCard`, `waitingKey`, `arrivingId`; `style.css: .card--arriving` |
| FR-3.x treat, history | `heap.js: extractMin`; `app.js: treatNext`, `renderTreated` |
| FR-4.x tree + array | `tree.js: computeLayout`, `createNodeGroup`, `moveNodesTo`, `syncEdges`, `render`; `app.js: renderArray` |
| FR-5.x metrics, badge | `app.js: renderStats`, `updateHeapMeta`, `heapHolds` |
| FR-6.x steps, scrubber | `heap.js` step lists; `app.js: startOperation`, `applyStep`, `autoTick`, `runOneStep`, `jumpToStep`, `stateAfter`, `updateScrub`, `mutateState` |
| FR-7.x FIFO | `app.js: toggleFifo`, `renderWaiting` (compare columns) |
| FR-8.x search | `app.js: matchesSearch`, search handlers |
| FR-9.x level edit | `app.js: levelSelect`, `changeLevel`, `rebuildHeap` |
| FR-10.x demo/clear/undo | `app.js: DEMO_PATIENTS`, `loadDemo`, `resetAll`, `snapshot`, `pushHistory`, `undo` |
| FR-11.x CSV | `app.js: csvCell`, `exportCsv` |
| FR-12.x persistence | `app.js: save`, `restore`, `isPatient`, `bySeq`, `rebuildHeap` |
| FR-13.x theme/tour/shortcuts/print | `app.js: applyTheme`, `TOUR_STEPS`, `startTour`, `onKeyDown`; `style.css` theme/print blocks |
| FR-14.x teaching content | `index.html` explainer; `README.md`; `tools/dry-run.js` |
| FR-15.x edge cases/errors | `heap.js` guards; `app.js: escapeHtml`, `try/catch` around `init`, `updateControls` |
| NFR-A.x accessibility | `index.html` roles/labels; `app.js` focus management and live regions; `style.css` focus-visible, contrast, reduced-motion |
| NFR-C.x portability | plain scripts, no network, guarded `localStorage`/`matchMedia` |

## 8.4 Verification performed

| Check | Command / method | Result |
|---|---|---|
| Syntax of all scripts | `node --check heap.js`, `tree.js`, `app.js`, `tools/dry-run.js` | Pass |
| Heap correctness | `node heap.test.js` | 22 passed, 0 failed |
| Heap walkthrough without a browser | `node tools/dry-run.js` | Steps printed as expected |
| Demo render | 10 cards, 10 nodes, 9 edges, 4 depth guides | Pass |
| Stats and distribution | 10 waiting, 2 critical, 5 segments, correct counts | Pass |
| Heap badge | `✓ min-heap holds` before/after operations | Pass |
| Filter | "Maria" → `1 / 10` | Pass |
| Level edit | Re-sorts, badge still holds | Pass |
| Undo | Restores counts and order | Pass |
| Dark mode | `<html data-theme="dark">`, background `rgb(10,17,32)` | Pass |
| Tour | Step 1 → 2 works; Escape closes | Pass |
| Step mode + scrubber | Paused at `0 / 11`; jumping to last step shows 9 nodes; Next finishes with 1 treated, 7 compares, 3 swaps | Pass |
| New critical patient animation | Card plays `card-rise`, `--travel: 300px` | Pass |
| Console | No errors or warnings | Pass |

**Not verified (honest gaps):** visual review at every breakpoint and in every
target browser; the exact bytes of a downloaded CSV opened in Excel; behaviour
with storage disabled in every browser. These are low-risk and easy to confirm
manually (Section 9.3).

## 8.5 Requirements coverage

- All **M** (must) and **S** (should) requirements in Section 3 are implemented.
- All **C** (could) requirements listed are implemented as well; nothing in this
  document is aspirational except Section 10.

---

# 9. Acceptance criteria and demo script

## 9.1 Definition of done

The system is accepted when, on a clean browser profile:

1. `index.html` opens with no console errors and shows the empty states.
2. "Load demo patients" produces 10 waiting patients, 10 tree nodes, a holding
   badge and a filled distribution bar.
3. Registering a level-1 patient shows the card rising to rank 1, the root
   showing that patient, and the array chip at index 0 matching.
4. "Treat next" removes the root, the tree re-forms while sinking, and the
   patient appears in the treated history with a waiting time.
5. Step mode plus the scrubber can replay any insert/extract from step 0 to the
   end, with the description line naming each comparison and swap.
6. Undo reverses the last action; the CSV exports the same patients the page shows.
7. Refreshing restores the session; the theme choice survives too.
8. `node heap.test.js` exits 0 with 22 passes.

## 9.2 Five-minute demo script (for the viva)

1. **Open the page.** "No server, no build, no library — this is plain HTML, CSS
   and JavaScript. `heap.js` is the data structure, `tree.js` draws it, `app.js`
   runs the page."
2. **Load demo patients.** "Ten patients arrive in one order; the heap orders
   them by triage level. The tree is the array below it."
3. **Register a critical patient.** "Watch the card rise to #1 and the tree
   bubble it up — that is `heapifyUp`, one path, O(log n). The comparison and
   swap counters count the work."
4. **Turn on Step-by-step, press Treat next.** "The last leaf moves into the root
   slot, then sinks down — `heapifyDown`. The badge reports the property: it can
   dip to 'order broken' mid-sink and heal, which is the invariant proving itself."
5. **Drag the scrubber.** "Every intermediate state is reproducible; the algorithm
   is deterministic."
6. **Toggle FIFO.** "Arrival order would treat a sprained ankle before chest pain.
   That is the motivation for a priority queue."
7. **Undo / Export / Refresh.** "Undo replays snapshots; export is a real CSV;
   the session is remembered in this browser. Nothing is sent anywhere."

## 9.3 Manual checks still worth doing

- Resize to 360 px and 1440 px; confirm the toolbar wraps and the tree stays legible.
- Repeat the tour and keyboard shortcuts in Firefox and Safari.
- Open an exported CSV in Excel and confirm the columns and the `Waiting` values.
- Test in a private window where storage is blocked; the page must still work.

---

# 10. Known limitations and future enhancements

## 10.1 Known limitations (accepted for this project)

1. **Level change is O(n log n).** Changing a key mid-heap rebuilds the heap
   instead of implementing `decrease-key`/`increase-key`; chosen for clarity.
2. **In-memory sessions only.** Data lives in one browser profile; there is no
   account, sync or backup. Clearing site data deletes it.
3. **No multi-tab synchronisation.** Two tabs keep separate state and overwrite
   each other on save.
4. **The waiting list is a sorted *view*, not the heap.** Its order differs from
   the tree/array on purpose (readability), which must be explained in a demo.
5. **Animation cost.** Very large heaps (hundreds of nodes) will draw crowded
   labels; the radius shrinks but readability has limits.
6. **Not a medical tool.** Triage levels are simulated; no clinical rules,
   audit trail or authentication.
7. **ES5-style code.** Written with `var`/IIFE for maximum browser and
   `file://` compatibility rather than modern module syntax.
8. **Waiting times depend on the device clock**; changing the clock changes them.

## 10.2 Possible future work

- `decrease-key` with an index map so a level change costs O(log n).
- A "compare with other structures" panel (unsorted array, sorted array, BST)
  counting operations for the same input sequence.
- Heap-sort demonstration mode that extracts everything and lists the result.
- Import patients from CSV (mirror of the export).
- A recorded GIF/video export of an operation for reports.
- Optional server persistence and multi-device sync (out of scope now by design).

---

# 11. Appendices

## 11.1 Glossary in plain English

- **Min-heap:** a tree-shaped queue where the most urgent patient is always at
  the top, so "who is next?" is instant.
- **Bubble up:** a newly arrived patient walks forward past less urgent patients.
- **Sink down:** the last patient steps into the front spot and walks back until
  correctly placed.
- **Complete tree:** every level is full except possibly the last, filled left to
  right — this is why an array can hold it with no pointers.
- **Heap property:** every parent is at least as urgent as its children. The
  badge on the page checks it continuously.
- **O(log n):** the work grows with the *height* of the tree, not the number of
  patients. 1,000 patients ≈ 10 steps.

## 11.2 Likely viva questions and short answers

| Question | Answer |
|---|---|
| Why a heap rather than a sorted array? | Peek is O(1) in both, but insert/remove are O(log n) in a heap versus O(n) shifting in a sorted array. |
| Why a **min**-heap? | The smallest key must be served first, and triage level 1 is the most urgent. |
| Why store it in an array? | A complete tree has no gaps, so parent/child links are arithmetic: `⌊(i−1)/2⌋`, `2i+1`, `2i+2`. |
| How are ties handled? | An arrival counter `seq` stamped at insert; equal levels are served strictly first-come-first-served. |
| Why move the last node to the root on removal? | It keeps the tree complete, so the height — and therefore the cost — stays logarithmic. |
| Where is the animation coming from? | The heap returns a step list; the UI replays it on an array snapshot and redraws after each step. |
| How is correctness shown, not just claimed? | 22 unit assertions, the live heap-property badge, and a deterministic step replay. |
| Why is there no framework? | The point is to demonstrate the data structure; the app is small enough that plain JS is clearer. |
| How does undo work without touching the heap? | Snapshots are re-inserted in arrival order; because the comparator only uses `level` and `seq`, the identical heap is reproduced. |
| What happens on an empty queue? | `extractMin()` returns `{patient: null, steps: []}` and the UI says "No patients waiting — nothing to treat." |

## 11.3 Document history

| Version | Date | Change |
|---|---|---|
| 1.0 | 24 Nov 2026 | Initial as-built SRS covering all implemented features, data, design, traceability and verification. |

---

*End of Software Requirements Specification.*
