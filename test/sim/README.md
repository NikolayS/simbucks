# Simulation diagnostics

These are hand-run diagnostics for `src/game/{menu,orders,state,customers}.js`. They are deliberately not registered in `test/run-all.mjs`; that suite stays at its existing nine harnesses.

From this directory, run `sh build.sh` first before `geo.mjs`, `sim.mjs`, or `slots.mjs`. Those three need the generated `customers.sim.js` artifact. The other diagnostics run standalone from the repository root with `node test/sim/<file>`.

- `geo.mjs` — Runs a whole shift and asserts geometry: illegal rail-A crossings (gap-aware), frames behind the counter, inside the merch shelf or below the floor, non-finite transforms, person-pool recycling, shift restart, and `dispose()` followed by stray bus events.
- `sim.mjs` — Sweeps build times 18/24/28/34/45/60 seconds across three seeds, reporting served, lost split by walk-out versus queue-abandon, money, tips, rep, rank, and end time. `TRAINING=1` toggles training mode. Re-run after changing patience, flight sizes, trickle interval, or queue tolerance.
- `t.mjs` — Checks 13 perfect builds, the 13x13 drink confusion matrix, and error cases.
- `foam-matrix.mjs` — Runs the additivity guard twice, simulating `stations.js` without and with the foam selector. Without foam it expects exactly six false positives (the documented Latte/Flat White/Cappuccino ties); with foam it expects zero, with the diagonal intact both times.
- `fuzz.mjs` — Sends 252 order-by-built null and garbage combinations through `scoreOrder`, 72 through `makeOrder`, and checks determinism. Because `stations.js` calls `scoreOrder` speculatively against every pending ticket, it must remain a total function.
- `trim.mjs` — Checks that the foam clause and `— for <NAME>` suffix survive every ticket trim level.
- `text.mjs` — Checks that no foam-bearing ticket loses its aeration instruction; the wand defaults to MICRO, so such a ticket would be unbuildable.
- `clock.mjs` — Diagnoses the displayed shift clock, shift duration, and end summary.
- `slots.mjs` — Diagnoses pickup-slot occupancy and merch-shelf intrusion under a backed-up queue.
- `n.mjs` — Diagnoses pickup-slot derivation from the current layout boundaries.
- `edge.mjs` — Exercises the three built-drink resolution paths: empty ticket steps, a drink object, and a drink ID.
- `dbg.mjs` — Prints deterministic generated-order scoring through the built-drink object path for spot-checking score, tip, payout, and notes.
