This suite contains five headless harnesses that drive the REAL `src/` modules against a stubbed DOM and the vendored three.js. They cover player movement and bounds, hand geometry, and heap growth (`run.mjs`); all 13 menu recipes played through the real input path and scored, plus retained-payload isolation across handoffs (`menu.mjs`); syrup meter targeting, including the empty-steps fallback (`syrup.mjs`); foam disambiguation between Latte, Flat White, and Cappuccino queued simultaneously (`foam.mjs`); and the full touch/virtual-stick input path, including a 1800-frame stick sweep, 12000 fuzzed malformed events, and keyboard parity (`play2-touch.mjs`).

## Running

From the repository root, run:

```sh
node test/run-all.mjs
```

To run a single harness, use:

```sh
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --import ./test/loader.mjs ./test/run.mjs
```

`--disable-warning=MODULE_TYPELESS_PACKAGE_JSON` is optional and only silences Node's typeless-package warning for the `src/` files (the repo has no root `package.json` by design), while `--import` is required.

## Gotchas

1. The `--import ./test/loader.mjs` flag is mandatory when invoking a harness directly. `loader.mjs` installs a `node:module` resolve hook that maps the bare `three` specifier and `three/addons/` to `vendor/`. Without it the bare specifier does not resolve and the harness dies on its first import. There is no `node_modules` and none should be added.
2. `touchLookSensitivity` in `src/player/controls.js` (currently `0.0042`) is hard-coded into two assertions in `play2-touch.mjs`: `input:look turns the camera with no pointer lock` (line 81) and `dragging the bare canvas looks around` (line 346). Retuning that constant for real-device feel will fail both checks until the expected numbers in those two lines move with it.
3. Do not use bare `node --test`. Node's test runner auto-discovers every file under a `test/` directory and would run each harness without the loader, so they all fail on the `three` import. Use `run-all.mjs`.
